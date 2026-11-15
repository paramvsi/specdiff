# 07 · Data formats

Define these as Zod schemas in `@specdiff/core/schemas`, export TypeScript types from them, and publish the report schema as JSON Schema (OUT-11). Every format carries a `version` so it can evolve.

## 1. Change (shared by every mode)

```ts
type Severity = 'breaking' | 'possibly' | 'safe' | 'docs';
type Kind = 'added' | 'removed' | 'changed' | 'moved' | 'typeChanged' | 'renamed';

interface Change {
  id: string;              // stable within a report, e.g. "c-0007"
  fingerprint: string;     // stable across runs: hash(ruleId + canonicalLocation + before/after essentials)
  mode: 'openapi' | 'json' | 'yaml' | 'markdown' | 'code' | 'text';
  kind: Kind;
  path: string;            // human path, e.g. "POST /v1/payments › requestBody › currency"
  jsonPath?: string;       // "$.paths['/v1/payments'].post.requestBody…"
  location: { before?: SourcePos; after?: SourcePos };   // SourcePos = { file, line, column }
  before?: unknown; after?: unknown;                      // trimmed values for display
  // OpenAPI only
  ruleId?: string; severity?: Severity; direction?: 'request' | 'response' | 'both';
  operation?: { method: string; path: string; operationId?: string };
  sharedSchema?: { name: string; usages: string[]; usageCount: number };
  sourceBlock?: string;    // the component or operation that was edited (OA-15)
  explanation?: { who: string; see: string; avoid: string };
  changelogLine?: string;
  sdk?: { call: string; language: 'ts' | 'python' | 'java' | 'go' };   // OA-20
}
```

## 2. Report

```ts
interface Report {
  version: 1;
  generator: { name: 'specdiff'; version: string };
  inputs: { before: InputMeta; after: InputMeta };       // name, size, format, specVersion, info.version
  mode: Change['mode'];
  options: ResolvedOptions;                               // preset, toggles, ignores actually applied
  summary: { breaking: number; possibly: number; safe: number; docs: number; total: number;
             byArea: Record<string, number> };
  versionCheck?: { from?: string; to?: string; suggested: string; bump: 'major' | 'minor' | 'patch';
                   verdict: 'ok' | 'missing-major' | 'decreased' | 'unparseable'; message: string };
  changes: Change[];                                      // sorted: file, line, column, ruleId
  decisions?: { accepted: number; rejected: number; open: number };
}
```

The same inputs and options must produce byte-identical JSON (X-13).

## 3. `.specdiff.yaml` (SET-03)

Read by the app (import/export) and the CLI (including from the pre-commit hook). Search order: `--config` flag, `./.specdiff.yaml`, repo root.

```yaml
version: 1
preset: wire                 # wire | sdk
failOn: breaking             # breaking | possibly | missing-version-bump | none   (CLI --ci)
rules:
  request-property-became-required: { severity: possibly }
  extension-changed: { enabled: false }
ignore:
  paths: ["x-internal-*", "/v1/admin/**"]
  extensions: true
openapi:
  matchInlineRefs: true
  caseInsensitiveHeaders: true
  flattenAllOf: false
  mergePathParams: true
  autoUpgrade: true
  includePathParamNames: false
  sunsetGracePeriodDays: 90
json:
  ignoreKeyOrder: true
  ignoreArrayOrder: false
  arrayMatchKey: auto        # auto | <key name>
  nullEqualsMissing: false
  ignoreKeys: [updatedAt, requestId]
  numberTolerance: 0.01
text:
  ignoreWhitespace: true
  ignoreCase: false
  ignoreLineEndings: true
  precision: word            # smart | word | char
  filters:
    - { name: Timestamps, pattern: '\d{4}-\d{2}-\d{2}T[\d:.]+Z', replace: '‹time›' }
    - { name: Request IDs, pattern: 'req_[a-z0-9]{8,}', replace: '‹req-id›' }
decisions: .specdiff/decisions.json
```

## 4. `.specdiff/decisions.json` (OA-21)

```json
{
  "version": 1,
  "decisions": {
    "7c1e…a94f": {
      "decision": "accepted",
      "ruleId": "response-property-removed",
      "path": "components.schemas.Card › last4",
      "note": "Removed in 2.0.0; announced in the 1.5 changelog",
      "by": "paramvsi",
      "at": "2026-11-14T09:12:00Z"
    }
  }
}
```

The CLI (and so the pre-commit hook and any CI that runs it) treats an accepted breaking change as not failing; a rejected one always fails. Decisions whose fingerprint no longer appears are reported as "stale" and ignored.

## 5. Share link (OUT-05, OUT-09)

- Plain: `#v=1&c=<base64url(deflateRaw(JSON(payload)))>`
- Locked: `#v=1&e=1&s=<base64url salt 16B>&i=<base64url iv 12B>&c=<base64url(AES-GCM(deflateRaw(JSON(payload))))>`, key = PBKDF2-SHA-256(passphrase, salt, ≥310,000 iterations, 256-bit).
- `payload = { left, right, mode, options?, view?: { changeId?, tab? }, decisions? }`
- Above ~8 KB of URL, warn and offer `comparison.specdiff.json` (the same payload as a file).

## 6. History and saved sources (IndexedDB)

```ts
interface HistoryEntry { id: string; createdAt: string; openedAt: string; pinned: boolean;
  mode: Change['mode']; before: { name: string; size: number }; after: { name: string; size: number };
  summary: Report['summary']; payloadRef: string }      // payload stored separately, deletable

interface SavedSource { id: string; name: string; url: string; mode: Change['mode'];
  lastFetchedAt?: string; lastSnapshotHash?: string; lastError?: 'cors' | 'network' | 'parse';
  lastResult?: { breaking: number; total: number } }
```

## 7. HAR matching (OA-22, VW-10)

Read `log.entries[].request.{method,url}`. Keep entries whose origin matches a `servers` URL. Match the path against operation templates (most specific first). Output `{ operationKey, calls }` and the requests that would fail on the new version (e.g. `limit` above the new maximum). Nothing leaves the browser; the HAR is not stored unless the user saves the filter.

## 8. Viewer version set (VW-07)

```ts
interface VersionSet { versions: Array<{ label: string; source: string; date?: string; spec: object }>;
  current: string; compareWith?: string }
```

`specdiff history openapi.yaml --out versions.json` (PK-04) produces this from git tags or commits.
