// End-to-end coverage for docs/02 OA-01…OA-22 and X-01…X-13 (docs/audit/coverage-oa-x.md).
// Every test drives a built artefact: the production app at :4173 (pnpm build), or the built CLI
// (packages/cli/dist/cli.js). Inputs are the repo fixtures, or small specs written to a temp dir.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { expectAxeClean as axe } from './a11y';

test.use({ baseURL: 'http://localhost:4173' });

const CLI = resolve('packages/cli/dist/cli.js');
const RULES = resolve('fixtures/rules');
const SAMPLES = resolve('fixtures/samples');
const SPECS = resolve('fixtures/specs');
const V1 = join(SAMPLES, 'payments-v1.yaml');
const V2 = join(SAMPLES, 'payments-v2.yaml');

interface Change {
  id: string;
  fingerprint: string;
  ruleId: string;
  severity: string;
  direction: string;
  path: string;
  kind: string;
  jsonPath?: string;
  sourceBlock?: string;
  sharedSchema?: { name: string; usages: string[]; usageCount: number };
  explanation?: { who: string; see: string; avoid: string };
  operation?: { method: string; path: string };
}
interface Report {
  inputs: { before: { specVersion?: string }; after: { specVersion?: string } };
  summary: { breaking: number; possibly: number; safe: number; docs: number; total: number; byArea: Record<string, number> };
  versionCheck?: { suggested: string; bump: string; verdict: string; message: string };
  changes: Change[];
  warnings?: string[];
}

const tmp = (p = 'sd-cov-oa-') => mkdtempSync(join(tmpdir(), p));
const cli = (args: string[], cwd = process.cwd()) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });

/** Writes a .specdiff.yaml (JSON is valid YAML) so no config is picked up from the cwd or repo root. */
function configFile(config: object = {}): string {
  const f = join(tmp('sd-cov-cfg-'), '.specdiff.yaml');
  writeFileSync(f, JSON.stringify({ version: 1, ...config }));
  return f;
}

/** `specdiff --ci --format json` on two files; returns the parsed report. */
function report(before: string, after: string, config: object = {}, cwd = process.cwd()): Report {
  const r = cli([before, after, '--ci', '--format', 'json', '--fail-on', 'none', '--config', configFile(config)], cwd);
  expect(r.status, r.stderr).toBe(0);
  return JSON.parse(r.stdout) as Report;
}
const rows = (r: Report) => r.changes.map((c) => `${c.severity} ${c.ruleId} ${c.path}`);

/** Writes `files` (name → content) to a fresh temp dir and returns its path. */
function dir(files: Record<string, string>): string {
  const d = tmp();
  for (const [n, c] of Object.entries(files)) {
    mkdirSync(join(d, n, '..'), { recursive: true });
    writeFileSync(join(d, n), c);
  }
  return d;
}

const settle = (page: Page) =>
  page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
const expectAxeClean = async (page: Page) => {
  await settle(page);
  await axe(page);
};
const desktopOnly = () => test.skip(test.info().project.name !== 'desktop');

async function openFile(page: Page, side: 0 | 1, name: string, content: string) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open file' }).nth(side).click();
  await (await chooser).setFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(content) });
}

/** Opens two files on Compare and runs the comparison. */
async function compareFiles(page: Page, a: [string, string], b: [string, string], before?: (p: Page) => Promise<void>) {
  await page.goto('/app/');
  await openFile(page, 0, a[0], a[1]);
  await openFile(page, 1, b[0], b[1]);
  if (before) await before(page);
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
}

async function openSample(page: Page, sample = 'openapi', hash = '') {
  await page.goto(`/app/?sample=${sample}${hash}`);
  await expect(page.getByRole('main')).not.toBeEmpty();
}

async function workspace(page: Page, hash = '') {
  await openSample(page, 'openapi', hash);
  if (!hash) await page.getByRole('tab', { name: 'Workspace' }).click();
  await expect(page.getByRole('tab', { name: 'Workspace', selected: true })).toBeVisible();
  const tree = page.getByRole('navigation', { name: 'Changes' });
  await expect(tree.locator('li > button').first()).toBeVisible();
  return tree;
}

/** Group headings and change titles of the Workspace tree, in order (`# ` marks a group). */
const treeRows = (page: Page) =>
  page
    .getByRole('navigation', { name: 'Changes' })
    .locator('li')
    .evaluateAll((lis) => lis.map((li) => (li.querySelector('button') ? (li.textContent ?? '').trim() : `# ${(li.textContent ?? '').trim()}`)));

const payments = (): Report => report(V1, V2);

// =====================================================================================================
// OA-01 … OA-05: parsing, $refs, detection, classification and the rule catalogue (built CLI)
// =====================================================================================================

test('OA-01 Swagger 2.0 (JSON) and OpenAPI 3.0 (YAML) are normalised to one model: the same Petstore gives no changes', () => {
  const r = report(join(SPECS, 'petstore-swagger2.json'), join(SPECS, 'petstore-3.0.yaml'));
  expect(r.inputs.before.specVersion).toBe('2.0');
  expect(r.inputs.after.specVersion).toBe('3.0.3');
  expect(r.changes).toEqual([]);
  // …and a real edit across the two formats is still found.
  const d = dir({ 'after.yaml': readFileSync(join(SPECS, 'petstore-3.0.yaml'), 'utf8').replace(/maximum: 100/, 'maximum: 50') });
  const edited = readFileSync(join(d, 'after.yaml'), 'utf8');
  test.skip(!/maximum: 50/.test(edited), 'petstore-3.0.yaml has no `maximum: 100` to tighten');
  expect(rows(report(join(SPECS, 'petstore-swagger2.json'), join(d, 'after.yaml')))).toContainEqual(expect.stringMatching(/^breaking request-param-constraint-tightened .*limit/));
});

test('OA-01 OpenAPI 3.2: QUERY method, additionalOperations and streamed itemSchema are compared', () => {
  const spec = (required: boolean, extra: string) => `openapi: 3.2.0
info: { title: Events, version: 1.0.0 }
paths:
  /events:
    query:
      operationId: searchEvents
      responses:
        '200':
          description: A stream of events
          content:
            application/jsonl:
              itemSchema:
                type: object
${required ? '                required: [id]\n' : ''}                properties:
                  id: { type: string }
    additionalOperations:
${extra}`;
  const d = dir({
    'v1.yaml': spec(true, `      PURGE:\n        operationId: purgeEvents\n        responses:\n          '204': { description: Purged }\n`),
    'v2.yaml': spec(false, `      LINK:\n        operationId: linkEvents\n        responses:\n          '204': { description: Linked }\n`),
  });
  const r = report(join(d, 'v1.yaml'), join(d, 'v2.yaml'));
  expect(r.inputs.before.specVersion).toBe('3.2.0');
  expect(rows(r)).toEqual([
    'breaking endpoint-removed PURGE /events',
    'breaking response-property-became-optional QUERY /events › response 200 › itemSchema › id',
    'safe endpoint-added LINK /events',
  ]);
});

