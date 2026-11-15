// Serves the Specdiff Viewer at /docs with plain node:http, mounted the way Express mounts middleware:
// the /docs prefix is stripped from req.url and the full URL is kept in req.originalUrl.
// Run from the repository root:  node examples/express/server.mjs   (PORT=3000 by default)
// Needs packages/embed/dist:     pnpm --filter @specdiff/embed build
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
// Node 26 strips the types from this .ts file. In your own app: import { specdiff } from '@specdiff/express'.
import { specdiff } from '../../packages/express/src/index.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));

const docs = specdiff({
  spec: `${root}fixtures/samples/payments-v2.yaml`,
  compareWith: `${root}fixtures/samples/payments-v1.yaml`,
  title: 'Payments API',
  assetsDir: `${root}packages/embed/dist`,
});

const PREFIX = '/docs';
const notFound = (res) => { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found'); };

const server = createServer((req, res) => {
  const url = req.url ?? '/';
  if (url !== PREFIX && !url.startsWith(`${PREFIX}/`) && !url.startsWith(`${PREFIX}?`)) return notFound(res);
  // What app.use('/docs', handler) does in Express.
  req.originalUrl = url;
  req.url = url.slice(PREFIX.length) || '/';
  if (req.url.startsWith('?')) req.url = `/${req.url}`;
  docs(req, res, () => notFound(res));
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, '127.0.0.1', () => {
  console.log(`Specdiff Viewer at http://127.0.0.1:${port}${PREFIX}/`);
});
