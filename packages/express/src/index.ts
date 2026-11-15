// @specdiff/express (PK-06): serve the Specdiff Viewer from Express or Fastify, e.g. at /docs.
// A plain (req, res, next) handler, so Express is only a peer dependency; Fastify gets a small plugin.
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join } from 'node:path';

export interface SpecdiffOptions {
  /** Path to the OpenAPI file (YAML or JSON), or the document itself. */
  spec: string | object;
  /** Optional older version to compare with: file path or document. */
  compareWith?: string | object;
  title?: string;
  theme?: 'light' | 'dark' | 'system';
  brand?: { color?: string; logo?: string; name?: string };
  /** Where the built embed bundle lives. Defaults to @specdiff/embed's dist. */
  assetsDir?: string;
}

type Next = (err?: unknown) => void;
export type Handler = (req: IncomingMessage, res: ServerResponse, next?: Next) => void;

const TYPES: Record<string, string> = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.yaml': 'application/yaml; charset=utf-8', '.yml': 'application/yaml; charset=utf-8', '.html': 'text/html; charset=utf-8', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };

function defaultAssets(): string {
  const req = createRequire(import.meta.url);
  try { return join(dirname(req.resolve('@specdiff/embed/package.json')), 'dist'); }
  catch { return join(dirname(req.resolve('@specdiff/embed')), '.'); }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function page(title: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)}</title>
    <link rel="stylesheet" href="assets/specdiff-embed.css" />
  </head>
  <body>
    <div id="specdiff"></div>
    <script src="assets/specdiff-embed.js"></script>
    <script src="boot.js"></script>
  </body>
</html>
`;
}

const BOOT = `fetch('config.json').then(function (r) { return r.json(); }).then(function (c) {
  window.Specdiff.mount(document.getElementById('specdiff'), { url: new URL(c.url, location.href).toString(), compareWith: c.compareWith ? new URL(c.compareWith, location.href).toString() : undefined, theme: c.theme, brand: c.brand });
});
`;

function docOf(s: string | object): { body: string; type: string } {
  if (typeof s !== 'string') return { body: JSON.stringify(s), type: TYPES['.json']! };
  return { body: readFileSync(s, 'utf8'), type: TYPES[extname(s).toLowerCase()] ?? TYPES['.yaml']! };
}

export function specdiff(opts: SpecdiffOptions): Handler {
  const assets = opts.assetsDir ?? defaultAssets();
  const ext = (s: string | object) => (typeof s === 'string' ? extname(s).toLowerCase() || '.yaml' : '.json');
  const specName = `openapi${ext(opts.spec)}`;
  const prevName = opts.compareWith ? `openapi-previous${ext(opts.compareWith)}` : undefined;
  const config = JSON.stringify({ url: specName, ...(prevName ? { compareWith: prevName } : {}), ...(opts.theme ? { theme: opts.theme } : {}), ...(opts.brand ? { brand: opts.brand } : {}) });
  const headers = { 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https: http:; font-src 'self'" };

  return (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://x');
    let path = decodeURIComponent(url.pathname);
    const send = (status: number, type: string, body: string | Buffer) => { res.writeHead(status, { 'content-type': type, 'cache-control': 'no-cache', ...headers }); res.end(body); };
    if (req.method !== 'GET' && req.method !== 'HEAD') return next ? next() : send(405, 'text/plain', 'Method not allowed');
    // Mounted at /docs, Express strips the prefix; make relative URLs resolve under it.
    const orig = (req as IncomingMessage & { originalUrl?: string }).originalUrl ?? req.url ?? '/';
    if (path === '/' && !new URL(orig, 'http://x').pathname.endsWith('/')) { res.writeHead(301, { location: `${new URL(orig, 'http://x').pathname}/${url.search}` }); res.end(); return; }
    if (path === '/' || path === '/index.html') return send(200, TYPES['.html']!, page(opts.title ?? 'API reference'));
    if (path === '/boot.js') return send(200, TYPES['.js']!, BOOT);
    if (path === '/config.json') return send(200, TYPES['.json']!, config);
    if (path === `/${specName}`) { const d = docOf(opts.spec); return send(200, d.type, d.body); }
    if (prevName && opts.compareWith && path === `/${prevName}`) { const d = docOf(opts.compareWith); return send(200, d.type, d.body); }
    if (path.startsWith('/assets/')) {
      path = path.slice('/assets/'.length);
      if (path.includes('..') || path.includes('\0')) return send(400, 'text/plain', 'Bad path');
      const file = join(assets, path);
      if (existsSync(file) && statSync(file).isFile()) {
        res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'public, max-age=3600', ...headers });
        createReadStream(file).pipe(res);
        return;
      }
    }
    return next ? next() : send(404, 'text/plain', 'Not found');
  };
}

/** Fastify plugin: `fastify.register(specdiffFastify, { prefix: '/docs', spec: './openapi.yaml' })`. */
export async function specdiffFastify(fastify: { get: (path: string, h: (req: { raw: IncomingMessage }, reply: { raw: ServerResponse; hijack: () => void }) => void) => void }, opts: SpecdiffOptions & { prefix?: string }) {
  const handler = specdiff(opts);
  const serve = (req: { raw: IncomingMessage }, reply: { raw: ServerResponse; hijack: () => void }) => {
    reply.hijack();
    const prefix = opts.prefix ?? '';
    const raw = req.raw;
    const rest = (raw.url ?? '/').slice(prefix.length) || '/';
    const proxied = Object.assign(Object.create(raw) as IncomingMessage, { url: rest, originalUrl: raw.url });
    handler(proxied, reply.raw, () => { reply.raw.writeHead(404); reply.raw.end('Not found'); });
  };
  fastify.get('/', serve);
  fastify.get('/*', serve);
}
