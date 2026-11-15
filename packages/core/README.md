# @specdiff/core

The engine behind Specdiff. It parses OpenAPI, JSON, YAML, Markdown, code and text, compares two versions, runs the OpenAPI rules, and builds reports and changelogs. No DOM and no file system access: it runs in a browser Web Worker and in Node. The app, the CLI and the Viewer all use it.

Nothing is uploaded. Everything runs in your process; external `$ref`s come from the in-memory `files` map you pass in.

## Install

```sh
npm install @specdiff/core
```

## Compare two OpenAPI specs

```ts
import { readFileSync } from 'node:fs';
import { compareOpenApi, reportToMarkdown } from '@specdiff/core';

const report = compareOpenApi(
  { name: 'openapi-v1.yaml', content: readFileSync('openapi-v1.yaml', 'utf8') },
  { name: 'openapi-v2.yaml', content: readFileSync('openapi-v2.yaml', 'utf8') },
  { preset: 'wire', failOn: 'breaking' }, // optional: the same shape as .specdiff.yaml
);

console.log(report.summary); // { breaking, possibly, safe, docs, ... }
console.log(report.versionCheck?.suggested); // e.g. "2.0.0"
console.log(reportToMarkdown(report));
```

`compareOpenApi(before, after, config?, { today? })` is synchronous. Each input is `{ name, content, files? }`; `files` holds the other files of a split spec, keyed by path relative to `name`. Swagger 2.0 and OpenAPI 3.0 are upgraded to 3.1 before comparing. The same inputs always give a byte-identical report. It throws `OpenApiParseError` (with `file` and `errors`) when a side does not parse.

## API

| Export | What it does |
|---|---|
| `compareOpenApi(before, after, config?, opts?)` | Compare two specs; returns a `Report` |
| `parseDocument(content, file?)` | Parse YAML or JSON with line and column positions. Returns `{ value, errors, format, positionOf }`; each error has `line`, `column`, `message` and a plain-English `hint` |
| `detectOpenApi(content)` | `{ isOpenApi, specVersion? }` |
| `rules` | The rule catalogue: `id`, `title`, default `severity`, `direction`, `preset`, `area`, `explanation`, `changelog` |
| `applyDecisions(report, decisionsFile)` | Match `.specdiff/decisions.json` to a report by fingerprint. Returns counts, a status per fingerprint, and stale decisions |
| `buildChangelog(report, template, opts?)` | Changelog text. Templates: `release-notes`, `keep-a-changelog`, `pr-comment`, `slack`. Options: `groupBySeverity`, `includeDocs`, `version`, `date`, `title` |
| `reportToMarkdown(report)` | Markdown report |
| `reportToHtml(report)` | Standalone HTML report, one file |
| `changelogFeed(report, { title, feedUrl, siteUrl?, version?, date? })` | The changelog as an Atom feed |
| `reportJsonSchema()` | JSON Schema of the report (what `specdiff schema` prints) |
| `suggestVersion(current, counts)` | `{ suggested, bump }`: breaking → major (minor below 1.0.0); possibly or safe → minor; else patch |
| `upgradeSpec(doc)` | Swagger 2.0 / OpenAPI 3.0 → 3.1, for display |
| `Config`, `DecisionsFile`, `SharePayload`, `Report`, `Change`, … | Zod schemas and types for `.specdiff.yaml`, decisions, share links and reports |

```ts
import { applyDecisions, buildChangelog, changelogFeed } from '@specdiff/core';

const { decisions, stale } = applyDecisions(report, JSON.parse(readFileSync('.specdiff/decisions.json', 'utf8')));
const notes = buildChangelog(report, 'keep-a-changelog', { date: '2026-11-15' });
const atom = changelogFeed(report, { title: 'Payments API', feedUrl: 'https://example.com/changelog.xml' });
```

## Subpath exports

| Import | Main exports |
|---|---|
| `@specdiff/core/text` | `diffText(before, after, options)` aligned rows with word-level segments; `foldRows`, `applyFilters`, `applyTransforms` |
| `@specdiff/core/json` | `parseWithPositions(content)`, `diffJson(a, b, options)`, `jsonPatch`, `mergePatch`, `jsonPathList`, `jsonMarkdown` |
| `@specdiff/core/markdown` | `diffMarkdown(before, after)`: blocks, outline and broken anchors |
| `@specdiff/core/code` | `initRuntime()`, `loadLanguage(lang, source)`, `diffCode(before, after, lang, language)`, `languageFor(fileName)` (tree-sitter) |
| `@specdiff/core/share` | `encodeShare(payload, passphrase?)`, `decodeShare(hash, passphrase?)`, `isLocked(hash)` |
| `@specdiff/core/detect` | `detectMode(name, content)`, `detectPair(a, b)` |
| `@specdiff/core/har` | `matchHar(har, operations, servers)`, `parseOperationList(text, operations)` |

Options for `diffText` and `diffJson` are the `text` and `json` sections of `.specdiff.yaml`, with every field set:

```ts
import { diffText } from '@specdiff/core/text';
import { diffJson } from '@specdiff/core/json';

const t = diffText('a\nb\n', 'a\nc\n', { ignoreWhitespace: false, ignoreCase: false, ignoreLineEndings: true, precision: 'word', filters: [], transforms: [] });
console.log(t.stats); // { added, removed, changed, ... }

const j = diffJson({ id: 1, tags: ['a'] }, { id: 1, tags: ['b'] }, { ignoreKeyOrder: true, ignoreArrayOrder: false, arrayMatchKey: 'auto', nullEqualsMissing: false, ignoreKeys: [], numberTolerance: 0 });
console.log(j.changes); // [{ kind, jsonPath, before, after }]
```

Share links keep the content in the URL hash. With a passphrase it is encrypted with AES-GCM (PBKDF2, 310,000 iterations) in the browser:

```ts
import { encodeShare, decodeShare } from '@specdiff/core/share';

const hash = await encodeShare({ left: { name: 'a.txt', content: 'a' }, right: { name: 'b.txt', content: 'b' }, mode: 'text' }, 'a long passphrase');
// "v=1&e=1&s=…&i=…&c=…"
const payload = await decodeShare(hash, 'a long passphrase');
```

Note: in this repository the subpaths resolve to the TypeScript sources. The published build (`publishConfig.exports`) currently exports only the package root.

## Licence

MIT
