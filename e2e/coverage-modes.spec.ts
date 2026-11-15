// End-to-end coverage for the IN, TX, JS, MD, CD, OUT and SET features (docs/02) that had no e2e test that
// checks the behaviour as docs/02 words it. Map: docs/audit/coverage-modes.md. App tests run against the
// production build (http://localhost:4173/app/); OUT-10 / OUT-11 run the built CLI.
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { expectAxeClean as axe } from './a11y';

test.use({ baseURL: 'http://localhost:4173' });
test.beforeEach(() => {
  test.skip(test.info().project.name !== 'desktop', 'desktop project only');
});

// fflate is a dependency of the app (it reads ZIPs there); use it to build the ZIPs the app reads.
const appRequire = createRequire(resolve('apps/app/package.json'));
const { zipSync, strToU8 } = appRequire('fflate') as {
  zipSync: (files: Record<string, Uint8Array>) => Uint8Array;
  strToU8: (s: string) => Uint8Array;
};

const CLI = resolve('packages/cli/dist/cli.js');
const V1 = resolve('fixtures/samples/payments-v1.yaml');
const V2 = resolve('fixtures/samples/payments-v2.yaml');
const cli = (cwd: string, ...args: string[]) =>
  spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });

const settle = (page: Page) =>
  page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
const expectAxeClean = async (page: Page) => {
  await settle(page);
  await axe(page);
};

/** Paste in one go through the textarea's native setter (fill() is slow on long text). */
async function paste(page: Page, name: 'Before' | 'After', value: string) {
  await page.getByRole('textbox', { name, exact: true }).evaluate((el, v) => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}
async function openFile(page: Page, side: 0 | 1, name: string, content: string | Buffer, mimeType = 'text/plain') {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open file' }).nth(side).click();
  await (await chooser).setFiles({ name, mimeType, buffer: typeof content === 'string' ? Buffer.from(content) : content });
}
const compareBtn = (page: Page) => page.getByRole('button', { name: 'Compare', exact: true });
async function compareFiles(page: Page, a: [string, string], b: [string, string], mode?: string) {
  await page.goto('/app/');
  await expect(page.getByRole('heading', { name: 'Compare two files' })).toBeVisible();
  await openFile(page, 0, a[0], a[1]);
  await openFile(page, 1, b[0], b[1]);
  if (mode) await page.getByRole('combobox', { name: 'Compare as' }).selectOption(mode);
  await compareBtn(page).click();
}
async function pasteCompare(page: Page, before: string, after: string, mode?: string) {
  await page.goto('/app/');
  await expect(page.getByRole('heading', { name: 'Compare two files' })).toBeVisible();
  await paste(page, 'Before', before);
  await paste(page, 'After', after);
  if (mode) await page.getByRole('combobox', { name: 'Compare as' }).selectOption(mode);
  await compareBtn(page).click();
}
const lines = (n: number, f: (i: number) => string) => Array.from({ length: n }, (_, i) => f(i + 1)).join('\n') + '\n';
const textRegion = (page: Page) => page.getByRole('region', { name: /^Differences between/ });
const heading1 = (page: Page) => page.getByRole('heading', { level: 1 });
async function openMore(page: Page, item: string) {
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: item }).click();
}
async function openSettings(page: Page, section?: string) {
  await openMore(page, 'Rules and settings');
  await expect(page.getByRole('heading', { name: 'Rules', exact: true })).toBeVisible();
  if (section) await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: section }).click();
}
async function openOpenApiSample(page: Page) {
  await page.goto('/app/?sample=openapi');
  await expect(page.getByRole('region', { name: 'Breaking: 4' })).toBeVisible();
}
async function download(page: Page, click: () => Promise<void>) {
  const dl = page.waitForEvent('download');
  await click();
  const file = await dl;
  return { name: file.suggestedFilename(), text: readFileSync((await file.path())!, 'utf8') };
}

// ===================================================================== IN · Input

test('IN-02 a file dropped on one side loads there; the drag-over state is per side; Open file picks too', async ({ page }) => {
  await page.goto('/app/');
  await expect(page.getByRole('heading', { name: 'Compare two files' })).toBeVisible();
  // Drag over Before only: Before is the target, After is not.
  const dt = await page.evaluateHandle(() => new DataTransfer());
  await page.getByRole('textbox', { name: 'Before', exact: true }).dispatchEvent('dragover', { dataTransfer: dt });
  // Both sides become drop zones; only the side under the pointer is the target.
  const zones = page.locator('[class*="zone"][data-target]');
  await expect(zones).toHaveCount(1);
  await expect(zones).toContainText('Drop to use as Before');
  await expect(page.locator('section[aria-labelledby="editor-after-label"] [data-target]')).toHaveCount(0);
  await expectAxeClean(page);
  // Drop a real file on the Before drop target.
  await page.evaluate(() => {
    const target = document.querySelector('section[aria-labelledby="editor-before-label"] [class*="dropTarget"]')!;
    const d = new DataTransfer();
    d.items.add(new File(['alpha\nbeta\n'], 'dropped.txt', { type: 'text/plain' }));
    target.dispatchEvent(new DragEvent('drop', { dataTransfer: d, bubbles: true, cancelable: true }));
  });
  await expect(page.getByRole('textbox', { name: /^Before/ })).toHaveValue('alpha\nbeta\n');
  await expect(page.getByText('dropped.txt')).toBeVisible();
  await expect(page.getByRole('textbox', { name: /^After/ })).toHaveValue('');
  // The file picker fills the other side.
  await openFile(page, 1, 'picked.txt', 'alpha\nBETA\n');
  await expect(page.getByRole('textbox', { name: /^After/ })).toHaveValue('alpha\nBETA\n');
  await compareBtn(page).click();
  await expect(page.getByRole('heading', { name: '2 lines differ' })).toBeVisible();
});

test('IN-03 a GitHub blob link loads the raw file; a server without CORS is explained', async ({ page }) => {
  const asked: string[] = [];
  await page.route('https://raw.githubusercontent.com/**', (route) => {
    asked.push(route.request().url());
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: 'from github\n' });
  });
  // A real cross-origin server that sends no Access-Control-Allow-Origin header (page.route answers skip CORS).
  const server = createServer((_, res) => res.end('secret\n'));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  await page.goto('/app/');
  await page.getByRole('button', { name: 'From URL' }).first().click();
  let dialog = page.getByRole('dialog', { name: 'Load from URL' });
  await dialog.getByLabel('File URL').fill('https://github.com/acme/api/blob/main/openapi.txt');
  await dialog.getByRole('button', { name: 'Load file' }).click();
  await expect(page.getByRole('textbox', { name: /^Before/ })).toHaveValue('from github\n');
  expect(asked).toEqual(['https://raw.githubusercontent.com/acme/api/main/openapi.txt']);

  await page.getByRole('button', { name: 'From URL' }).nth(1).click();
  dialog = page.getByRole('dialog', { name: 'Load from URL' });
  await dialog.getByLabel('File URL').fill(`http://127.0.0.1:${port}/spec.yaml`);
  await dialog.getByRole('button', { name: 'Load file' }).click();
  await expect(page.getByText(`The server at 127.0.0.1:${port} didn't allow this page to read the file (CORS).`, { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/Download the file and drop it in instead/).first()).toBeVisible();
  await expectAxeClean(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('textbox', { name: /^After/ })).toHaveValue('');
  server.close();
});

const multi = (v: 'v1' | 'v2') =>
  Buffer.from(
    zipSync({
      'openapi.yaml': strToU8(readFileSync(`fixtures/specs/multi/${v}/openapi.yaml`, 'utf8')),
      'schemas/card.yaml': strToU8(readFileSync(`fixtures/specs/multi/${v}/schemas/card.yaml`, 'utf8')),
    }),
  );