test('OA-02 external $refs in sibling files resolve from any working directory', () => {
  const multi = join(SPECS, 'multi');
  const want = ['docs response-optional-property-removed schemas/card.yaml#Card › holder', 'breaking response-property-type-changed schemas/card.yaml#Card › last4'];
  for (const [cwd, b, a] of [
    [process.cwd(), join(multi, 'v1/openapi.yaml'), join(multi, 'v2/openapi.yaml')],
    [multi, 'v1/openapi.yaml', 'v2/openapi.yaml'],
    [join(multi, 'v1'), 'openapi.yaml', '../v2/openapi.yaml'],
  ] as const) {
    const r = report(b, a, {}, cwd);
    expect(rows(r), `cwd ${cwd}`).toEqual(want);
    expect(r.warnings ?? []).toEqual([]);
  }
});

test('OA-02 recursive schemas: a change inside a cycle (internal and external) is reported once, quickly', () => {
  const circ = readFileSync(join(SPECS, 'circular-3.1.yaml'), 'utf8');
  const people = readFileSync(join(SPECS, 'people.yaml'), 'utf8');
  const owner = circ.replace('        name:\n          type: string\n        nodes', '        name:\n          type: integer\n        nodes');
  expect(owner).not.toBe(circ);
  const d = dir({
    'a/openapi.yaml': circ,
    'a/people.yaml': people,
    'b/openapi.yaml': owner,
    'b/people.yaml': people,
    'c/openapi.yaml': circ,
    'c/people.yaml': people.replace('    name:\n      type: string', '    name:\n      type: integer'),
  });
  const t0 = Date.now();
  expect(rows(report('a/openapi.yaml', 'b/openapi.yaml', {}, d))).toEqual(['breaking response-property-type-changed components.schemas.Owner › name']);
  expect(rows(report('a/openapi.yaml', 'c/openapi.yaml', {}, d))).toEqual(['breaking response-property-type-changed people.yaml#Person › name']);
  expect(Date.now() - t0).toBeLessThan(10_000);
  // Deterministic: the same pair twice gives the same bytes.
  const run = () => cli(['a/openapi.yaml', 'b/openapi.yaml', '--ci', '--format', 'json', '--fail-on', 'none', '--config', configFile()], d).stdout;
  expect(run()).toBe(run());
});

test('OA-03 one pair of specs: changes in parameters, headers, bodies, responses, schemas, security, servers, webhooks and callbacks are all found', () => {
  // Every area of OA-03 with a fixture; each pair goes through the built CLI.
  const areas: Record<string, string> = {
    'request-param-became-required': 'parameters',
    'request-param-location-changed': 'parameter location (path/query/header/cookie)',
    'request-body-became-required': 'request body',
    'response-success-status-removed': 'status codes',
    'response-header-removed': 'response headers',
    'response-property-type-changed': 'schema types',
    'request-param-pattern-changed': 'constraints',
    'request-param-enum-value-removed': 'enums',
    'request-property-nullable-removed': 'nullability',
    'request-property-became-required': 'required',
    'request-allof-branch-added': 'allOf',
    'request-union-branch-removed': 'oneOf/anyOf',
    'security-scope-added': 'security scopes',
    'security-requirement-removed': 'security schemes',
    'server-url-changed': 'servers',
    'webhook-payload-property-removed': 'webhooks',
    'request-body-content-type-removed': 'content types',
    'endpoint-deprecated': 'deprecations',
  };
  for (const [rule, area] of Object.entries(areas)) {
    const r = report(join(RULES, rule, 'before.yaml'), join(RULES, rule, 'after.yaml'));
    expect(r.changes.map((c) => c.ruleId), `${area} (${rule})`).toContain(rule);
  }
  // Callbacks: reported as the contained change, with direction reversed (docs/06 callback-changed).
  const cb = report(join(RULES, 'callback-changed', 'before.yaml'), join(RULES, 'callback-changed', 'after.yaml')).changes;
  expect(cb.map((c) => `${c.direction} ${c.path}`)).toEqual([expect.stringMatching(/^response POST \/subscribe › callback onEvent › /)]);
  // Extensions are ignored by default (OA-12) and detected when asked.
  const ext = (cfg: object) => report(join(RULES, 'extension-changed', 'before.yaml'), join(RULES, 'extension-changed', 'after.yaml'), cfg).changes.map((c) => c.ruleId);
  expect(ext({})).toEqual([]);
  expect(ext({ ignore: { extensions: false } })).toEqual(['extension-changed']);
});

test('OA-04 classification is direction-aware: the same enum edit is judged differently in a request and a response', () => {
  const req = (values: string) => `openapi: 3.1.0
info: { title: t, version: 1.0.0 }
paths:
  /a:
    post:
      operationId: a
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                status: { type: string, enum: [${values}] }
      responses:
        '204': { description: ok }
`;
  const res = (values: string) => `openapi: 3.1.0
info: { title: t, version: 1.0.0 }
paths:
  /a:
    get:
      operationId: a
      responses:
        '200':
          description: ok
          content:
            application/json:
              schema:
                type: object
                properties:
                  status: { type: string, enum: [${values}] }
`;
  const d = dir({ 'req-ab.yaml': req('a, b'), 'req-a.yaml': req('a'), 'req-abc.yaml': req('a, b, c'), 'res-ab.yaml': res('a, b'), 'res-a.yaml': res('a'), 'res-abc.yaml': res('a, b, c') });
  const r = (a: string, b: string) => report(join(d, a), join(d, b)).changes.map((c) => `${c.severity} ${c.direction} ${c.ruleId}`);
  // Removing a value: breaks senders (request), harmless to readers (response).
  expect(r('req-ab.yaml', 'req-a.yaml')).toEqual(['breaking request request-property-enum-value-removed']);
  expect(r('res-ab.yaml', 'res-a.yaml').filter((x) => /^(breaking|possibly)/.test(x))).toEqual([]);
  // Adding a value: harmless to senders, may break readers.
  expect(r('req-ab.yaml', 'req-abc.yaml').filter((x) => /^(breaking|possibly)/.test(x))).toEqual([]);
  expect(r('res-ab.yaml', 'res-abc.yaml')).toEqual(['possibly response response-property-enum-value-added']);
  // All four classes exist in one real comparison.
  const s = payments().summary;
  expect([s.breaking, s.possibly, s.safe, s.docs]).toEqual([4, 1, 14, 9]);
});

// OA-05 (and X-09): every rule fixture through the built CLI, compared with its expected.json.
const ruleCases = readdirSync(RULES)
  .sort()
  .flatMap((id) =>
    readdirSync(join(RULES, id))
      .filter((f) => /^expected(\.\d+)?\.json$/.test(f))
      .sort()
      .map((f) => ({ id, suffix: f.slice('expected'.length, -'.json'.length) })),
  );

