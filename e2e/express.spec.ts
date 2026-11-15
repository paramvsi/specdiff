// PK-06: the Express/Fastify example (examples/express/server.mjs) serves the Viewer at /docs.
// The test starts the example on a free port, checks config.json and the rendered overview, and runs axe.
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { expectAxeClean } from './a11y';

const root = fileURLToPath(new URL('../', import.meta.url));
test.describe.configure({ mode: 'serial' });

let server: ChildProcess | undefined;
let base = '';

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const a = s.address();
      s.close(() => (a && typeof a === 'object' ? resolve(a.port) : reject(new Error('no port'))));
    });
  });

test.beforeAll(async () => {
  test.setTimeout(180_000);
  if (!existsSync(`${root}packages/embed/dist/specdiff-embed.js`)) {
    execFileSync('pnpm', ['--filter', '@specdiff/embed', 'build'], { cwd: root, stdio: 'inherit' });
  }
  const port = await freePort();
  server = spawn(process.execPath, ['examples/express/server.mjs'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`example server did not start:\n${log}`)), 30_000);
    const onData = (d: Buffer) => {
      log += d.toString();
      if (log.includes('Specdiff Viewer at')) { clearTimeout(timer); resolve(); }
    };
    server!.stdout!.on('data', onData);
    server!.stderr!.on('data', onData);
    server!.once('exit', (code) => { clearTimeout(timer); reject(new Error(`example server exited with ${code}:\n${log}`)); });
  });
  base = `http://127.0.0.1:${port}`;
});

test.afterAll(() => {
  server?.kill();
});

test('PK-06 Express example: config.json points at the spec', async ({ request }) => {
  const config = await (await request.get(`${base}/docs/config.json`)).json();
  expect(config).toEqual({ url: 'openapi.yaml', compareWith: 'openapi-previous.yaml' });
  const spec = await request.get(`${base}/docs/${config.url}`);
  expect(spec.ok()).toBe(true);
  expect(await spec.text()).toContain('title: Payments API');
});

test('PK-06 Express example: /docs redirects to /docs/', async ({ request }) => {
  const res = await request.get(`${base}/docs`, { maxRedirects: 0 });
  expect(res.status()).toBe(301);
  expect(res.headers()['location']).toBe('/docs/');
});

test('PK-06 Express example: the Viewer renders the API title, axe clean', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${base}/docs/`);
  await expect(page.getByRole('heading', { level: 1, name: 'Payments API' })).toBeVisible();
  // compareWith is set, so the overview shows what changed since the older version.
  await expect(page.getByRole('region', { name: 'Since 1.5.0' })).toBeVisible();
  await expectAxeClean(page);
});
