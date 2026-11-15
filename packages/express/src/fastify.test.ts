import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import { expect, it } from 'vitest';
import { specdiffFastify } from './index';

it('serves the viewer under a Fastify prefix', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'specdiff-fastify-'));
  writeFileSync(join(dir, 'openapi.json'), '{"openapi":"3.1.0","info":{"title":"T","version":"1"},"paths":{}}');
  const app = Fastify();
  await app.register(specdiffFastify as never, { prefix: '/docs', spec: join(dir, 'openapi.json'), assetsDir: dir });
  const page = await app.inject({ url: '/docs/' });
  expect(page.statusCode).toBe(200);
  expect(page.body).toContain('assets/specdiff-embed.js');
  const cfg = await app.inject({ url: '/docs/config.json' });
  expect(cfg.json()).toEqual({ url: 'openapi.json' });
  expect((await app.inject({ url: '/docs/openapi.json' })).json().openapi).toBe('3.1.0');
  await app.close();
});