test('OA-05 every rule in the catalogue has a fixture directory with before, after and expected', () => {
  const dirs = readdirSync(RULES).sort();
  expect(dirs.length).toBeGreaterThanOrEqual(76);
  for (const id of dirs) for (const f of ['before.yaml', 'after.yaml', 'expected.json']) expect(existsSync(join(RULES, id, f)), `${id}/${f}`).toBe(true);
});

for (const { id, suffix } of ruleCases) {
  test(`OA-05 rule fixture ${id}${suffix}: the CLI reports the expected rules, severities and directions`, () => {
    const exp = JSON.parse(readFileSync(join(RULES, id, `expected${suffix}.json`), 'utf8')) as {
      config?: object;
      today?: string;
      changes: Array<Record<string, string>>;
      versionCheck?: Record<string, string>;
    };
    // Sunset fixtures are pinned to a date; the CLI uses the real clock. OA-17 below covers them with relative dates.
    test.skip(!!exp.today, `pinned to today = ${exp.today}; covered by the OA-17 tests`);
    const r = report(`before${suffix}.yaml`, `after${suffix}.yaml`, exp.config ?? {}, join(RULES, id));
    expect(r.changes.map((c) => ({ ruleId: c.ruleId, severity: c.severity, direction: c.direction, path: c.path, kind: c.kind }))).toEqual(exp.changes);
    if (exp.versionCheck) expect(r.versionCheck).toMatchObject(exp.versionCheck);
    // OA-07: every change carries an explanation.
    for (const c of r.changes) expect(c.explanation?.who && c.explanation.see && c.explanation.avoid, `${c.ruleId} explanation`).toBeTruthy();
  });
}

test('OA-05 security is judged per operation, including root-level security inherited by operations, for all four OAuth flows', () => {
  const flows = { implicit: 'authorizationUrl: https://a.example/auth', password: 'tokenUrl: https://a.example/token', clientCredentials: 'tokenUrl: https://a.example/token', authorizationCode: 'authorizationUrl: https://a.example/auth\n          tokenUrl: https://a.example/token' };
  for (const [flow, urls] of Object.entries(flows)) {
    const spec = (scopes: string) => `openapi: 3.1.0
info: { title: t, version: 1.0.0 }
security:
  - oauth: [${scopes}]
paths:
  /a:
    get:
      operationId: a
      responses: { '200': { description: ok } }
  /b:
    get:
      operationId: b
      security: []
      responses: { '200': { description: ok } }
components:
  securitySchemes:
    oauth:
      type: oauth2
      flows:
        ${flow}:
          ${urls}
          scopes:
            read: Read
            write: Write
`;
    const d = dir({ 'a.yaml': spec('read'), 'b.yaml': spec('read, write') });
    // GET /a inherits the root requirement and now needs a new scope; GET /b opts out and is untouched.
    expect(rows(report(join(d, 'a.yaml'), join(d, 'b.yaml'))), flow).toEqual(['breaking security-scope-added GET /a › security']);
  }
});

// =====================================================================================================
// OA-06 … OA-19 (CLI and app)
// =====================================================================================================

test('OA-06 path-parameter rename is not reported as removal (unless path-parameter names are asked to matter)', () => {
  const b = join(RULES, 'path-param-renamed/before.yaml');
  const a = join(RULES, 'path-param-renamed/after.yaml');
  expect(rows(report(b, a))).toEqual(['safe path-param-renamed /users/{userId}']);
  expect(report(b, a).changes.map((c) => c.ruleId)).not.toContain('endpoint-removed');
  expect(report(b, a, { openapi: { includePathParamNames: true } }).changes.map((c) => c.ruleId)).toEqual(['endpoint-removed', 'endpoint-added']);
});

