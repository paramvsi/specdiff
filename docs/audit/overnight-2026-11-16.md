# Overnight audit and enhancement loop · 2026-11-16

Owner asleep. Claude runs self-paced loops: audit → fix → commit, then enhance, then web research for edge cases.

## Ground rules for the night
- No subagents. Local commits only, never push (the owner pushes with `!`).
- No full suite: only explicit test files for what changed, plus lint and typecheck. The pre-push hook runs `pnpm verify` when the owner pushes.
- Anything CLAUDE.md says needs asking (new dependency, layout or IA change, default severity change, publish, domain, Netlify, push) goes to **Morning decisions**, not into code.
- Anything a permission check blocks goes to **Morning decisions** with what was tried.
- Every fix: a failing check first where it is a bug, then the fix, then the passing check, logged below with the commit hash.

## Morning decisions
- **M-1 (row 12):** with `--allow-external-refs`, should the CLI also follow *relative* `$ref`s found inside a fetched remote file (resolved against that file's URL)? Today they stay unresolved. Default kept: no (smaller network reach).
- **M-2 (row 3):** integers beyond 2^53 lose precision in JSON/YAML mode. Options: (a) leave, (b) flag "number too large to compare exactly" as a warning, (c) compare such numbers by their source text. Suggest (b).
- **M-3 (row 14):** History on a phone shows the desktop table, scrolling sideways with the Result column cut off. There is no phone design for A-11. Options: (a) leave, (b) stack each row as a card below 640 px (Mode chip, files, result on separate lines). Suggest (b); it is a layout change, so not done.
- **M-4 (row 17):** Unicode normalisation. Should Text mode get an "Ignore Unicode normalisation (NFC)" option, or a note on lines whose sides are equal after NFC? Adding an option touches the options UI. Suggest: a one-line note on such rows, no new option.

## Log
| # | Time | Area | Finding | Evidence | Fix / commit |
|---|------|------|---------|----------|--------------|
| 1 | 00:05 | core · json/parse (JS-04) | `<<` merge keys not applied in JSON/YAML mode (OpenAPI mode applies them); alias bomb threw `ReferenceError` instead of returning a parse error; multi-document YAML got a generic hint; duplicate dead `MISSING_CHAR` branch | probe + 3 new tests failing before, 19/19 after; worker + CLI caller tests green | `9eb0d57` |
| 2 | 00:12 | viewer · TryIt casing | Editor showed TS1149 (`./tryit` vs `TryIt.tsx`), which would break the Linux Netlify build | stale diagnostic: no `./tryit` import exists; `tsc --noEmit` shows 0 TS1149 | no change |
| 3 | 00:12 | core · json/parse | Integers beyond 2^53 lose precision (`12345678901234567890` → `…7000`), so two files differing only in a big ID show no change | probe output | **open**: needs a design choice (BigInt breaks stable/JSON output); queued for an enhancement pass |
| 4 | 00:35 | app · A12 Settings (UI, 1440/390 light/dark) | axe clean in all 5 sections × 2 themes × 2 widths. On a touch phone: section tabs 42 px, severity selects 36 px, TextField input 22 px inside a 44 px box (taps on the box's padding missed the input) | screenshots + new guard `e2e/touch-targets.spec.ts` failing before, passing after; visual baselines unchanged | `ae2d743` |
| 5 | 00:25 | refactor · Settings native selects vs ui Select | ui `Select` is a custom popup; Settings uses native `<select>` in a 76-row table, which is the lighter choice | read both | no change |
| 6 | 00:27 | refactor · core dead exports | 25 exports have no users outside their file; most are reachable through published 0.1.0 entry points (removing = breaking), the 7 internal ones are all used in-file | grep sweep | no change |
| 7 | 00:28 | core · report generator (OUT-11) | `generator.version` hard-coded to `0.0.0` in every report, including the published 0.1.0 | new test failing before, 17/17 after; app start-up JS 175.0 kB unchanged | `ad3fbdb` |
| 8 | 00:20 | research · OpenAPI 3.2 (VW-01, A05) | 3.2 adds `query` and `additionalOperations` ([OAI 3.2 release](https://newreleases.io/project/github/OAI/OpenAPI-Specification/release/3.2.0), [learn.openapis.org](https://learn.openapis.org/specification/http-methods)). Core handled both; the Viewer and the HAR consumer filter dropped `additionalOperations` | 2 new tests failing before, passing after | `ace1ea4` |
| 9 | 00:20 | process note | DOM tests (viewer, ui, app) must run from the repo root (`vitest.config.ts` projects give them jsdom); run from a package dir they fail on `localStorage` | 14 viewer-ui failures from packages/viewer, 0 from root | n/a |
| 10 | 00:24 | cli · inputs (IN-12) | Sibling scan ran for every spec with or without an external `$ref`; a dangling symlink or unreadable folder beside the input crashed the CLI; from ~ or /tmp it read and served unrelated files; git diff driver scanned git's temp folder | 2 new tests failing (ENOENT) before, 15/15 after; built CLI smoke test | `a7df01e` |
| 11 | 00:24 | cli · serve | Local UI: 127.0.0.1 only, random 128-bit session token, no-store. OK | read | no change |
| 12 | 00:24 | cli · remote refs | `--allow-external-refs` follows only absolute http(s) refs inside fetched files; a relative ref inside a remote file is left unresolved (reported as unresolved, not fetched) | read | noted, not changed: fetching relative-to-remote URLs widens network reach; owner call → Morning decisions |
| 13 | 00:30 | app · phone sweep (UI) | Compare + all 5 sample results + More menu + Viewer/History/Saved sources/Settings at 390 px, light and dark: axe clean everywhere. Undersized: History chips 34 px, file link 42 px. Inline Markdown links are exempt (WCAG 2.5.8 inline) | scratch sweep + guard failing before, passing after | `1f77564` |
| 14 | 00:30 | app · A11 History on phone | Results table is wider than 390 px: it scrolls inside its card and the Result column is cut ("4 br…") | screenshot | **Morning decision M-3** (layout) |
| 15 | 00:27 | refactor · operation lists | Method list + \`additionalOperations\` walk exists in core (rules/operations), Viewer (model) and app (consumer-logic); the HAR matcher itself is already shared (\`@specdiff/core/har\`). Consolidating means new public core API for ~15 lines | grep | no change (not worth an API addition) |
| 16 | 00:45 | research · Unicode in text diff (TX-03) | Lines differing only by BOM / ZWSP / NBSP were "changed" with an invisible highlight; bidi controls in an added line could reorder what the reviewer reads ([Trojan Source, CVE-2021-42574](https://trojansource.codes/)). Now named markers in changed segments, bidi replaced | unit 4/4 + e2e failing before, passing after; visual 30/30; 175.0 kB | `9bfe139` |
| 17 | 00:45 | text diff · NFC vs NFD | `café` (U+00E9) vs `café` (e + U+0301) shows a changed word that looks identical; markers do not help (the accent is visible) | probe | **Morning decision M-4** |
| 18 | 00:45 | process note | `eslint -f unix` prints nothing (formatter removed from core ESLint): use the default formatter for counts | ran both | n/a |
| 19 | 00:38 | express · handler (PK-06) | `decodeURIComponent` URIError and `readFileSync` ENOENT thrown out of the handler (crashes a plain node:http listener); asset stream had no error listener. Checked and fine: traversal guard, redirect builds a path-only Location, CSP + nosniff, title escaped | 2 new tests failing before, 6/6 after | `135002d` |
