// `npx specdiff-cli a b`: serve the built app on 127.0.0.1 and open it with both files loaded.
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import open from 'open';
import sirv from 'sirv';
import type { Input } from './inputs';

export async function serveLocal(before: Input, after: Input, opts: { open: boolean; port?: number }): Promise<string> {
  const appDir = join(dirname(fileURLToPath(import.meta.url)), 'app');
  if (!existsSync(join(appDir, 'index.html'))) throw new Error('The bundled app is missing. Build specdiff-cli with `pnpm build` first.');
  const token = randomBytes(16).toString('hex');
  const session = JSON.stringify({ before: { name: before.name, content: before.content, files: before.files }, after: { name: after.name, content: after.content, files: after.files } });
  const statics = sirv(appDir, { single: true, dev: false, etag: true });
  const server = createServer((req, res) => {
    if (req.url === `/__specdiff/${token}.json`) {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(session);
      return;
    }
    if (req.url === '/' ) { res.writeHead(302, { location: '/app/' }); res.end(); return; }
    req.url = (req.url ?? '/').replace(/^\/app/, '') || '/';
    statics(req, res, () => { res.writeHead(404); res.end('Not found'); });
  });
  await new Promise<void>((r) => server.listen(opts.port ?? 0, '127.0.0.1', r));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const url = `http://127.0.0.1:${port}/app/?local=${token}`;
  if (opts.open) await open(url);
  return url;
}