test('OA-07 the change inspector explains who it breaks, what they will see and how to avoid it (same text as the CLI report)', async ({ page }) => {
  desktopOnly();
  const removed = payments().changes.find((c) => c.ruleId === 'endpoint-removed')!;
  const plain = (s: string) => s.replace(/[`*]/g, '').replace(/\s+/g, ' ').trim();
  await workspace(page, `#change=${removed.id}`);
  await expect(page.getByRole('heading', { level: 2, name: /Endpoint removed/ })).toBeVisible();
  const inspector = page.getByRole('complementary').filter({ has: page.getByRole('heading', { name: 'Why it breaks' }) });
  await expect(inspector.getByRole('heading', { name: 'How to avoid it' })).toBeVisible();
  const text = plain(await inspector.innerText());
  expect(text).toContain(plain(`${removed.explanation!.who} ${removed.explanation!.see}`));
  expect(text).toContain(plain(removed.explanation!.avoid));
  // Explain in detail opens the full explanation.
  await page.getByRole('button', { name: 'Explain in detail' }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('heading', { name: /Endpoint removed/ }).first()).toBeVisible();
  await expectAxeClean(page);
});

test('OA-08 summary: counts per severity, change-type breakdown, suggested version and the version-check verdict', async ({ page }) => {
  desktopOnly();
  const r = payments();
  await openSample(page);
  await expect(page.getByRole('tab', { name: 'Summary', selected: true })).toBeVisible();
  for (const [label, n] of [['Breaking', r.summary.breaking], ['Possibly breaking', r.summary.possibly], ['Safe', r.summary.safe], ['Docs only', r.summary.docs]] as const)
    await expect(page.getByRole('region', { name: `${label}: ${n}` })).toBeVisible();
  const version = page.getByRole('region', { name: 'Suggested version' });
  await expect(version).toContainText(r.versionCheck!.suggested);
  await expect(version).toContainText(r.versionCheck!.message);
  // Breakdown by change type, the same numbers as the report.
  const where = page.locator('section[aria-labelledby="where-h"]');
  await expect(where.getByRole('heading', { name: `Where the ${r.summary.total} changes are` })).toBeVisible();
  const shown = await where.locator('dl > div').evaluateAll((ds) => Object.fromEntries(ds.map((d) => [d.querySelector('dt')!.textContent!.trim(), Number(d.querySelector('dd')!.textContent!.trim())])));
  // The designed areas are always listed (A-04: Security shows 0 when nothing changed there).
  expect(Object.fromEntries(Object.entries(shown).filter(([, n]) => n > 0))).toEqual(r.summary.byArea);
  await expectAxeClean(page);
});

test('OA-08 version check: a breaking change without a major bump gets a "missing" verdict, in the app and as a CLI gate', async ({ page }) => {
  desktopOnly();
  const b = join(RULES, 'version-bump-missing/before.yaml');
  const a = join(RULES, 'version-bump-missing/after.yaml');
  const r = report(b, a);
  expect(r.versionCheck?.verdict).toBe('missing-major');
  const gate = cli([b, a, '--ci', '--fail-on', 'missing-version-bump', '--config', configFile()]);
  expect(gate.status).toBe(1);
  await compareFiles(page, ['before.yaml', readFileSync(b, 'utf8')], ['after.yaml', readFileSync(a, 'utf8')]);
  const version = page.getByRole('region', { name: 'Suggested version' });
  await expect(version).toContainText(r.versionCheck!.message);
  await expect(version.locator('[data-verdict="missing-major"]')).toBeVisible();
});

test('OA-09 explorer: group by path, tag, schema and severity; severity filters; text and JSONPath search', async ({ page }) => {
  desktopOnly();
  const r = payments();
  const tree = await workspace(page);
  const groupBy = tree.getByLabel('Group by');
  const groups = async () => (await treeRows(page)).filter((x) => x.startsWith('# ')).map((x) => x.slice(2));

  expect(await groups()).toEqual(expect.arrayContaining(['/v1/payments', 'components.schemas.Card']));
  await groupBy.selectOption('tag');
  // OpenAPI tags, not path segments: GET /v1/customers/{id}/cards is tagged [customers, cards].
  await expect.poll(groups).toEqual(expect.arrayContaining(['payments', 'refunds', 'customers', 'payouts']));
  expect(await groups()).not.toContain('{id}');
  await groupBy.selectOption('schema');
  await expect.poll(groups).toEqual(expect.arrayContaining(['components.schemas.Card', 'components.schemas.Payment', 'Operations']));
  await groupBy.selectOption('severity');
  // Docs-only changes collapse into one "N operations" row under All (B-30).
  await expect.poll(groups).toEqual(['Breaking', 'Possibly breaking', 'Safe', expect.stringMatching(/^\d+ operations$/)]);

  const items = tree.locator('li > button');
  await tree.getByRole('button', { name: `Breaking ${r.summary.breaking}` }).click();
  await expect(items).toHaveCount(r.summary.breaking);
  await tree.getByRole('button', { name: `Safe ${r.summary.safe}` }).click();
  await expect(items).toHaveCount(r.summary.safe);
  await tree.getByRole('button', { name: `All ${r.summary.total}` }).click();

  const search = tree.getByRole('textbox', { name: 'Search changes or JSONPath' });
  await search.fill("$.paths['/v1/refunds']");
  const refunds = r.changes.filter((c) => c.jsonPath?.startsWith("$.paths['/v1/refunds']")).length;
  expect(refunds).toBeGreaterThan(0);
  await expect(items).toHaveCount(refunds);
  await search.fill('$.components.schemas.Card');
  await expect(items).toHaveCount(r.changes.filter((c) => c.jsonPath?.startsWith('$.components.schemas.Card')).length);
  await search.fill('last4');
  await expect(items).toHaveCount(1);
  await expectAxeClean(page);
});

test('OA-10 change detail: before/after with source line numbers, side by side and inline', async ({ page }) => {
  desktopOnly();
  const c = payments().changes.find((x) => x.ruleId === 'request-property-became-required')!;
  await workspace(page, `#change=${c.id}`);
  await expect(page.getByRole('heading', { level: 2, name: /currency is now required/ })).toBeVisible();
  const before = page.getByRole('region', { name: 'Before: payments-v1.yaml' });
  const after = page.getByRole('region', { name: 'After: payments-v2.yaml' });
  await expect(before).toBeVisible();
  await expect(after).toContainText('currency');
  // Source line numbers: the after pane shows the line the report points at.
  const line = (await page.locator('main').innerText()).match(/payments-v2\.yaml:(\d+):\d+/)?.[1];
  expect(line).toBeTruthy();
  await expect(after).toContainText(line!);
  // Inline layout (review view).
  await page.getByRole('button', { name: /^To review/ }).click();
  await page.getByRole('radio', { name: 'Inline' }).click();
  const inline = page.getByRole('region', { name: 'Inline: payments-v1.yaml to payments-v2.yaml' });
  await expect(inline).toBeVisible();
  await expect(inline).toContainText('(added)');
  await expect(inline).toContainText('(removed)');
  await expectAxeClean(page);
  await page.getByRole('radio', { name: 'Side by side' }).click();
  await expect(page.getByRole('region', { name: 'After: payments-v2.yaml' })).toBeVisible();
});

test('OA-11 raw diff: gutter severity markers open their change, and a change opens on its raw line', async ({ page }) => {
  desktopOnly();
  const removed = payments().changes.find((c) => c.ruleId === 'endpoint-removed')!;
  await openSample(page);
  await page.getByRole('tab', { name: 'Raw diff' }).click();
  const diff = page.getByRole('region', { name: 'Diff of payments-v1.yaml and payments-v2.yaml' });
  await expect(diff).toBeVisible();
  const markers = diff.locator('button[data-sev]');
  expect(await markers.count()).toBeGreaterThan(0);
  expect(new Set(await markers.allTextContents())).toEqual(new Set(['!', '?', '+', '¶']));
  // Line → change.
  await diff.locator('button[data-sev="breaking"]', { hasText: '!' }).first().click();
  await expect(page.getByRole('note')).toContainText(/Breaking/);
  // Change → line: a deep link to the removed endpoint, then Raw diff, shows its callout in the diff.
  await page.goto('about:blank'); // a fresh load, not a same-document hash change
  await openSample(page, 'openapi', `#change=${removed.id}`);
  await expect(page.getByRole('heading', { level: 2, name: /Endpoint removed/ })).toBeVisible();
  await page.getByRole('tab', { name: 'Raw diff' }).click();
  const note = page.getByRole('note');
  await expect(note).toContainText('Endpoint removed');
  await expect(note).toBeInViewport();
  await note.getByRole('button', { name: 'Open in workspace' }).click();
  await expect(page.getByRole('heading', { level: 2, name: /Endpoint removed/ })).toBeVisible();
});

test('OA-12 noise control: hide docs-only (app), ignore examples and ignore extensions (CLI)', async ({ page }) => {
  desktopOnly();
  const r = payments();
  await compareFiles(page, ['payments-v1.yaml', readFileSync(V1, 'utf8')], ['payments-v2.yaml', readFileSync(V2, 'utf8')], async (p) => {
    await p.getByRole('checkbox', { name: 'Hide docs-only changes' }).click();
  });
  await expect(page.getByRole('region', { name: 'Docs only: 0' })).toBeVisible();
  await expect(page.getByRole('heading', { name: `Where the ${r.summary.total - r.summary.docs} changes are` })).toBeVisible();
  // CLI: the same option, plus ignore examples and extensions.
  expect(report(V1, V2, { openapi: { hideDocsOnly: true } }).summary.docs).toBe(0);
  const ex = (cfg: object) => report(join(RULES, 'example-changed/before.yaml'), join(RULES, 'example-changed/after.yaml'), cfg).changes.map((c) => c.ruleId);
  expect(ex({})).toEqual(['example-changed']);
  expect(ex({ openapi: { ignoreExamples: true } })).toEqual([]);
  const ext = (cfg: object) => report(join(RULES, 'extension-changed/before.yaml'), join(RULES, 'extension-changed/after.yaml'), cfg).changes.length;
  expect(ext({})).toBe(0);
  expect(ext({ ignore: { extensions: false } })).toBe(1);
});

test('OA-13 deep link: #change=<id> opens that change; clicking another change rewrites the hash', async ({ page }) => {
  desktopOnly();
  const r = payments();
  const target = r.changes.find((c) => c.ruleId === 'request-param-became-optional')!;
  await page.goto(`/app/?sample=openapi#change=${target.id}`);
  await expect(page.getByRole('tab', { name: 'Workspace', selected: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: /Idempotency-Key/ })).toBeVisible();
  const tree = page.getByRole('navigation', { name: 'Changes' });
  await tree.getByRole('button', { name: /last4/ }).first().click();
  const last4 = r.changes.find((c) => c.path.includes('last4'))!;
  await expect(page).toHaveURL(new RegExp(`#change=${last4.id}$`));
  await page.goto(`/app/?sample=openapi#change=${last4.id}`);
  await expect(page.getByRole('heading', { level: 2, name: /last4/ })).toBeVisible();
});

test('OA-14 a shared-schema change is reported once, at the schema, listing the endpoints that use it', async ({ page }) => {
  desktopOnly();
  const r = payments();
  const last4 = r.changes.filter((c) => c.path.includes('last4'));
  expect(last4).toHaveLength(1);
  expect(last4[0]!.path).toBe('components.schemas.Card › last4');
  expect(last4[0]!.sharedSchema).toMatchObject({ name: 'Card', usageCount: 3 });
  await workspace(page, `#change=${last4[0]!.id}`);
  const tree = page.getByRole('navigation', { name: 'Changes' });
  await expect(tree.getByRole('button', { name: /last4/ })).toHaveCount(1);
  await expect(page.getByText('Shared · 3 endpoints')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Endpoints that return Card' })).toBeVisible();
  const usages = page.getByRole('heading', { name: 'Endpoints that return Card' }).locator('xpath=following-sibling::ul[1]').locator('li');
  await expect(usages).toHaveCount(3);
  for (const u of last4[0]!.sharedSchema!.usages) await expect(usages.filter({ hasText: u.split(' ')[1]! })).not.toHaveCount(0);
  // Summary lists it once too.
  await page.getByRole('tab', { name: 'Summary' }).click();
  const shared = page.locator('section[aria-labelledby="shared-h"]');
  await expect(shared.getByRole('button', { name: /Card.*3 endpoints/ })).toHaveCount(1);
});

test('OA-15 changes are grouped under the source block that caused them (the component edited)', async ({ page }) => {
  desktopOnly();
  const r = payments();
  for (const c of r.changes.filter((x) => x.path.startsWith('components.schemas.Card'))) expect(c.sourceBlock).toBe('components.schemas.Card');
  await workspace(page);
  const list = await treeRows(page);
  const at = list.indexOf('# components.schemas.Card');
  expect(at, list.join(' | ')).toBeGreaterThanOrEqual(0);
  const next = list.findIndex((x, i) => i > at && x.startsWith('# '));
  const under = list.slice(at + 1, next < 0 ? undefined : next);
  expect(under.some((x) => /last4/.test(x))).toBe(true);
  expect(under.some((x) => /fingerprint/.test(x))).toBe(true);
  expect(under.every((x) => !/currency|refund/i.test(x))).toBe(true);
});

test('OA-16 nullable: true, type [x, "null"] and oneOf with {type: "null"} are one concept: no false changes', () => {
  const forms = {
    nullable30: ['3.0.3', '{ type: string, nullable: true }'],
    typeArray: ['3.1.0', "{ type: [string, 'null'] }"],
    oneOfNull: ['3.1.0', "{ oneOf: [{ type: 'null' }, { type: string }] }"],
  } as const;
  const spec = ([v, schema]: readonly [string, string]) => `openapi: ${v}
info: { title: t, version: 1.0.0 }
paths:
  /a:
    get:
      operationId: a
      responses:
        '200':
          description: ok
          content:
            application/json:
              schema:
                type: object
                properties:
                  nick: ${schema}
`;
  const d = dir(Object.fromEntries(Object.entries(forms).map(([k, f]) => [`${k}.yaml`, spec(f)])));
  for (const a of Object.keys(forms)) for (const b of Object.keys(forms)) {
    expect(report(join(d, `${a}.yaml`), join(d, `${b}.yaml`)).changes, `${a} → ${b}`).toEqual([]);
    expect(report(join(d, `${a}.yaml`), join(d, `${b}.yaml`), { openapi: { autoUpgrade: false } }).changes, `${a} → ${b}, no upgrade`).toEqual([]);
  }
  // A real nullability removal is still reported.
  expect(report(join(RULES, 'request-property-nullable-removed/before.yaml'), join(RULES, 'request-property-nullable-removed/after.yaml')).changes.map((c) => c.ruleId)).toEqual(['request-property-nullable-removed']);
});

test('OA-17 sunset policy: moving x-sunset earlier is breaking; a sunset inside the grace period is breaking; the grace period is configurable', () => {
  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const spec = (sunset?: string) => `openapi: 3.1.0
info: { title: t, version: 1.0.0 }
paths:
  /a:
    get:
      operationId: getA
      responses: { '200': { description: ok } }
      deprecated: true
${sunset ? `      x-sunset: ${sunset}\n` : ''}`;
  const d = dir({ 'late.yaml': spec(day(400)), 'early.yaml': spec(day(300)), 'soon.yaml': spec(day(30)), 'none.yaml': spec() });
  const r = (a: string, b: string, cfg: object = {}) => rows(report(join(d, a), join(d, b), cfg));
  expect(r('late.yaml', 'early.yaml')).toEqual(['breaking sunset-date-moved-earlier GET /a']);
  expect(r('early.yaml', 'late.yaml').filter((x) => x.startsWith('breaking'))).toEqual([]);
  // 30 days away with the default 90-day grace period.
  expect(r('none.yaml', 'soon.yaml')).toContain('breaking sunset-inside-grace-period GET /a');
  expect(r('none.yaml', 'soon.yaml', { openapi: { sunsetGracePeriodDays: 10 } })).not.toContain('breaking sunset-inside-grace-period GET /a');
  expect(r('late.yaml', 'none.yaml')).toEqual(['possibly sunset-date-removed GET /a']);
});

test('OA-18 each comparison option changes the result: inline vs $ref, header case, allOf, path-level params, 3.0 upgrade, path-param names', () => {
  const doc = (body: string) => `openapi: 3.1.0\ninfo: { title: t, version: 1.0.0 }\npaths:\n${body}`;
  const d = dir({
    'h1.yaml': doc(`  /a:\n    get:\n      operationId: a\n      parameters:\n        - { name: X-Request-Id, in: header, required: true, schema: { type: string } }\n      responses: { '200': { description: ok } }\n`),
    'h2.yaml': doc(`  /a:\n    get:\n      operationId: a\n      parameters:\n        - { name: x-request-id, in: header, required: true, schema: { type: string } }\n      responses: { '200': { description: ok } }\n`),
    'a1.yaml': doc(`  /a:\n    get:\n      operationId: a\n      responses:\n        '200':\n          description: ok\n          content:\n            application/json:\n              schema:\n                allOf:\n                  - { type: object, required: [id], properties: { id: { type: string } } }\n                  - { type: object, properties: { name: { type: string } } }\n`),
    'a2.yaml': doc(`  /a:\n    get:\n      operationId: a\n      responses:\n        '200':\n          description: ok\n          content:\n            application/json:\n              schema:\n                type: object\n                required: [id]\n                properties:\n                  id: { type: string }\n                  name: { type: string }\n`),
    'p1.yaml': doc(`  /a:\n    parameters:\n      - { name: q, in: query, required: true, schema: { type: string } }\n    get:\n      operationId: a\n      responses: { '200': { description: ok } }\n`),
    'p2.yaml': doc(`  /a:\n    get:\n      operationId: a\n      parameters:\n        - { name: q, in: query, required: true, schema: { type: string } }\n      responses: { '200': { description: ok } }\n`),
    'u1.yaml': `openapi: 3.0.3\ninfo: { title: t, version: 1.0.0 }\npaths:\n  /a:\n    get:\n      operationId: a\n      parameters:\n        - { name: n, in: query, schema: { type: integer, maximum: 10, exclusiveMaximum: true } }\n      responses: { '200': { description: ok } }\n`,
    'u2.yaml': doc(`  /a:\n    get:\n      operationId: a\n      parameters:\n        - { name: n, in: query, schema: { type: integer, exclusiveMaximum: 10 } }\n      responses: { '200': { description: ok } }\n`),
  });
  const n = (a: string, b: string, openapi: object = {}) => report(join(d, a), join(d, b), { openapi }).changes.length;
  const fx = (rule: string) => [join(RULES, rule, 'before.yaml'), join(RULES, rule, 'after.yaml')] as const;
  // [option, default result, result with the option flipped]
  expect(report(...fx('inline-ref-equivalent')).changes).toEqual([]);
  expect(report(...fx('inline-ref-equivalent'), { openapi: { matchInlineRefs: false } }).changes.map((c) => c.ruleId)).toEqual(['inline-ref-equivalent']);
  expect(n('h1.yaml', 'h2.yaml')).toBe(0);
  expect(n('h1.yaml', 'h2.yaml', { caseInsensitiveHeaders: false })).toBeGreaterThan(0);
  expect(n('a1.yaml', 'a2.yaml')).toBeGreaterThan(0);
  expect(n('a1.yaml', 'a2.yaml', { flattenAllOf: true })).toBe(0);
  expect(n('p1.yaml', 'p2.yaml')).toBe(0);
  expect(n('p1.yaml', 'p2.yaml', { mergePathParams: false })).toBeGreaterThan(0);
  expect(n('u1.yaml', 'u2.yaml')).toBe(0);
  expect(n('u1.yaml', 'u2.yaml', { autoUpgrade: false })).toBeGreaterThan(0);
  expect(report(...fx('path-param-renamed')).changes.map((c) => c.ruleId)).toEqual(['path-param-renamed']);
  expect(report(...fx('path-param-renamed'), { openapi: { includePathParamNames: true } }).changes.map((c) => c.ruleId)).toEqual(['endpoint-removed', 'endpoint-added']);
});

test('OA-19 strictness presets: Wire vs SDK changes an operationId rename from possibly to breaking (CLI and app)', async ({ page }) => {
  desktopOnly();
  const b = join(RULES, 'operation-id-changed/before.yaml');
  const a = join(RULES, 'operation-id-changed/after.yaml');
  expect(rows(report(b, a))).toEqual(['possibly operation-id-changed GET /a']);
  expect(rows(report(b, a, { preset: 'sdk' }))).toEqual(['breaking operation-id-changed GET /a']);
  await compareFiles(page, ['before.yaml', readFileSync(b, 'utf8')], ['after.yaml', readFileSync(a, 'utf8')]);
  await expect(page.getByRole('region', { name: 'Possibly breaking: 1' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Breaking: 0' })).toBeVisible();
  await page.getByRole('radio', { name: 'SDK' }).click();
  await expect(page.getByRole('region', { name: 'Breaking: 1' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Possibly breaking: 0' })).toBeVisible();
  await page.getByRole('radio', { name: 'Wire' }).click();
  await expect(page.getByRole('region', { name: 'Possibly breaking: 1' })).toBeVisible();
});

// =====================================================================================================
// OA-20 … OA-22 (app, with the CLI for decisions)
// =====================================================================================================

test('OA-20 SDK-impact view names the client call in TypeScript, Python, Java and Go', async ({ page }) => {
  desktopOnly();
  await workspace(page);
  await page.getByRole('radio', { name: 'SDK calls' }).click();
  const sdk = page.locator('section[aria-labelledby="sdk-h"]');
  await expect(sdk.getByRole('heading', { name: 'As your SDK users see it' })).toBeVisible();
  const calls: Record<string, RegExp> = {
    TypeScript: /payments\.create\(\{ currency \}\)/,
    Python: /payments\.create\(currency=…\)/,
    Java: /client\.payments\(\)\.create\(currency\)/,
    Go: /client\.Payments\.Create\(ctx, currency\)/,
  };
  for (const [lang, call] of Object.entries(calls)) {
    await sdk.getByRole('radio', { name: lang }).click();
    await expect(sdk.locator('code').filter({ hasText: call }).first(), lang).toBeVisible();
  }
  // Breaking rows come first.
  await expect(sdk.locator('li').first()).toContainText('Breaking');
  await expectAxeClean(page);
});

test('OA-21 decisions made in the app (accept, reject, note) are written to decisions.json and gate the CLI', async ({ page }) => {
  desktopOnly();
  await workspace(page);
  await page.getByRole('button', { name: /^To review/ }).click();
  await expect(page.getByText('0 of 5 decided')).toBeVisible();
  // Accept four, reject one with a note.
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('a');
    await expect(page.getByText(`${i + 1} of 5 decided`)).toBeVisible();
    await page.keyboard.press('n');
  }
  await page.keyboard.press('r');
  await expect(page.getByText('5 of 5 decided')).toBeVisible();
  await expect(page.getByText('4 accepted · 1 rejected · 0 open')).toBeVisible();
  const note = page.getByRole('textbox', { name: 'Note (optional)' });
  await note.fill('Needs a deprecation first');
  await note.blur();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download decisions.json' }).click();
  const body = JSON.parse(readFileSync(await (await dl).path(), 'utf8')) as { version: number; decisions: Record<string, { decision: string; note?: string }> };
  const ds = Object.values(body.decisions);
  expect(ds.filter((d) => d.decision === 'accepted')).toHaveLength(4);
  expect(ds.filter((d) => d.decision === 'rejected').map((d) => d.note)).toEqual(['Needs a deprecation first']);

  // Stable fingerprints: the app's keys are the CLI's fingerprints for the same inputs.
  const r = payments();
  const fps = new Set(r.changes.map((c) => c.fingerprint));
  for (const k of Object.keys(body.decisions)) expect(fps.has(k), k).toBe(true);

  // The CLI honours the file: a rejected change fails; accepting it too passes.
  const repo = tmp('sd-cov-dec-');
  copyFileSync(V1, join(repo, 'v1.yaml'));
  copyFileSync(V2, join(repo, 'v2.yaml'));
  mkdirSync(join(repo, '.specdiff'));
  writeFileSync(join(repo, '.specdiff/decisions.json'), JSON.stringify(body));
  const cfg = configFile({ failOn: 'possibly' });
  expect(cli(['v1.yaml', 'v2.yaml', '--ci', '--config', cfg], repo).status).toBe(1);
  for (const d of ds) d.decision = 'accepted';
  writeFileSync(join(repo, '.specdiff/decisions.json'), JSON.stringify(body));
  const ok = cli(['v1.yaml', 'v2.yaml', '--ci', '--config', cfg], repo);
  expect(ok.status, ok.stderr).toBe(0);
});

test('OA-22 changes that affect me from a HAR file: filtered list, call counts, and the requests that will fail', async ({ page }) => {
  desktopOnly();
  const entry = (method: string, url: string) => ({ request: { method, url, headers: [], queryString: [] }, response: { status: 200 } });
  const har = {
    log: {
      version: '1.2',
      entries: [
        entry('DELETE', 'https://api.example.com/v1/refunds/re_1'),
        entry('GET', 'https://api.example.com/v1/payments?limit=80'),
        entry('GET', 'https://api.example.com/v1/payments?limit=10'),
        entry('GET', 'https://api.example.com/v1/payments/pay_1'),
      ],
    },
  };
  await workspace(page);
  await page.getByRole('button', { name: 'Affects me' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Or choose a HAR file').click();
  await (await chooser).setFiles({ name: 'app.har', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(har)) });
  await expect(page.getByRole('status').filter({ hasText: 'Only changes to the 3 endpoints in app.har' })).toBeVisible();
  const table = page.getByRole('region', { name: 'Changes that affect you' });
  const trs = table.locator('tbody tr');
  await expect(trs.first()).toBeVisible();
  // Only the three endpoints the HAR calls.
  const endpoints = await trs.evaluateAll((rs) => rs.map((r) => `${r.children[1]!.textContent!.trim()} ${r.children[2]!.textContent!.trim()}`));
  for (const e of endpoints) expect(['DELETE /v1/refunds/{id}', 'GET /v1/payments', 'GET /v1/payments/{id}']).toContain(e);
  // Call counts: GET /v1/payments was called twice.
  const limitRow = trs.filter({ hasText: /limit/i }).first();
  await expect(limitRow.locator('td').last()).toHaveText('2');
  // Requests that will fail.
  await expect(table.getByText('1 calls to DELETE /v1/refunds/{id}, which is removed')).toBeVisible();
  await expect(table.getByText('1 calls with limit above 50')).toBeVisible();
  await expectAxeClean(page);
});

// =====================================================================================================
// X-01 … X-13
// =====================================================================================================

test('X-01 no content leaves the browser: every request across all five samples, the Viewer and a share link stays on the app origin, GET only (X-10: no analytics)', async ({ page, context }) => {
  desktopOnly();
  test.setTimeout(90_000);
  const seen: Array<{ url: string; method: string; post: string | null }> = [];
  context.on('request', (r) => seen.push({ url: r.url(), method: r.method(), post: r.postData() }));
  for (const s of ['text', 'json', 'markdown', 'code', 'openapi']) {
    await openSample(page, s);
    await page.waitForLoadState('networkidle');
  }
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Open in Viewer' }).click();
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Back to comparison' }).click();
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const link = await page.getByRole('textbox', { name: 'Share link' }).inputValue();
  expect(link).toMatch(/#v=/);
  const other = await context.newPage();
  await other.goto(link);
  await expect(other.getByRole('tab', { name: 'Summary', selected: true })).toBeVisible();
  await other.waitForLoadState('networkidle');

  expect(seen.length).toBeGreaterThan(10);
  const foreign = seen.filter((r) => !r.url.startsWith('http://localhost:4173/') && !r.url.startsWith('data:') && !r.url.startsWith('blob:'));
  expect(foreign.map((r) => r.url)).toEqual([]);
  expect(seen.filter((r) => r.method !== 'GET').map((r) => `${r.method} ${r.url}`)).toEqual([]);
  // The share payload lives in the hash, which is never sent.
  expect(seen.some((r) => r.url.includes('#v='))).toBe(false);
  expect(seen.filter((r) => /currency|last4/.test(r.url))).toEqual([]);
});

test('X-02 parsing and diffing run in a Web Worker, and long lists are virtualised', async ({ page }) => {
  desktopOnly();
  const workers: string[] = [];
  page.on('worker', (w) => workers.push(w.url()));
  await page.goto('/app/');
  await page.getByRole('textbox', { name: 'Before' }).fill(Array.from({ length: 3000 }, (_, i) => `line ${i}`).join('\n'));
  await page.getByRole('textbox', { name: 'After' }).fill(Array.from({ length: 3000 }, (_, i) => `line ${i}${i % 2 ? ' changed' : ''}`).join('\n'));
  await page.getByRole('combobox', { name: 'Compare as' }).selectOption('text');
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.getByRole('heading', { name: /lines differ/ })).toBeVisible({ timeout: 60_000 });
  expect(workers.some((u) => /engine\.worker/.test(u)), workers.join(', ')).toBe(true);
  // 1,500 changed lines; only rows near the viewport are in the DOM.
  const rendered = await page.locator('main [data-index]').count();
  expect(rendered).toBeGreaterThan(0);
  expect(rendered).toBeLessThan(400);
});

test('X-03 code splitting: start-up loads no diff renderer, tree-sitter, Markdown or Viewer chunk; each loads when needed', async ({ page, context }) => {
  desktopOnly();
  test.setTimeout(90_000);
  let scripts: string[] = [];
  // The PWA service worker precaches every asset in the background after install (offline use, PK/pwa.spec);
  // those fetches are not the page loading code, so only page-initiated requests count here.
  context.on('request', (r) => {
    if (r.serviceWorker()) return;
    if (/\.(js|wasm)$/.test(new URL(r.url()).pathname)) scripts.push(new URL(r.url()).pathname.split('/').pop()!);
  });
  const lazy = /^(TextResult|MarkdownResult|CodeResult|JsonResult|OpenApiResult|ViewerScreen|tree-sitter|web-tree-sitter|lang-)/;
  await page.goto('/app/');
  await expect(page.getByRole('heading', { name: 'Compare two files' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(scripts.filter((s) => lazy.test(s))).toEqual([]);

  const loads = async (sample: string, want: RegExp) => {
    scripts = [];
    await openSample(page, sample);
    await page.waitForLoadState('networkidle');
    await expect.poll(() => scripts.filter((s) => want.test(s)).length, `${sample} loads ${want}`).toBeGreaterThan(0);
  };
  await loads('markdown', /^MarkdownResult/);
  await loads('code', /^tree-sitter-java|^web-tree-sitter/);
  await loads('text', /^TextResult/);
  await page.goto('/app/?sample=openapi');
  await expect(page.getByRole('tab', { name: 'Summary', selected: true })).toBeVisible();
  await page.waitForLoadState('networkidle');
  scripts = [];
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Open in Viewer' }).click();
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await expect.poll(() => scripts.filter((s) => /^ViewerScreen/.test(s)).length).toBeGreaterThan(0);
});

test('X-06 severity is never colour alone: every change row in the Workspace tree shows its symbol (! ? + ¶)', async ({ page }) => {
  desktopOnly();
  // Was a defect (8 px dot, colour alone); fixed: the compact chip shows its symbol.
  await workspace(page);
  // Raw diff and pills do pair colour with symbols.
  const visibleSymbols = await page
    .getByRole('navigation', { name: 'Changes' })
    .locator('li > button')
    .evaluateAll((bs) =>
      bs.map((b) => {
        let out = '';
        for (const el of [b, ...b.querySelectorAll('*')]) {
          for (const p of ['::before', '::after']) {
            const c = getComputedStyle(el, p).content;
            if (c && c !== 'none' && c !== 'normal') out += c.replace(/"/g, '');
          }
          for (const n of el.childNodes) {
            if (n.nodeType !== 3) continue;
            const r = (n.parentElement as HTMLElement).getBoundingClientRect();
            if (r.width > 1 && r.height > 1) out += n.textContent;
          }
        }
        return out;
      }),
    );
  expect(visibleSymbols.length).toBeGreaterThan(0);
  expect(visibleSymbols.filter((t) => !/[!?+¶]/.test(t))).toEqual([]);
});

test('X-06 diff and severity symbols in the OpenAPI raw diff, text and JSON results', async ({ page }) => {
  desktopOnly();
  await openSample(page);
  await page.getByRole('tab', { name: 'Raw diff' }).click();
  const raw = page.getByRole('region', { name: /^Diff of / });
  await expect(raw).toBeVisible();
  const gut = new Set(await raw.locator('[data-kind="add"], [data-kind="del"]').evaluateAll((els) => els.map((e) => (e.children[3]?.textContent ?? '').trim())));
  expect(gut).toEqual(new Set(['+', '−']));
  // Severity pills carry their symbol.
  await page.getByRole('tab', { name: 'Summary' }).click();
  for (const sym of ['!', '?', '+', '¶']) await expect(page.locator('main [aria-hidden="true"]', { hasText: new RegExp(`^\\${sym}$`) }).first()).toBeVisible();
  await openSample(page, 'text');
  await expect(page.getByRole('heading', { name: /lines differ/ })).toBeVisible();
  await expect(page.locator('main').getByText('−', { exact: true }).first()).toBeVisible();
  await expect(page.locator('main').getByText('+', { exact: true }).first()).toBeVisible();
});

test('X-13 deterministic output: two CLI runs on the same inputs give byte-identical reports (json, md, html) and fingerprints', () => {
  const d = tmp('sd-cov-x13-');
  const cfg = configFile();
  const out: Record<string, Buffer[]> = {};
  for (const fmt of ['json', 'md', 'html']) {
    out[fmt] = [1, 2].map((i) => {
      const f = join(d, `r${i}.${fmt}`);
      const r = cli([V1, V2, '--ci', '--format', fmt, '--fail-on', 'none', '--config', cfg, '--out', f]);
      expect(r.status, r.stderr).toBe(0);
      return readFileSync(f);
    });
    expect(out[fmt]![0]!.length, fmt).toBeGreaterThan(100);
    expect(out[fmt]![0]!.equals(out[fmt]![1]!), `${fmt} byte-identical`).toBe(true);
  }
  // Fingerprints are unique and stable across runs.
  const fps = (JSON.parse(out.json![0]!.toString()) as Report).changes.map((c) => c.fingerprint);
  expect(new Set(fps).size).toBe(fps.length);
  // The same inputs from another working directory give the same fingerprints.
  copyFileSync(V1, join(d, 'payments-v1.yaml'));
  copyFileSync(V2, join(d, 'payments-v2.yaml'));
  expect(report('payments-v1.yaml', 'payments-v2.yaml', {}, d).changes.map((c) => c.fingerprint)).toEqual(fps);
});

test('X-13 the app\'s JSON report export is byte-identical across two loads and matches the CLI fingerprints', async ({ page }) => {
  desktopOnly();
  const exportJson = async () => {
    await openSample(page);
    await expect(page.getByRole('tab', { name: 'Summary', selected: true })).toBeVisible();
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const dl = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: /JSON report/ }).click();
    return readFileSync(await (await dl).path());
  };
  const a = await exportJson();
  const b = await exportJson();
  expect(a.equals(b)).toBe(true);
  const app = (JSON.parse(a.toString()) as Report).changes.map((c) => c.fingerprint).sort();
  expect(app).toEqual(payments().changes.map((c) => c.fingerprint).sort());
});

test('@phone X-07 a shared OpenAPI link opens read-only at 390 px, without sideways scroll, axe clean', async ({ page, browser }) => {
  test.skip(test.info().project.name !== 'phone');
  // Make the link on a desktop, open it on the phone.
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: 'http://localhost:4173' });
  const d = await desk.newPage();
  await d.goto('/app/?sample=openapi');
  await expect(d.getByRole('tab', { name: 'Summary', selected: true })).toBeVisible();
  await d.getByRole('button', { name: 'Share', exact: true }).click();
  const link = await d.getByRole('textbox', { name: 'Share link' }).inputValue();
  await desk.close();
  expect(link).toMatch(/#v=/);
  await page.goto(link);
  await expect(page.getByText('Read-only on phones.')).toBeVisible();
  await expect(page.getByRole('button', { name: /See all \d+ changes/ })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Before' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expectAxeClean(page);
});
