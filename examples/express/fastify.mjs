// The same Viewer at /docs with Fastify and the specdiffFastify plugin.
// fastify is a dev dependency of packages/express, so it is loaded from there.
// Run from the repository root:  node examples/express/fastify.mjs   (PORT=3000 by default)
// Needs packages/embed/dist:     pnpm --filter @specdiff/embed build
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
// Node 26 strips the types from this .ts file. In your own app: import { specdiffFastify } from '@specdiff/express'.
import { specdiffFastify } from '../../packages/express/src/index.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(`${root}packages/express/package.json`);
const Fastify = require('fastify');

const app = Fastify();
await app.register(specdiffFastify, {
  prefix: '/docs',
  spec: `${root}fixtures/samples/payments-v2.yaml`,
  compareWith: `${root}fixtures/samples/payments-v1.yaml`,
  title: 'Payments API',
  assetsDir: `${root}packages/embed/dist`,
});

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '127.0.0.1' });
console.log(`Specdiff Viewer at http://127.0.0.1:${port}/docs/`);