test('IN-04 a ZIP of a split spec: the external $ref inside it is resolved and its change reported', async ({ page }) => {
  // The two openapi.yaml files are identical; the only change is last4's type in schemas/card.yaml.
  await page.goto('/app/');
  await openFile(page, 0, 'cards-v1.zip', multi('v1'), 'application/zip');
  await openFile(page, 1, 'cards-v2.zip', multi('v2'), 'application/zip');
  await compareBtn(page).click();
  await expect(page.getByRole('tab', { name: 'Summary', selected: true })).toBeVisible();
  await expect(page.getByRole('region', { name: /^Breaking: [1-9]/ })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('last4');
  await expect(page.getByText('No differences')).toHaveCount(0);
});

test('IN-06 swap exchanges Before and After, and the result flips', async ({ page }) => {
  await page.goto('/app/');
  await paste(page, 'Before', 'one\ntwo\n');
  await paste(page, 'After', 'one\ntwo\nthree\n');
  await page.getByRole('button', { name: 'Swap before and after' }).click();
  await expect(page.getByRole('textbox', { name: /^Before/ })).toHaveValue('one\ntwo\nthree\n');
  await expect(page.getByRole('textbox', { name: /^After/ })).toHaveValue('one\ntwo\n');
  await compareBtn(page).click();
  await expect(page.getByRole('heading', { name: '1 lines differ' })).toBeVisible();
  await expect(page.getByText('− 1').first()).toBeVisible();
  await expect(textRegion(page).locator('[data-kind="del"]', { hasText: 'three' })).toBeVisible();
});

test('IN-07 auto-detects OpenAPI, JSON, YAML, Markdown, code and text; Compare as overrides it', async ({ page }) => {
  await page.goto('/app/');
  const detected = page.getByText(/^Detected/);
  const cases: Array<[string, string, RegExp]> = [
    ['spec.yaml', readFileSync(V1, 'utf8'), /Detected\s*OpenAPI/],
    ['data.json', '{"a": 1}\n', /Detected\s*JSON/],
    ['config.yaml', 'a: 1\nb: two\n', /Detected\s*YAML/],
    ['README.md', '# Title\n\n- item\n', /Detected\s*Markdown/],
    ['pay.py', 'def pay(a):\n    return a\n', /Detected\s*Code/],
    ['notes.txt', 'just some words\n', /Detected\s*Plain text/],
  ];
  for (const [name, content, want] of cases) {
    await openFile(page, 0, name, content);
    await expect(detected).toHaveText(want);
  }
  // The detected language reaches the result: a .py pair is compared as Python code.
  await openFile(page, 0, 'pay.py', 'def pay(a):\n    return a\n');
  await openFile(page, 1, 'pay.py', 'def pay(a):\n    return a + 1\n');
  await compareBtn(page).click();
  await expect(page.getByText('Code: Python')).toBeVisible();
  // Override: an OpenAPI pair compared as plain text gives a text diff.
  await page.goto('/app/');
  await openFile(page, 0, 'payments-v1.yaml', readFileSync(V1, 'utf8'));
  await openFile(page, 1, 'payments-v2.yaml', readFileSync(V2, 'utf8'));
  await expect(detected).toHaveText(/Detected\s*OpenAPI/);
  await page.getByRole('combobox', { name: 'Compare as' }).selectOption('text');
  await compareBtn(page).click();
  await expect(page.getByRole('region', { name: 'Differences between payments-v1.yaml and payments-v2.yaml' })).toBeVisible();
  await expect(page.getByRole('banner')).toContainText('Text');
  await expect(page.getByRole('tab', { name: 'Summary' })).toHaveCount(0);
});

const bigSpec = (n: number, version = '1.0.0') =>
  `openapi: 3.1.0\ninfo:\n  title: Big\n  version: ${version}\npaths:\n` +
  Array.from({ length: n }, (_, i) => `  /r${i}:\n    get:\n      operationId: op${i}\n      responses:\n        '200':\n          description: ok\n`).join('');

test('IN-08 the Parsing screen shows per-file progress and steps; Cancel stops it and returns to Compare', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/app/');
  await paste(page, 'Before', bigSpec(8000));
  await paste(page, 'After', bigSpec(8000, '1.1.0').replace('/r7999:', '/r8000:'));
  await compareBtn(page).click();
  await expect(page.getByRole('heading', { name: 'Preparing your comparison' })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Before progress' })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'After progress' })).toBeVisible();
  await expect(page.locator('ol li[data-state]')).toHaveText([/^Detect format/, /^Parse/, /^Resolve \$refs/, /^Normalise/, /^Compare and classify/]);
  await page.getByRole('button', { name: 'Cancel' }).first().click();
  await expect(page.getByRole('heading', { name: 'Compare two files' })).toBeVisible();
  // It stays cancelled: no result replaces Compare afterwards.
  await page.waitForTimeout(3000);
  await expect(page.getByRole('heading', { name: 'Compare two files' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Summary' })).toHaveCount(0);
});

test('IN-09 a parse error names the line, points at the column and gives a plain-English hint', async ({ page }) => {
  await pasteCompare(page, '{"a": 1}\n', 'a: 1\nb: [1, 2\nc: 3\n', 'yaml');
  await expect(page.getByText(/^Couldn't parse After: line \d+$/)).toBeVisible();
  const failing = page.locator('[data-parse-line]').filter({ hasText: 'Error here:' });
  await expect(failing).toHaveCount(1);
  // The ^ pointer row under the failing line marks the column.
  await expect(page.getByText(/^\s*\^$/)).toBeVisible();
  await expect(page.getByText(/A bracket, brace or quote is not closed\. Look for a missing \] \} or " near here\./)).toBeVisible();
  await expectAxeClean(page);
});

test('IN-10 above 10 MB a file loads with a warning; above 25 MB text-only is offered', async ({ page }) => {
  await page.goto('/app/');
  await openFile(page, 0, 'big11.txt', Buffer.alloc(11 * 1024 * 1024, 'line\n'));
  await expect(page.getByText('big11.txt is 11.0 MB')).toBeVisible();
  await expect(page.getByText('Large files take a few seconds. The page stays responsive.')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await openFile(page, 1, 'big26.json', Buffer.alloc(26 * 1024 * 1024, ' '));
  const dialog = page.getByRole('dialog', { name: 'big26.json is 26.0 MB' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Compare as text' }).click();
  await expect(page.getByRole('combobox', { name: 'Compare as' })).toHaveValue('text');
});

// ===================================================================== TX · Text

test('TX-01 split shows two columns, unified one; both mark removed and added lines', async ({ page }) => {
  await pasteCompare(page, 'alpha\nbeta\ngamma\n', 'alpha\nBETA\ngamma\n', 'text');
  await expect(page.getByRole('heading', { name: '2 lines differ' })).toBeVisible();
  const region = textRegion(page);
  await expect(page.getByRole('radio', { name: 'Split' })).toBeChecked();
  const splitRow = region.locator('[class*="split"]').filter({ hasText: 'beta' }).first();
  await expect(splitRow.locator('[data-kind]')).toHaveCount(2);
  await expect(splitRow.locator('[data-kind="del"]')).toContainText('(removed)');
  await expect(splitRow.locator('[data-kind="add"]')).toContainText('(added)');
  await expectAxeClean(page);
  await page.getByRole('radio', { name: 'Unified' }).click();
  await expect(region.locator('[class*="split"]')).toHaveCount(0);
  await expect(region.locator('[data-kind="del"]', { hasText: 'beta' })).toBeVisible();
  await expect(region.locator('[data-kind="add"]', { hasText: 'BETA' })).toBeVisible();
  await expect(region.locator('[data-kind="del"]').first()).toContainText('−');
  await expect(region.locator('[data-kind="add"]').first()).toContainText('+');
  await expectAxeClean(page);
});

test('TX-02 precision Smart / Word / Char changes what is highlighted inside a line', async ({ page }) => {
  await pasteCompare(page, 'line 2 text here\n', 'line 2 TEXT changed here\n', 'text');
  await expect(page.getByRole('heading', { name: '2 lines differ' })).toBeVisible();
  const marks = () => textRegion(page).locator('[data-kind="add"] mark').allTextContents();
  await expect(page.getByRole('radio', { name: 'Smart' })).toBeChecked();
  const smart = await marks();
  // Word: whole words only.
  await page.getByRole('radio', { name: 'Word' }).click();
  await expect.poll(async () => (await marks()).map((m) => m.trim()).join(' ')).toBe('TEXT changed');
  // Char: only the characters that differ, so fewer characters are marked.
  await page.getByRole('radio', { name: 'Char' }).click();
  await expect.poll(async () => (await marks()).join('').length).toBeLessThan('TEXT changed'.length);
  const char = await marks();
  expect(char.length).toBeGreaterThanOrEqual(2);
  expect(char).not.toEqual(smart);
  await expectAxeClean(page);
});

test('TX-03 highlights Python, Java, Go and Rust files in text mode', async ({ page }) => {
  const cases: Array<[string, string]> = [
    ['a.py', 'python'],
    ['A.java', 'java'],
    ['main.go', 'go'],
    ['lib.rs', 'rust'],
  ];
  for (const [name, lang] of cases) {
    await compareFiles(page, [name, 'let x = 1\nreturn x\n'], [name, 'let x = 2\nreturn x\n'], 'text');
    await expect(textRegion(page)).toHaveAttribute('data-lang', lang);
    await expect(textRegion(page).locator('span[style*="--sd-syn-"]').first()).toBeVisible();
  }
});

test('TX-04 ignore whitespace, case and line endings each turn a difference into "No differences"', async ({ page }) => {
  // Whitespace
  await pasteCompare(page, 'a  b\n', 'a b\n', 'text');
  await expect(page.getByRole('heading', { name: '2 lines differ' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Ignore whitespace' }).click();
  await expect(page.getByText('No differences')).toBeVisible();
  // Case
  await pasteCompare(page, 'Hello\n', 'hello\n', 'text');
  await expect(page.getByRole('heading', { name: '2 lines differ' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Ignore case' }).click();
  await expect(page.getByText('No differences')).toBeVisible();
  // Line endings: files keep their CRLF (a textarea would not). On by default; off shows the lines.
  await compareFiles(page, ['crlf.txt', 'one\r\ntwo\r\n'], ['lf.txt', 'one\ntwo\n'], 'text');
  await expect(page.getByText('No differences')).toBeVisible();
  await page.getByRole('button', { name: 'Show formatting changes' }).click();
  await expect(page.getByRole('heading', { name: /lines differ/ })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Ignore line endings' })).not.toBeChecked();
  await page.getByRole('checkbox', { name: 'Ignore line endings' }).click();
  await expect(page.getByText('No differences')).toBeVisible();
});

test('TX-05 long unchanged runs collapse; the expand control shows them', async ({ page }) => {
  await compareFiles(page, ['a.txt', lines(120, (i) => `line ${i}`)], ['b.txt', lines(120, (i) => (i === 60 ? 'LINE 60' : `line ${i}`))], 'text');
  await expect(page.getByRole('heading', { name: '2 lines differ' })).toBeVisible();
  const folds = page.getByRole('button', { name: /^Show \d+ unchanged lines$/ });
  await expect(folds.first()).toBeVisible();
  const label = (await folds.first().textContent())!.trim();
  const hidden = Number(/Show (\d+)/.exec(label)![1]);
  expect(hidden).toBeGreaterThan(40);
  await expect(page.getByText('line 10', { exact: true })).toHaveCount(0);
  await folds.first().click();
  await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(0);
  await expect(page.getByText('line 10', { exact: true }).first()).toBeAttached();
  await expectAxeClean(page);
});

test('TX-06 Next / Previous move between changes; the overview ruler marks each change and jumps', async ({ page }) => {
  await compareFiles(page, ['a.txt', lines(300, (i) => `line ${i}`)], ['b.txt', lines(300, (i) => (i === 5 || i === 290 ? `CHANGED ${i}` : `line ${i}`))], 'text');
  await expect(page.getByRole('heading', { name: '4 lines differ' })).toBeVisible();
  const pos = page.getByText(/^\d+ \/ 2$/);
  await expect(pos).toHaveText('1 / 2');
  await page.getByRole('button', { name: 'Next change' }).click();
  await expect(pos).toHaveText('2 / 2');
  await page.getByRole('button', { name: 'Previous change' }).click();
  await expect(pos).toHaveText('1 / 2');
  const ticks = page.locator('[class*="ruler"] button');
  await expect(ticks).toHaveCount(2);
  const tops = await ticks.evaluateAll((els) => els.map((e) => parseFloat((e as HTMLElement).style.top)));
  expect(tops[0]!).toBeLessThan(10);
  expect(tops[1]!).toBeGreaterThan(90);
  await ticks.last().click();
  await expect(page.getByText('CHANGED 290').first()).toBeInViewport();
});

test('TX-07 word wrap toggles long lines onto several rows', async ({ page }) => {
  const long = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ');
  await pasteCompare(page, `${long}\nend\n`, `${long} more\nend\n`, 'text');
  await expect(page.getByRole('heading', { name: '2 lines differ' })).toBeVisible();
  const row = textRegion(page).locator('[data-kind="add"]').first();
  const h0 = (await row.boundingBox())!.height;
  await page.getByRole('button', { name: 'Turn word wrap on' }).click();
  await expect(page.getByRole('button', { name: 'Turn word wrap off' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await row.boundingBox())!.height).toBeGreaterThan(h0 * 2);
  await page.getByRole('button', { name: 'Turn word wrap off' }).click();
  await expect.poll(async () => (await row.boundingBox())!.height).toBeLessThan(h0 * 1.5);
});

test('TX-08 a custom regex filter masks noise on both sides, shows ‹name› and counts hits', async ({ page }) => {
  await pasteCompare(page, 'start pid=101\nready pid=102\nstop\n', 'start pid=901\nready pid=902\nstop now\n', 'text');
  await expect(page.getByRole('heading', { name: '6 lines differ' })).toBeVisible();
  await page.getByRole('button', { name: /^Filters/ }).click();
  const panel = page.getByRole('complementary', { name: 'Filters' });
  await panel.getByLabel('Pattern (regular expression)').fill('pid=\\d+');
  await panel.getByLabel('Show as').fill('‹pid›');
  await panel.getByRole('button', { name: 'Add filter' }).click();
  await expect(page.getByRole('heading', { name: '2 lines differ after filters' })).toBeVisible();
  await expect(panel.getByRole('listitem').filter({ hasText: 'pid=\\d+' })).toContainText('4 hits');
  await expect(textRegion(page).getByText('‹pid›').first()).toBeVisible();
  // The presets are offered with their hit counts.
  for (const p of ['Timestamps', 'Request IDs', 'UUIDs']) await expect(panel.getByRole('checkbox', { name: p })).toBeVisible();
  await expectAxeClean(page);
});

async function transform(page: Page, label: string) {
  await page.getByRole('button', { name: 'Transform' }).click();
  await page.getByRole('menuitem', { name: label }).click();
}
// One test per transform: transforms are saved with the text settings, so each starts from defaults.
test('TX-09 transform: sort lines', async ({ page }) => {
  await pasteCompare(page, 'b\na\n', 'a\nb\n', 'text');
  await expect(page.getByRole('heading', { name: /[1-9]\d* lines differ/ })).toBeVisible();
  await transform(page, 'Sort lines');
  await expect(page.getByText('No differences')).toBeVisible();
});
test('TX-09 transform: lowercase', async ({ page }) => {
  await pasteCompare(page, 'Hello World\n', 'hello world\n', 'text');
  await expect(page.getByRole('heading', { name: '2 lines differ' })).toBeVisible();
  await transform(page, 'Lowercase');
  await expect(page.getByText('No differences')).toBeVisible();
});
test('TX-09 transform: trim lines', async ({ page }) => {
  await pasteCompare(page, 'x\n   y   \n', 'x\ny\n', 'text');
  await expect(page.getByRole('heading', { name: '2 lines differ' })).toBeVisible();
  await transform(page, 'Trim lines');
  await expect(page.getByText('No differences')).toBeVisible();
});
test('TX-09 transform: normalise line breaks', async ({ page }) => {
  // "Ignore line endings" goes off first, so only the transform can make CRLF and LF equal.
  await compareFiles(page, ['crlf.txt', 'one\r\ntwo\r\n'], ['lf.txt', 'one\ntwo\n'], 'text');
  await page.getByRole('button', { name: 'Show formatting changes' }).click();
  await expect(page.getByRole('heading', { name: /lines differ/ })).toBeVisible();
  await transform(page, 'Normalise line breaks');
  await expect(page.getByText('No differences')).toBeVisible();
});

// ===================================================================== JS · JSON / YAML

const jsonCompare = (page: Page, a: unknown, b: unknown) =>
  pasteCompare(page, JSON.stringify(a, null, 2), JSON.stringify(b, null, 2), 'yaml');
const jsonTree = (page: Page) => page.getByRole('list', { name: 'Changes by path' });
async function setField(page: Page, label: string, value: string) {
  const f = page.getByRole('textbox', { name: label, exact: true });
  await f.fill(value);
  await f.press('Enter');
}

test('JS-01 key order is ignored by default; turning it off reports the moved keys', async ({ page }) => {
  await jsonCompare(page, { a: 1, b: 2, c: 3 }, { b: 2, a: 1, c: 4 });
  await expect(page.getByRole('heading', { name: /^1 difference/ })).toBeVisible();
  const box = page.getByRole('checkbox', { name: 'Ignore key order' });
  await expect(box).toBeChecked();
  await box.click();
  await expect(page.getByRole('heading', { name: /^[2-9] differences/ })).toBeVisible();
  await expect(jsonTree(page).getByText(/moved/).first()).toBeVisible();
});

test('JS-02 array items match by an auto-detected key, by an override, and array order can be ignored', async ({ page }) => {
  // Auto-detected: "id".
  await jsonCompare(page, { items: [{ id: 'a', n: 1 }, { id: 'b', n: 2 }] }, { items: [{ id: 'b', n: 2 }, { id: 'a', n: 5 }] });
  await expect(page.getByText(/Auto-detected: id for items/)).toBeVisible();
  await expect(jsonTree(page).getByText('[id=a]').first()).toBeVisible();
  // Override with a key auto does not try.
  const sku = (n: number) => ({ items: [{ sku: 'x', q: 1 }, { sku: 'y', q: n }, { sku: 'z', q: 3 }] });
  const before = sku(2);
  const after = { items: [before.items[2], before.items[0], { sku: 'y', q: 9 }] };
  await jsonCompare(page, before, after);
  await expect(page.getByText(/Auto: tried id, uuid, key and name/)).toBeVisible();
  const autoN = Number(/^(\d+)/.exec((await heading1(page).textContent())!)![1]);
  await setField(page, 'Match array items by', 'sku');
  await expect(jsonTree(page).getByText('[sku=y]').first()).toBeVisible();
  await expect.poll(async () => Number(/^(\d+)/.exec((await heading1(page).textContent())!)![1])).toBeLessThan(autoN);
  // Ignore array order: a reordered list of scalars is the same.
  await jsonCompare(page, { tags: ['a', 'b', 'c'] }, { tags: ['c', 'a', 'b'] });
  await expect(page.getByRole('heading', { name: /differences?/ })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Ignore array order' }).click();
  await expect(page.getByRole('heading', { name: 'No differences' })).toBeVisible();
});

test('JS-04 null and missing stay distinct (option to treat equal); duplicate keys are reported with their line', async ({ page }) => {
  await pasteCompare(page, '{\n  "a": 1,\n  "n": null\n}\n', '{\n  "a": 1\n}\n', 'yaml');
  await expect(page.getByRole('heading', { name: /^1 difference/ })).toBeVisible();
  await expect(jsonTree(page).getByText('null ≠ missing')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Treat null and missing as equal' }).click();
  await expect(page.getByRole('heading', { name: 'No differences' })).toBeVisible();

  await pasteCompare(page, '{\n  "a": 1,\n  "b": 2,\n  "a": 3\n}\n', '{\n  "a": 3,\n  "b": 3\n}\n', 'yaml');
  const dupes = page.getByRole('region', { name: 'Duplicate keys' });
  await expect(dupes).toContainText('a appears twice in the root object in Before, line 4. The last value wins.');
  await expectAxeClean(page);
});

test('JS-06 ignored keys are not reported, at any depth', async ({ page }) => {
  await jsonCompare(page, { v: 1, updatedAt: 'x', meta: { requestId: 'r1' } }, { v: 1, updatedAt: 'y', meta: { requestId: 'r2' } });
  await expect(page.getByRole('heading', { name: /^2 differences/ })).toBeVisible();
  await setField(page, 'Ignore keys', 'updatedAt, requestId');
  await expect(page.getByRole('heading', { name: 'No differences' })).toBeVisible();
});

test('JS-07 Tree, Side by side and Raw text views each show the change', async ({ page }) => {
  await page.goto('/app/?sample=json');
  await expect(page.getByRole('heading', { name: '7 differences in 226 values' })).toBeVisible();
  await expect(jsonTree(page).getByText('$.limits.timeoutMs')).toBeVisible();
  await page.getByRole('radio', { name: 'Side by side' }).click();
  const sbs = page.getByRole('region', { name: /^Side by side: flags\.prod\.json and flags\.staging\.json/ });
  await expect(sbs).toContainText('"enabled": false');
  await expect(sbs.locator('[data-kind="del"]').first()).toBeVisible();
  await page.getByRole('radio', { name: 'Raw text' }).click();
  const raw = page.getByRole('region', { name: /^Raw text: flags\.prod\.json and flags\.staging\.json/ });
  await expect(raw).toContainText('"enabled"');
  await expect(raw.locator('[data-kind="del"], [data-kind="add"]').first()).toBeVisible();
  await expectAxeClean(page);
});

test('JS-08 the Markdown export lists every change; JSON Patch says it round-trips', async ({ page }) => {
  await page.goto('/app/?sample=json');
  await expect(page.getByRole('heading', { name: '7 differences in 226 values' })).toBeVisible();
  await page.getByRole('tab', { name: 'Export' }).click();
  const preview = page.getByRole('region', { name: 'Export preview' });
  await expect(preview).toContainText('Applying this patch to flags.prod.json gives flags.staging.json exactly.');
  await page.getByRole('radio', { name: /^Markdown/ }).click();
  await expect(preview).toContainText('flags.prod.changes.md · 7 changes');
  await expect(preview).toContainText('7 changes: 1 added, 1 removed, 2 changed, 1 type changed, 1 moved.');
  await expect(preview).toContainText('limits › timeoutMs**: `30000` → `45000`');
  const { name } = await download(page, () => preview.getByRole('button', { name: 'Download' }).click());
  expect(name).toMatch(/\.md$/);
});

test('JS-10 100.00 equals 100; a decimal tolerance absorbs small differences', async ({ page }) => {
  await pasteCompare(page, '{"p": 100.00, "q": 1.004}', '{"p": 100, "q": 1}', 'yaml');
  await expect(page.getByRole('heading', { name: /^1 difference/ })).toBeVisible();
  await expect(jsonTree(page).getByText('$.q')).toBeVisible();
  await expect(jsonTree(page).getByText('$.p')).toHaveCount(0);
  await setField(page, 'Number tolerance', '0.01');
  await expect(page.getByRole('heading', { name: 'No differences' })).toBeVisible();
});

test('JS-11 "Type changed" is its own category in the stats and the filter chips', async ({ page }) => {
  await jsonCompare(page, { t: 1, s: 'a' }, { t: '1', s: 'b' });
  await expect(page.getByRole('heading', { name: /^2 differences/ })).toBeVisible();
  const chip = page.getByRole('group', { name: 'Show only' }).getByRole('button', { name: /Type changed 1/ });
  await expect(chip).toBeVisible();
  await expect(jsonTree(page).getByText('number → string')).toBeVisible();
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(jsonTree(page).getByText('$.t')).toBeVisible();
  await expect(jsonTree(page).getByText('$.s')).toHaveCount(0);
});

// ===================================================================== MD · Markdown

const MD_BEFORE = `# Guide

See [install](#install) and [docs](https://docs.example.com/v1).

![logo](a.png)

## Install

Run the tool.

\`\`\`js
const a = 1;
const b = 2;
\`\`\`

## Old part

Gone soon.

| Key | Value |
| --- | --- |
| mode | fast |

> [!NOTE]
> Old note
`;
const MD_AFTER = `# Guide

See [install](#install) and [docs](https://docs.example.com/v2).

![logo](b.png)

## Installation

Run the tool now.

\`\`\`js
const a = 1;
const b = 3;
\`\`\`

## New part

Fresh text.

| Key | Value |
| --- | --- |
| mode | safe |

> [!NOTE]
> New note
`;
async function mdCompare(page: Page) {
  await compareFiles(page, ['guide.md', MD_BEFORE], ['guide.md', MD_AFTER], 'markdown');
  await expect(page.getByRole('navigation', { name: 'Outline' })).toBeVisible();
}

test('MD-03 the outline marks headings added, removed or edited; clicking one jumps to it', async ({ page }) => {
  await mdCompare(page);
  const outline = page.getByRole('navigation', { name: 'Outline' });
  await expect(outline.getByRole('button', { name: 'Guide', exact: true })).toBeVisible();
  const install = outline.getByRole('button', { name: /^Installation \((edited|added)\)$/ });
  await expect(install).toBeVisible();
  await expect(outline.getByRole('button', { name: /\((added|removed|edited)\)$/ })).not.toHaveCount(0);
  await install.click();
  const target = page.locator('[id^="md-block-"]', { has: page.getByRole('heading', { name: 'Installation' }) });
  await expect(target).toBeFocused();
  await expectAxeClean(page);
});

test('MD-04 changed links and images show before and after in a tooltip', async ({ page }) => {
  await mdCompare(page);
  const link = page.getByRole('button', { name: /^Link changed: docs/ });
  await expect(link).toBeVisible();
  await link.hover();
  const tip = page.getByRole('tooltip');
  await expect(tip).toContainText('https://docs.example.com/v1');
  await expect(tip).toContainText('https://docs.example.com/v2');
  const img = page.getByRole('button', { name: /^Link changed: logo/ });
  await expect(img).toBeVisible();
  await img.focus();
  await expect(page.getByRole('tooltip')).toContainText('a.png');
  await expect(page.getByRole('tooltip')).toContainText('b.png');
});

test('MD-05 a changed code block is shown as a line diff', async ({ page }) => {
  await mdCompare(page);
  const code = page.getByRole('region', { name: /Code block \(js\), line diff/ }).or(page.locator('pre[aria-label="Code block (js), line diff"]'));
  await expect(code.first()).toContainText('− const b = 2;');
  await expect(code.first()).toContainText('+ const b = 3;');
  await expect(code.first()).toContainText('const a = 1;');
  await expect(page.getByText('1 code block changed')).toBeVisible();
});

test('MD-06 a renamed heading that is still linked is reported as a broken anchor', async ({ page }) => {
  await mdCompare(page);
  const checks = page.getByRole('region', { name: 'Checks' });
  await expect(checks.getByText('Broken anchor')).toBeVisible();
  await expect(checks).toContainText('#install is linked from line 3, but that heading was renamed from #install to #installation.');
});

test('MD-07 GFM: tables, task lists and callouts render and diff', async ({ page }) => {
  await compareFiles(page, ['guide.md', MD_BEFORE + '\n- [ ] write tests\n- [x] ship it\n'], ['guide.md', MD_AFTER + '\n- [x] write tests\n- [x] ship it\n'], 'markdown');
  await expect(page.getByRole('navigation', { name: 'Outline' })).toBeVisible();
  // Table: the changed cell carries its own insert mark.
  await expect(page.locator('td', { hasText: 'safe' }).locator('ins')).toHaveCount(1);
  // Task list: real checkboxes, ticked state from the source.
  const boxes = page.locator('[id^="md-block-"] input[type="checkbox"]');
  await expect(boxes.first()).toBeAttached();
  expect(await boxes.evaluateAll((els) => els.some((e) => (e as HTMLInputElement).checked))).toBe(true);
  // Callout: > [!NOTE] renders as a note, and the marker text is gone.
  await expect(page.locator('.markdown-alert-note').first()).toBeVisible();
  await expect(page.getByText('[!NOTE]')).toHaveCount(0);
});

test('MD-07 a rendered task list is axe clean', async ({ page }) => {
  // Was a defect (checkboxes had no name); fixed: each is labelled with its item's text.
  await compareFiles(page, ['t.md', '# Tasks\n\n- [ ] write tests\n'], ['t.md', '# Tasks\n\n- [x] write tests\n'], 'markdown');
  await expect(page.getByRole('navigation', { name: 'Outline' })).toBeVisible();
  await expect(page.locator('[id^="md-block-"] input[type="checkbox"]').first()).toBeAttached();
  await expectAxeClean(page);
});

// ===================================================================== CD · Code (Beta)

test('CD-01 structural diff for TypeScript, JavaScript and Python files (Java: the sample)', async ({ page }) => {
  const cases: Array<[string, string, string, string]> = [
    ['pay.ts', 'TypeScript', 'export function pay(a: number) {\n  return a + 1;\n}\nexport function keep() { return 1; }\n', 'export function pay(a: number) {\n  return a + 2;\n}\nexport function keep() { return 1; }\n'],
    ['pay.js', 'JavaScript', 'function pay(a) {\n  return a + 1;\n}\n', 'function pay(a) {\n  return a + 2;\n}\n'],
    ['pay.py', 'Python', 'def pay(a):\n    return a + 1\n', 'def pay(a):\n    return a + 2\n'],
  ];
  for (const [name, lang, a, b] of cases) {
    await compareFiles(page, [name, a], [name, b], 'code');
    await expect(page.getByRole('heading', { level: 1, name: /1 logic change/ })).toBeVisible();
    await expect(page.getByText(`Code: ${lang}`)).toBeVisible();
    const panel = page.getByRole('complementary', { name: 'What changed' });
    await expect(panel.getByText(/pay/).first()).toBeVisible();
    await expect(page.getByText(/Showing a text diff/)).toHaveCount(0);
  }
  await page.goto('/app/?sample=code');
  await expect(page.getByText('Code: Java')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: /logic change/ })).toBeVisible();
});

test('CD-02 a formatting-only change collapses to "No logic change"', async ({ page }) => {
  await compareFiles(page, ['f.ts', 'export function f(a: number) { return a + 1; }\n'], ['f.ts', 'export function f(a: number) {\n    return a+1;\n}\n'], 'code');
  await expect(page.getByRole('heading', { level: 1, name: /^No logic change/ })).toBeVisible();
  await expect(page.getByText(/reformatted, no logic change/).first()).toBeVisible();
  await expectAxeClean(page);
});

test('CD-04 a parse failure falls back to a text diff with a notice', async ({ page }) => {
  await compareFiles(page, ['broken.py', 'def f(:\n    return 1\n'], ['broken.py', 'def f(:\n    return 2\n'], 'code');
  await expect(page.getByText('Showing a text diff for broken.py')).toBeVisible();
  await expect(page.getByText(/broken\.py has a syntax error near line \d+, so the structure can't be read/)).toBeVisible();
  await expect(page.getByRole('region', { name: /^Differences between|^Code$/ }).first()).toBeVisible();
});

test('CD-05 tree-sitter parsers load per language, only when needed', async ({ page }) => {
  const wasm: string[] = [];
  page.on('request', (r) => {
    if (/tree-sitter|\.wasm/.test(r.url())) wasm.push(new URL(r.url()).pathname);
  });
  await page.goto('/app/');
  await expect(page.getByRole('heading', { name: 'Compare two files' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(wasm).toEqual([]);
  await openFile(page, 0, 'a.py', 'def f():\n    return 1\n');
  await openFile(page, 1, 'a.py', 'def f():\n    return 2\n');
  await page.getByRole('combobox', { name: 'Compare as' }).selectOption('code');
  await compareBtn(page).click();
  await expect(page.getByText('Code: Python')).toBeVisible();
  expect(wasm.some((p) => /python/i.test(p))).toBe(true);
  expect(wasm.filter((p) => /java(?!script)|typescript/i.test(p))).toEqual([]);
});

test('CD-06 meaning-preserving edits hidden: named-argument order in Python', async ({ page }) => {
  await compareFiles(page, ['c.py', 'def f():\n    return g(a=1, b=2)\n'], ['c.py', 'def f():\n    return g(b=2, a=1)\n'], 'code');
  await expect(page.getByRole('heading', { level: 1, name: /^No logic change/ })).toBeVisible();
});

// ===================================================================== OUT · Output

test('OUT-01 changelog templates: release notes, Keep a Changelog, Slack message, PR comment', async ({ page }) => {
  await openOpenApiSample(page);
  await page.getByRole('tab', { name: 'Changelog' }).click();
  const text = page.getByLabel('Changelog text');
  const tabs = page.getByRole('tablist', { name: 'Template' });
  const want: Array<[RegExp, RegExp]> = [
    [/^Release notes$/, /### Breaking changes/],
    [/^Keep a Changelog$/, /## \[2\.0\.0\] - \d{4}-\d{2}-\d{2}/],
    [/^Slack message$/, /\*payments-v1\.yaml → payments-v2\.yaml/],
    [/^PR comment$/, /### Specdiff: 4 breaking/],
  ];
  for (const [tab, content] of want) {
    await tabs.getByRole('tab', { name: tab }).click();
    await expect(tabs.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
    await expect(text).toHaveValue(content);
  }
  await expectAxeClean(page);
});

test('OUT-02 the changelog is editable, groups by severity and includes docs-only on request', async ({ page }) => {
  await openOpenApiSample(page);
  await page.getByRole('tab', { name: 'Changelog' }).click();
  const text = page.getByLabel('Changelog text');
  await expect(text).toHaveValue(/### Breaking changes/);
  const grouped = await text.inputValue();
  await page.getByRole('checkbox', { name: 'Group by severity' }).click();
  await expect(text).not.toHaveValue(/### Breaking changes/);
  await page.getByRole('checkbox', { name: 'Group by severity' }).click();
  await expect(text).toHaveValue(grouped);
  const docsLines = grouped.split('\n').length;
  await page.getByRole('checkbox', { name: 'Include docs-only' }).click();
  await expect.poll(async () => (await text.inputValue()).split('\n').length).toBeGreaterThan(docsLines);
  await text.fill('My own release notes');
  await expect(page.getByRole('button', { name: 'Reset to generated' })).toBeVisible();
  const { text: saved } = await download(page, () => page.getByRole('button', { name: 'Download .md' }).click());
  expect(saved).toBe('My own release notes');
  await page.getByRole('button', { name: 'Reset to generated' }).click();
  await expect(text).not.toHaveValue('My own release notes');
});

test('OUT-03 exports Markdown, the JSON report and a standalone HTML report', async ({ page }) => {
  await openOpenApiSample(page);
  const exp = async (item: string) =>
    download(page, async () => {
      await page.getByRole('button', { name: 'Export', exact: true }).click();
      await page.getByRole('menuitem', { name: item }).click();
    });
  const md = await exp('Changelog (.md)');
  expect(md.name).toBe('payments-v2-changelog.md');
  expect(md.text).toContain('Breaking changes');
  const json = await exp('JSON report (.json)');
  expect(json.name).toBe('payments-v2-report.json');
  const report = JSON.parse(json.text) as { changes: Array<{ severity: string }> };
  expect(report.changes.length).toBe(28);
  expect(report.changes.filter((c) => c.severity === 'breaking').length).toBe(4);
  const html = await exp('HTML report (.html)');
  expect(html.name).toBe('payments-v2-report.html');
  expect(html.text).toMatch(/^<!doctype html>/i);
  expect(html.text).not.toMatch(/<script/i);
  expect(html.text).not.toMatch(/<link[^>]+stylesheet/i);
  expect(html.text).toContain('payments-v2.yaml');
});

test('OUT-05 share options: my rules and review decisions travel in the link', async ({ page, context }) => {
  await openOpenApiSample(page);
  await openSettings(page);
  await page.getByRole('switch', { name: 'endpoint-removed on' }).click();
  await page.getByRole('button', { name: 'Back to comparison' }).click();
  await expect(page.getByRole('region', { name: 'Breaking: 3' })).toBeVisible();
  await page.getByRole('tab', { name: 'Workspace' }).click();
  await page.getByRole('button', { name: /^To review/ }).click();
  await page.keyboard.press('a');
  await expect(page.getByText(/^1 of \d+ decided$/)).toBeVisible();
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Share this comparison' });
  await dialog.getByRole('checkbox', { name: 'Include my rules and ignore paths' }).check();
  await dialog.getByRole('checkbox', { name: 'Include review decisions' }).check();
  const box = dialog.getByRole('textbox', { name: 'Share link' });
  await expect(box).toHaveValue(/#v=1/);
  const other = await context.newPage();
  await other.goto(await box.inputValue());
  await other.getByRole('tab', { name: 'Summary' }).click();
  await expect(other.getByRole('region', { name: 'Breaking: 3' })).toBeVisible();
  await other.getByRole('tab', { name: 'Workspace' }).click();
  await other.getByRole('button', { name: /^To review/ }).click();
  await expect(other.getByText(/^1 of \d+ decided$/)).toBeVisible();
});

const historyEntries = async (page: Page) => {
  await page.goto('/app/?sample=json');
  await expect(page.getByRole('heading', { name: /\d+ differences?/ })).toBeVisible();
  for (const [label, done] of [['Markdown', page.getByRole('navigation', { name: 'Outline' })], ['Log file', page.getByRole('heading', { name: /lines differ/ })]] as const) {
    await openMore(page, 'New comparison');
    await page.getByRole('group', { name: 'Try a sample' }).getByRole('button', { name: label, exact: true }).click();
    await expect(done).toBeVisible();
  }
};

test('OUT-07 history: search, filter, pin, delete, clear all, empty state', async ({ page }) => {
  await historyEntries(page);
  await openMore(page, 'History');
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
  const rows = page.getByRole('button', { name: /^Open / });
  await expect(rows).toHaveCount(3);
  // Search by file name.
  await page.getByRole('searchbox', { name: 'Search file names' }).fill('flags');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toHaveAccessibleName(/flags\.prod\.json/);
  await page.getByRole('searchbox', { name: 'Search file names' }).fill('');
  await expect(rows).toHaveCount(3);
  // Filter by mode.
  const chips = page.getByRole('group', { name: 'Filter by mode' });
  await chips.getByRole('button', { name: /^Markdown/ }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toHaveAccessibleName(/README|\.md/);
  await chips.getByRole('button', { name: /^All/ }).click();
  await expect(rows).toHaveCount(3);
  // Pin, then the Pinned filter.
  await page.getByRole('button', { name: /^Pin flags\.prod\.json/ }).click();
  await chips.getByRole('button', { name: /^Pinned/ }).click();
  await expect(rows).toHaveCount(1);
  await chips.getByRole('button', { name: /^All/ }).click();
  await expectAxeClean(page);
  // Delete one.
  await page.getByRole('button', { name: /^Delete / }).last().click();
  await expect(rows).toHaveCount(2);
  // Clear all → empty state.
  await page.getByRole('button', { name: 'Clear history' }).click();
  await page.getByRole('dialog', { name: 'Clear history?' }).getByRole('button', { name: 'Clear history' }).click();
  await expect(page.getByRole('heading', { name: 'No comparisons yet' })).toBeVisible();
  await expectAxeClean(page);
});

test('OUT-08 "Print report" opens a print-friendly report', async ({ page, context }) => {
  await openOpenApiSample(page);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const popup = context.waitForEvent('page');
  await page.getByRole('menuitem', { name: 'Print report' }).click();
  const report = await popup;
  await report.waitForLoadState();
  await expect(report).toHaveTitle(/payments-v1\.yaml → payments-v2\.yaml/);
  await report.emulateMedia({ media: 'print' });
  const printed = await report.evaluate(() => [...document.styleSheets].some((s) => [...s.cssRules].some((r) => r instanceof CSSMediaRule && r.conditionText.includes('print'))));
  expect(printed).toBe(true);
  await expect(report.getByText(/breaking/i).first()).toBeVisible();
  expect((await report.pdf()).length).toBeGreaterThan(1000);
});

test('OUT-10 the built CLI writes an Atom feed and appends a release to it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sd-cov-feed-'));
  const feed = join(dir, 'changelog.xml');
  const r = cli(dir, 'changelog', V1, V2, '--format', 'atom', '--feed-url', 'https://docs.acme.dev/changelog.xml', '--title', 'Payments API', '--release', '2.0.0', '--out', feed);
  expect(r.status, r.stderr).toBe(0);
  const xml = readFileSync(feed, 'utf8');
  expect(xml).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
  expect(xml).toContain('<link rel="self" href="https://docs.acme.dev/changelog.xml"/>');
  expect(xml).toContain('<title>Payments API</title>');
  expect(xml.match(/<entry>/g)).toHaveLength(1);
  const r2 = cli(dir, 'changelog', V2, V1, '--format', 'atom', '--feed-url', 'https://docs.acme.dev/changelog.xml', '--release', '3.0.0', '--append', feed, '--out', feed);
  expect(r2.status, r2.stderr).toBe(0);
  expect(readFileSync(feed, 'utf8').match(/<entry>/g)).toHaveLength(2);
  expect(cli(dir, 'changelog', V1, V2, '--format', 'atom').status).not.toBe(0);
});

type Schema = { type?: string | string[]; properties?: Record<string, Schema>; required?: string[]; additionalProperties?: boolean | Schema; items?: Schema; enum?: unknown[]; const?: unknown; minimum?: number; maximum?: number; propertyNames?: Schema };
function validate(s: Schema, v: unknown, at = '$'): string[] {
  const out: string[] = [];
  const t = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
  if (s.type) {
    const ok = ([] as string[]).concat(s.type).some((x) => x === t || (x === 'integer' && Number.isInteger(v)) || (x === 'number' && t === 'number'));
    if (!ok) return [`${at}: ${t} is not ${String(s.type)}`];
  }
  if ('const' in s && JSON.stringify(s.const) !== JSON.stringify(v)) out.push(`${at}: not const`);
  if (s.enum && !s.enum.some((e) => JSON.stringify(e) === JSON.stringify(v))) out.push(`${at}: ${JSON.stringify(v)} not in enum`);
  if (typeof v === 'number' && s.minimum !== undefined && v < s.minimum) out.push(`${at}: < minimum`);
  if (typeof v === 'number' && s.maximum !== undefined && v > s.maximum) out.push(`${at}: > maximum`);
  if (t === 'array' && s.items) (v as unknown[]).forEach((x, i) => out.push(...validate(s.items!, x, `${at}[${i}]`)));
  if (t === 'object') {
    const o = v as Record<string, unknown>;
    for (const k of s.required ?? []) if (!(k in o)) out.push(`${at}.${k}: required`);
    for (const [k, x] of Object.entries(o)) {
      if (s.propertyNames) out.push(...validate(s.propertyNames, k, `${at}{${k}}`));
      if (s.properties?.[k]) out.push(...validate(s.properties[k], x, `${at}.${k}`));
      else if (s.additionalProperties === false) out.push(`${at}.${k}: not allowed`);
      else if (typeof s.additionalProperties === 'object') out.push(...validate(s.additionalProperties, x, `${at}.${k}`));
    }
  }
  return out;
}

test('OUT-11 the built CLI prints the published JSON Schema, and its own JSON report satisfies it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sd-cov-schema-'));
  const s = cli(dir, 'schema');
  expect(s.status, s.stderr).toBe(0);
  const schema = JSON.parse(s.stdout) as Schema & { $id: string; $schema: string };
  expect(schema.$id).toBe('https://specdiff.netlify.app/schema/report-v1.json');
  expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
  for (const [a, b] of [[V1, V2], [V1, V1]]) {
    const r = cli(dir, a!, b!, '--ci', '--format', 'json', '--fail-on', 'none');
    expect(r.status, r.stderr).toBe(0);
    expect(validate(schema, JSON.parse(r.stdout))).toEqual([]);
  }
  const report = JSON.parse(cli(dir, V1, V2, '--ci', '--format', 'json', '--fail-on', 'none').stdout);
  // The validator is not vacuous: a broken report fails it.
  expect(validate(schema, { ...report, version: 2 })).not.toEqual([]);
  expect(validate(schema, { ...report, extra: 1 })).not.toEqual([]);
});

test('OUT-11 the schema the website publishes is the one the CLI prints', () => {
  // Was a defect (stale hand copy); regenerated, and packages/core/src/report/schema.test.ts blocks drift.
  const s = cli(tmpdir(), 'schema');
  expect(s.status, s.stderr).toBe(0);
  expect(readFileSync('apps/website/dist/schema/report-v1.json', 'utf8').trim()).toBe(s.stdout.trim());
});

test('OUT-12 Copy for LLM: breaking, all, current change; Open in Claude only on click', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const offOrigin: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.origin !== 'http://localhost:4173' && !u.protocol.startsWith('blob') && !u.protocol.startsWith('data')) offOrigin.push(r.url());
  });
  await openOpenApiSample(page);
  const menu = page.getByRole('menu', { name: 'Copy for LLM' });
  const pick = async (item: RegExp) => {
    await page.getByRole('button', { name: 'Copy for LLM' }).click();
    await menu.getByRole('menuitem', { name: item }).click();
  };
  await pick(/^Copy breaking changes for LLM/);
  const breaking = await page.evaluate(() => navigator.clipboard.readText());
  expect(breaking).toMatch(/4 changes between two versions of an OpenAPI spec/);
  await pick(/^Copy all changes for LLM/);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/28 changes between two versions/);
  await page.getByRole('tab', { name: 'Workspace' }).click();
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
  await pick(/^Copy current change only/);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/1 change between two versions/);
  expect(offOrigin).toEqual([]);
  const popup = context.waitForEvent('page');
  await pick(/^Open in Claude/);
  const claude = await popup;
  expect(claude.url()).toMatch(/^https:\/\/claude\.ai\/new\?q=/);
  expect(decodeURIComponent(new URL(claude.url()).searchParams.get('q') ?? '')).toContain('Explain these API changes');
});

// ===================================================================== SET · Settings

test('SET-01 turning a rule off and changing a rule severity change the result', async ({ page }) => {
  await openOpenApiSample(page);
  await openSettings(page);
  await page.getByRole('switch', { name: 'endpoint-removed on' }).click();
  await page.getByRole('combobox', { name: 'Severity for response-property-enum-value-added' }).selectOption('breaking');
  await expect(page.getByText('2 changed by you')).toBeVisible();
  await page.getByRole('button', { name: 'Back to comparison' }).click();
  // 4 breaking − endpoint removed + enum value added = 4; possibly 1 → 0.
  await expect(page.getByRole('region', { name: 'Breaking: 4' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Possibly breaking: 0' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Where the 27 changes are' })).toBeVisible();
});

test('SET-02 ignore paths (glob) and vendor extensions (x-*)', async ({ page }) => {
  const a = 'openapi: 3.1.0\ninfo: { title: T, version: 1.0.0 }\npaths:\n  /v1/admin/users:\n    get:\n      responses: { "200": { description: ok } }\n  /v1/pets:\n    get:\n      x-team: a\n      responses: { "200": { description: ok } }\n';
  const b = 'openapi: 3.1.0\ninfo: { title: T, version: 1.0.0 }\npaths:\n  /v1/pets:\n    get:\n      x-team: b\n      responses: { "200": { description: ok } }\n';
  await compareFiles(page, ['a.yaml', a], ['b.yaml', b]);
  // x-* extensions are ignored by default: only the removed admin endpoint is reported.
  await expect(page.getByRole('region', { name: 'Breaking: 1' })).toBeVisible();
  const where = page.getByRole('heading', { name: /^Where the \d+ changes? (are|is)$/ });
  await expect(where).toHaveText(/^Where the 1 change/);
  await openSettings(page, 'Ignore paths');
  const ext = page.getByRole('checkbox', { name: 'Ignore vendor extensions (x-*)' });
  await expect(ext).toBeChecked();
  const paths = page.getByRole('textbox', { name: 'Paths' });
  await paths.fill('/v1/admin/**');
  await paths.blur();
  await page.getByRole('button', { name: 'Back to comparison' }).click();
  await expect(page.getByText('No differences')).toBeVisible();
  // Extensions no longer ignored: the x-team change is reported (as docs-only); the admin path stays ignored.
  await openSettings(page, 'Ignore paths');
  await page.getByRole('checkbox', { name: 'Ignore vendor extensions (x-*)' }).click();
  await page.getByRole('button', { name: 'Back to comparison' }).click();
  await expect(page.getByRole('region', { name: 'Breaking: 0', exact: true })).toBeVisible();
  await expect(where).toHaveText(/^Where the 1 change/);
  await expect(page.getByRole('region', { name: 'Docs only: 1' })).toBeVisible();
});

test('SET-03 the app exports .specdiff.yaml, imports it back, and the CLI reads it', async ({ page }) => {
  await openOpenApiSample(page);
  await openSettings(page);
  await page.getByRole('switch', { name: 'endpoint-removed on' }).click();
  const { name, text } = await download(page, () => page.getByRole('button', { name: 'Export' }).last().click());
  expect(name).toBe('specdiff.yaml');
  expect(text).toMatch(/endpoint-removed:\s*\n\s*enabled: false/);
  expect(text).toMatch(/^version: 1$/m);
  // Import into a fresh browser state.
  await page.getByRole('button', { name: 'Reset to defaults' }).click();
  await expect(page.getByRole('switch', { name: 'endpoint-removed on' })).toBeChecked();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import .specdiff.yaml' }).click();
  await (await chooser).setFiles({ name: '.specdiff.yaml', mimeType: 'application/yaml', buffer: Buffer.from(text) });
  await expect(page.getByText('Rules imported')).toBeVisible();
  await expect(page.getByRole('switch', { name: 'endpoint-removed on' })).not.toBeChecked();
  // The CLI honours the same file.
  const dir = mkdtempSync(join(tmpdir(), 'sd-cov-cfg-'));
  const count = () => (JSON.parse(cli(dir, V1, V2, '--ci', '--format', 'json', '--fail-on', 'none').stdout) as { changes: unknown[] }).changes.length;
  expect(count()).toBe(28);
  writeFileSync(join(dir, '.specdiff.yaml'), text);
  expect(count()).toBe(27);
});

test('SET-04 diff options per mode: the text and JSON defaults set in Settings apply to the next comparison', async ({ page }) => {
  await page.goto('/app/');
  await openSettings(page, 'Diff options');
  for (const legend of ['OpenAPI', 'JSON and YAML', 'Text']) await expect(page.getByRole('group', { name: legend })).toBeVisible();
  await page.getByRole('group', { name: 'Text' }).getByRole('checkbox', { name: 'Ignore case' }).click();
  await page.getByRole('group', { name: 'JSON and YAML' }).getByRole('checkbox', { name: 'Treat null and missing as equal' }).click();
  await expectAxeClean(page);
  await openMore(page, 'New comparison');
  await paste(page, 'Before', 'Hello\n');
  await paste(page, 'After', 'hello\n');
  await page.getByRole('combobox', { name: 'Compare as' }).selectOption('text');
  await compareBtn(page).click();
  await expect(page.getByText('No differences')).toBeVisible();
  await openMore(page, 'New comparison');
  await paste(page, 'Before', '{"a": 1, "n": null}');
  await paste(page, 'After', '{"a": 1}');
  await page.getByRole('combobox', { name: 'Compare as' }).selectOption('yaml');
  await compareBtn(page).click();
  await expect(page.getByRole('heading', { name: 'No differences' })).toBeVisible();
});

const bodyBg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const isDark = (rgb: string) => {
  const [r, g, b] = (rgb.match(/\d+/g) ?? []).map(Number);
  return r! + g! + b! < 200;
};

test('SET-05 theme: light, dark and system; the choice survives a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/app/');
  await openSettings(page, 'Appearance');
  const theme = page.getByRole('radiogroup', { name: 'Theme' });
  await theme.getByRole('radio', { name: /^Light/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(isDark(await bodyBg(page))).toBe(false);
  await expectAxeClean(page);
  await theme.getByRole('radio', { name: /^Dark/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(isDark(await bodyBg(page))).toBe(true);
  await expectAxeClean(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Compare two files' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await openSettings(page, 'Appearance');
  await page.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', { name: /^System/ }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /./);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(async () => isDark(await bodyBg(page))).toBe(false);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(async () => isDark(await bodyBg(page))).toBe(true);
});

test('SET-06 diff colours: default (colour-blind safe, blue/orange) and high contrast (B-27: two palettes)', async ({ page }) => {
  await page.goto('/app/?sample=text');
  await expect(page.getByRole('heading', { name: /lines differ/ })).toBeVisible();
  const added = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--sd-added').trim());
  const base = await added();
  await openSettings(page, 'Appearance');
  const group = page.getByRole('radiogroup', { name: 'Diff colours' });
  await expect(group.getByRole('radio', { name: /^Default \(blue and orange\)/ })).toBeChecked();
  await expect(group).toContainText('Colour-blind safe');
  await group.getByRole('radio', { name: /^High contrast/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-diff-theme', 'high-contrast');
  expect(await added()).not.toBe(base);
  await expectAxeClean(page);
  await group.getByRole('radio', { name: /^Default/ }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-diff-theme', /./);
  expect(await added()).toBe(base);
});

test('SET-07 "?" opens the shortcut sheet; reduced motion stops animations', async ({ page }) => {
  await page.goto('/app/?sample=text');
  await expect(page.getByRole('heading', { name: /lines differ/ })).toBeVisible();
  await page.keyboard.press('?');
  const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('Next change');
  const running = () => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
  // Reopen with reduced motion: nothing animates, and transitions are off.
  await page.keyboard.press('Escape');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.keyboard.press('?');
  await expect(sheet).toBeVisible();
  expect(await running()).toBe(0);
  const transition = await sheet.evaluate((el) => getComputedStyle(el).transitionDuration + '|' + getComputedStyle(el).animationName);
  expect(transition).toMatch(/^0s\|none$/);
  await expectAxeClean(page);
});
