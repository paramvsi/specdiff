# @specdiff/express

Serves the Specdiff Viewer from an Express or Fastify app, for example at `/docs`. It serves a small HTML page, your spec file, and the Viewer bundle from `@specdiff/embed`. A plain `(req, res, next)` handler, so Express and Fastify are optional peer dependencies.

Nothing is uploaded. Your server reads the spec from disk and serves it to the reader's browser, which renders it.

## Install

```sh
npm install @specdiff/express
```

## Express

```js
import express from 'express';
import { specdiff } from '@specdiff/express';

const app = express();
app.use('/docs', specdiff({ spec: './openapi.yaml', compareWith: './openapi-1.5.yaml' }));
app.listen(3000);
```

## Fastify

```js
import Fastify from 'fastify';
import { specdiffFastify } from '@specdiff/express';

const app = Fastify();
await app.register(specdiffFastify, { prefix: '/docs', spec: './openapi.yaml' });
await app.listen({ port: 3000 });
```

Open `/docs/`. `/docs` redirects there so relative URLs resolve.

A runnable example is in [`examples/express`](../../examples/express/README.md).

## Options

| Option | Type | |
|---|---|---|
| `spec` | `string \| object` | Required. Path to the OpenAPI file (YAML or JSON), or the document itself |
| `compareWith` | `string \| object` | An older version: path or document. Adds change badges and "What changed" |
| `title` | `string` | Page title. Default "API reference" |
| `theme` | `'light' \| 'dark' \| 'system'` | |
| `brand` | `{ color?, logo?, name? }` | |
| `assetsDir` | `string` | Folder with the built Viewer. Default: `dist` of `@specdiff/embed` |
| `prefix` | `string` | Fastify only: where the plugin is mounted |

Files are read on each request, so edits show up on reload. This package does not read `.specdiff.yaml`.

## What it serves

Under the mount path: `/` (the page), `/boot.js`, `/config.json` (`{ url, compareWith?, theme?, brand? }`), `/openapi.<ext>`, `/openapi-previous.<ext>`, and `/assets/*` from `assetsDir`. Other methods than GET and HEAD, and unknown paths, go to `next()` (404 without one). Responses send `x-content-type-options: nosniff` and a `content-security-policy` that only allows scripts from the same origin.

## API

- `specdiff(options): Handler`: the request handler.
- `specdiffFastify(fastify, options & { prefix? })`: the Fastify plugin.
- Types `SpecdiffOptions`, `Handler`.

## Licence

MIT
