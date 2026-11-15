// D-1: which oasdiff "OpenAPI Changes Model" changes (Apache-2.0) have a Specdiff rule.
// The model is downloaded to a git-ignored cache, never copied into the repo.
// Usage: pnpm model:coverage [--write] [path/to/openapi-changes-model.yaml]
//   --write  fills modelRefs in fixtures/rules/*/expected.json with exact id matches (only those).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const { parse } = createRequire(join(process.cwd(), 'packages/core/package.json'))('yaml');
const URL_ = 'https://raw.githubusercontent.com/oasdiff/openapi-changes-model/main/openapi-changes-model.yaml';
const args = process.argv.slice(2);
const write = args.includes('--write');
let file = args.find((a) => !a.startsWith('--'));
if (!file) {
  const dir = 'node_modules/.cache/specdiff';
  file = join(dir, 'openapi-changes-model.yaml');
  if (!existsSync(file)) {
    mkdirSync(dir, { recursive: true });
    const res = await fetch(URL_);
    if (!res.ok) throw new Error(`Could not download the model: ${res.status}`);
    writeFileSync(file, await res.text());
  }
}
const model = parse(readFileSync(file, 'utf8'), { maxAliasCount: -1 });
const changes = model.changes;
const byId = new Map(changes.map((c) => [c.id, c]));

const covered = new Map(); // model id → specdiff rule ids
for (const rule of readdirSync('fixtures/rules').sort()) {
  const p = join('fixtures/rules', rule, 'expected.json');
  const exp = JSON.parse(readFileSync(p, 'utf8'));
  const refs = new Set(Array.isArray(exp.modelRefs) ? exp.modelRefs : []);
  if (byId.has(rule)) refs.add(rule);
  for (const r of refs) { if (!byId.has(r)) console.warn(`! ${rule}: modelRefs "${r}" is not in the model`); else covered.set(r, [...(covered.get(r) ?? []), rule]); }
  if (write && byId.has(rule) && !(exp.modelRefs ?? []).includes(rule)) {
    exp.modelRefs = [...new Set([...(exp.modelRefs ?? []), rule])].sort();
    writeFileSync(p, JSON.stringify(exp, null, 2) + '\n');
  }
}

const missing = changes.filter((c) => !covered.has(c.id));
const tally = (list, key) => Object.entries(list.reduce((m, c) => ({ ...m, [c[key]]: (m[c[key]] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
console.log(`OpenAPI Changes Model ${model.version} (${model.generated_from}): ${changes.length} named changes`);
console.log(`Covered by a Specdiff rule: ${covered.size} (${((covered.size / changes.length) * 100).toFixed(1)}%)`);
console.log(`Not covered: ${missing.length}`);
console.log('  by level:', tally(missing, 'level').map(([k, n]) => `${k} ${n}`).join(', '));
console.log('  by area: ', tally(missing, 'area').map(([k, n]) => `${k} ${n}`).join(', '));
if (args.includes('--list')) for (const c of missing) console.log(`  - ${c.id} [${c.level}, ${c.direction}] ${c.description ?? ''}`);
