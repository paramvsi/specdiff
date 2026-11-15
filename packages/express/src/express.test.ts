import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { specdiff } from './index';

let server: Server;
let base = '';
beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'specdiff-express-'));
  writeFileSync(join(dir, 'openapi.yaml'), 'openapi: 3.1.0\ninfo: { title: T, version: 2.0.0 }\npaths: {}\n');
  writeFileSync(join(dir, 'specdiff-embed.js'), 'window.Specdiff={mount(){}}');
  const h = specdiff({ spec: join(dir, 'openapi.yaml'), compareWith: { openapi: '3.1.0', info: { title: 'T', version: '1.0.0' }, paths: {} }, title: '<T>', assetsDir: dir });
  // Simulate Express mounting at /docs: strip the prefix, keep originalUrl.
  server = createServer((req, res) => {
    if (!req.url?.startsWith('/docs')) { res.writeHead(404); res.end(); return; }
    Object.assign(req, { originalUrl: req.url, url: req.url.slice(5) || '/' });
    h(req, res, () => { res.writeHead(404); res.end('next'); });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => server.close());

it('redirects /docs to /docs/ and serves the page without inline script', async () => {
  const r = await fetch(`${base}/docs`, { redirect: 'manual' });
  expect(r.status).toBe(301);
  expect(r.headers.get('location')).toBe('/docs/');
  const html = await (await fetch(`${base}/docs/`)).text();
  expect(html).toContain('<title>&#60;T&#62;</title>');
  expect(html).not.toMatch(/<script>(?!<\/script>)/);
});

it('serves config, the spec, the previous version and assets', async () => {
  expect(await (await fetch(`${base}/docs/config.json`)).json()).toEqual({ url: 'openapi.yaml', compareWith: 'openapi-previous.json' });
  expect(await (await fetch(`${base}/docs/openapi.yaml`)).text()).toContain('version: 2.0.0');
  expect((await (await fetch(`${base}/docs/openapi-previous.json`)).json()).info.version).toBe('1.0.0');
  expect(await (await fetch(`${base}/docs/assets/specdiff-embed.js`)).text()).toContain('Specdiff');
});

it('refuses path traversal and passes unknown paths on', async () => {
  expect((await fetch(`${base}/docs/assets/..%2F..%2Fetc%2Fpasswd`)).status).toBe(400);
  expect(await (await fetch(`${base}/docs/nope`)).text()).toBe('next');
});
