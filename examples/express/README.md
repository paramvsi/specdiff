# Express and Fastify example

Serves the Specdiff Viewer at `/docs` for `fixtures/samples/payments-v2.yaml`, compared with `payments-v1.yaml`.

Build the Viewer bundle first, then run from the repository root:

```sh
pnpm --filter @specdiff/embed build
node examples/express/server.mjs      # plain node:http, mounted like Express
node examples/express/fastify.mjs     # Fastify plugin
```

Open http://127.0.0.1:3000/docs/. Set `PORT` to use another port.

## Express

In your own app (`npm install @specdiff/express express`):

```js
import express from 'express';
import { specdiff } from '@specdiff/express';

const app = express();
app.use('/docs', specdiff({
  spec: './openapi.yaml',
  compareWith: './openapi-1.5.yaml', // optional: adds change badges and "What changed"
  title: 'Payments API',
}));
app.listen(3000);
```

`server.mjs` does the same with `node:http`, because Express is not a dependency of this repository: it strips
`/docs` from `req.url` and keeps the full URL in `req.originalUrl`, as `app.use('/docs', …)` does.

## Fastify

```js
import Fastify from 'fastify';
import { specdiffFastify } from '@specdiff/express';

const app = Fastify();
await app.register(specdiffFastify, { prefix: '/docs', spec: './openapi.yaml' });
await app.listen({ port: 3000 });
```

`fastify.mjs` loads `fastify` from `packages/express`, where it is a dev dependency.

## Notes

- The examples import `packages/express/src/index.ts` directly; Node 26 strips the types.
- `assetsDir` points at `packages/embed/dist`. In an installed app you can leave it out: it defaults to the
  `dist` folder of `@specdiff/embed`.
- The spec is read from disk and served by your server. Nothing is uploaded.
- `e2e/express.spec.ts` starts `server.mjs` and checks the page in a browser.
