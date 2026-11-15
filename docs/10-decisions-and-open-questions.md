# 10 · Decisions and open questions

## Decided

| # | Decision | Date |
|---|---|---|
| 1 | Frontend only; no backend, accounts or hosted approvals | Nov 2026 |
| 2 | Direction A, Graphite & Chartreuse, is the design system; the approved prototypes are the visual spec | Nov 2026 |
| 3 | Final feature list is `docs/02` (136 features: 124 Core, 8 Beta, 4 Later) | 15 Nov 2026 |
| 4 | Local MCP server (PK-11) moved to **Later** | 15 Nov 2026 |
| 5 | Website home is **Home v2** (motion, interactive demo, slider); v1 is superseded | 15 Nov 2026 |
| 6 | Specdiff makes no AI calls; "Copy for LLM" / "Open in Claude" only | Nov 2026 |
| 7 | Open source, MIT licence | Nov 2026 |
| 8 | Styling with CSS Modules + `tokens.css` (Tailwind only if the owner agrees in P0) | Nov 2026 |
| 9 | **Hosting: Netlify**, one site: website at `/`, app at `/app` | 15 Nov 2026 |
| 10 | **No GitHub Actions**: no Action package (PK-05 and OUT-04 removed) and no CI workflows; checks run locally (pre-push) and in the Netlify build | 15 Nov 2026 |
| 11 | One repository: `paramvsi/specdiff` (monorepo) | 15 Nov 2026 |

## Open — decide in the phase shown (suggested default in bold)

| # | Question | Phase | Suggested default |
|---|---|---|---|
| D-1 | Use the oasdiff **OpenAPI Changes Model** (Apache-2.0) as the rule coverage checklist and test oracle? | P1 | **Yes, as a checklist and oracle referenced from fixtures; ask before copying the file in** |
| D-2 | Diff renderer: Monaco or `@pierre/diffs` + Shiki | P1 | **Spike both on A-03; pick the one that meets the 200 KB budget and the design; default Monaco if tied** |
| D-3 | `$ref` resolver: `@scalar/openapi-parser` or `@apidevtools/json-schema-ref-parser` | P1 | **Spike both on Petstore, a 10 MB spec and a Swagger 2.0 spec; pick faster and more correct** |
| D-4 | npm names: is `specdiff` free? | P0 | **`@specdiff/*` scope + `specdiff` CLI if free; otherwise `specdiff-cli`** |
| D-5 | Domain: `specdiff.app`, `specdiff.dev` or other (Netlify DNS) | P5 | **Cheapest available .app/.dev (ask before buying); `<site>.netlify.app` until then** |
| D-7 | Maven group ID for the Spring Boot starter | P4 | **`io.github.paramvsi`** |
| D-9 | Analytics | P5 | **None at launch** |
| D-10 | Share-link size before offering a file download | P1 | **~8 KB** |
| D-11 | Code mode languages beyond the first four | Later | **Go, Kotlin, C#** |
| D-12 | Logo: keep the overlapping-rectangles mark | P5 | **Keep** |
| D-13 | Release dates on the changelog page (`[Launch date]` placeholders in designs) | P5 | **Fill in at launch** |

## Decided during build

Claude Code adds rows here when it takes a default without the owner.

| # | Decision | Phase | Why |
|---|---|---|---|
| B-1 | npm: `@specdiff/*` scope; CLI package `specdiff-cli` with bin `specdiff` (D-4) | P0 | `specdiff` on npm is taken (another OpenAPI diff tool, v0.1.1). Owner ruling 2026-11-15 |
| B-2 | The designs' `request-param-max-decreased` (P) is not a rule; `limit` max lowered is `request-param-constraint-tightened` (B). Example data is now 4 breaking, 1 possibly, 14 safe, 9 docs; rule counts on screens use the real catalogue count | P0 | Severity law rule 1. Owner ruling 2026-11-15 |
| B-3 | Visual tests: each screen is compared by eye against `design/screens/`; after approval Playwright stores its own baseline | P0 | JPG renders cannot be pixel-matched. Owner ruling 2026-11-15 |
| B-4 | Owner asked for all phases end to end without stopping. Spikes D-2/D-3 take the suggested default and are recorded here; publishing, pushing, Netlify and domain still wait for the owner | P0 | Owner instruction 2026-11-15 |
| B-5 | TypeScript 6.0.3 and ESLint 9.39.5 instead of the newest majors | P0 | Peer ranges (see LIBRARIES-LOCK) |
| B-6 | Share links use `deflateRaw` (docs/07 §5), not `deflate` (docs/04) | P0 | docs/07 is the more specific spec |
| B-7 | `decisions.json` `by` comes from an optional "Your name" setting, empty by default | P0 | No accounts |
| B-8 | Version bump for possibly-breaking only: minor | P0 | Not specified; conservative |
| B-9 | Breakpoints from the PDF: tree 240–300 px; tablet 640–1023 px collapses the tree to a drawer | P0 | PDF wins over docs/03 |
| B-10 | D-2: neither library. Text mode renders core's aligned rows (`@specdiff/core/text`) in the ui `CodePane`, virtualised with TanStack Virtual; Shiki (already in docs/05) highlights lazily. Monaco and `@pierre/diffs` uninstalled | P1.3 | Spike (lazy chunk, gzip): Monaco `editor.api` ~699 KB plus ~300 KB more; `@pierre/diffs` 116 KB plus a 231 KB Shiki WASM. Neither renders the A-03 masked `‹name›` pills, per-side gutters and fold rows without fighting it; own rows add 0 KB of dependencies and match the design exactly |
| B-11 | All copy that says `npx specdiff …` becomes `npx specdiff-cli …` (installed, the command is still `specdiff`) | P4 | Follows B-1: `npx specdiff` would run someone else's package |
| B-12 | D-3: use `@scalar/openapi-parser` only for its synchronous `upgrade()` (Swagger 2.0 / OpenAPI 3.0 → 3.1). `$ref`s are resolved by a small synchronous lazy resolver in `@specdiff/core` over the parsed tree and the in-memory file map. `@apidevtools/json-schema-ref-parser` is no longer imported (still installed; removing it needs the owner) | P1 | Spike (Node 26, M-series Mac): Petstore deref scalar 1 ms / jsrp 19 ms, both correct. Shared `$ref` identity: jsrp yes, scalar no (copies into each site). Circular: jsrp a real identity cycle; scalar only shares sub-objects. External ref from an in-memory map: jsrp OK through a custom resolver; scalar's filesystem input failed (`EXTERNAL_REFERENCE_NOT_FOUND`, `load()` is deprecated). Swagger 2 → 3.1: scalar correct (servers, requestBody, `x-nullable` → type array) in 1 ms; jsrp cannot. 10.4 MB spec: deref scalar 241 ms / jsrp 300 ms; `JSON.parse` 17 ms, `yaml` `parseDocument` 1.1 s. jsrp is async-only, and `compareOpenApi` is synchronous; neither keeps source positions or `$ref` names, which OA-14/OA-15 need. With the in-house resolver, comparing two copies of the 10.4 MB JSON spec takes ~0.5 s, the 7.9 MB YAML copy ~3 s |
| B-13 | Website keeps React islands (docs/09). Home loads 2.0 KB of JS at start; React and the islands (73.8 KB) load on idle/interaction, so the hydrated total is 75.8 KB against the 60 KB budget in docs/04. **Owner to rule:** accept, or rewrite the four islands in plain TypeScript | P5.1 | The two docs conflict; React alone is 67 KB gzip |
| B-14 | Three listed severities look inconsistent with the severity law but are kept as listed (rule 10): `operation-id-changed` is P under Wire though nothing changes on the wire; `response-header-removed` is P though responses may not promise less; `response-optional-property-removed` is D though it is a wire change that breaks nothing (S). **Owner to rule** | P1.5 | Changing a default severity needs the owner |
| B-15 | Code mode diffs at declaration level (functions, classes, methods). Statement-level renames shown in A-09 (`amount → amt`) are not detected yet | P3.1 | Listed as a good first issue |
| B-16 | Viewer: version picker is a native `<select>` (Radix modal menu hid the page with aria-hidden while focus stayed, failing axe); Swagger 2.0 is upgraded with core's `upgradeSpec` by the embed, React wrapper and app; comparisons run on the main thread | P3.2 | Accessibility; simplicity |
| B-17 | Embed: the compare engine (162 KB gzip, mostly zod) is a separate `specdiff-compare.js` loaded only with `compareWith` or a Swagger 2.0 spec, so `specdiff-embed.js` stays at 164 KB gzip | P4.3 | 250 KB budget |
| B-18 | App e2e runs against the production build (`vite preview`); only `/_ds` uses the dev server | P5 | The dev server reloads while optimising dependencies |
| B-19 | Settings panes Ignore paths, Diff options, Appearance and Rule-set file have no design; built in the A-12 style. `.specdiff.yaml` downloads as `specdiff.yaml` (browsers drop a leading dot) and the UI says to rename it | P1.8 | No prototype |
| B-20 | Raw-diff gutter markers are mouse-only shortcuts (aria-hidden, not in tab order): 18 px markers on 22 px rows can't meet WCAG 2.2 target size; the "Changes in this file" list is the accessible path | P1.6 | WCAG 2.5.8 |
| B-21 | Not measured: Lighthouse (no Lighthouse package in docs/05) and visual pixel baselines (B-3: locked only after the owner approves each screen) | P5.5 | Needs owner |
| B-22 | TX-03: Shiki with the JS regex engine (no WASM, no eval), 70 grammars as lazy chunks named `assets/lang-*`, cached on first use (not precached by the service worker). Off above 5,000 rows or 2 MB | P5 gap fix | CSP and budget |
| B-23 | TX-11: moved blocks are ≥3 lines, ≥80% similar; opt-in in core (`diffText(…, { moves: true })`), on in the app's text mode only. Moved rows use `↕` (docs/09), not the design's `~` | P5 gap fix | Symbol convention |
| B-24 | TX-12: the A03-Patch view renders inside Compare (Back returns), not as its own route | P5 gap fix | Minimal routing |
| B-25 | D-1: `pnpm model:coverage` downloads the oasdiff model to a git-ignored cache; 61 of 76 rules carry modelRefs; model coverage 42% (docs/model-coverage.md). The model file itself is not in the repo | P5 gap fix | Licence: ask before copying |
| B-26 | The diff driver is used by `git diff` by default; `git log -p` needs `--ext-diff` (verified in a scratch repo) | P4 | git behaviour |
| B-27 | SET-06: two diff colour themes. The default (cobalt/ember) *is* the colour-blind-safe palette (PDF p. 06/08); "High contrast" is the second. There is no separate third palette in the tokens | Audit | tokens.css defines exactly these two |
| B-28 | M-04 phone Viewer endpoint: read-only, no Try it, although the frame shows the button | Audit | docs/02 X-07 ("read-only") wins over a prototype on behaviour (CLAUDE.md rule 2) |
| B-29 | Phone (<640 px): one-row top bar with icon-only Search, More, Share, Export (44 px); Copy for LLM hidden (read-only, as in M-01). Menus are non-modal so the page isn't aria-hidden while open | Audit fix | X-07, axe aria-hidden-focus |
| B-30 | Workspace has two approved frames: AWorkspace (stat strip, filter "All", focused hunk) is the default view; A05-Review applies when the "To review" filter is chosen | Audit round 2 | Both frames approved; this keeps both |
| B-31 | JSON has two approved frames: AJson (counts card, changes by path, export card) is the default overview; A07-JsonTree is the "Tree" view inside it | Audit round 2 | Both frames approved; this keeps both |
| B-32 | JSON Patch export is built from the keyed diff (move/remove/replace/add) and includes keys the diff ignores (e.g. `updatedAt`), so applying it gives the after file exactly: 8 ops on the sample vs 7 in A07-JsonExport | Round 3 | A patch must reproduce the file |
| B-33 | Minified JSON (a line over 2,000 characters) is pretty-printed before the raw line diff | Round 3 | 273 KB minified pair: 30 s → 2 s |
| B-34 | Utility screens (History, Settings, Saved sources, Parsing, Patch) keep a "More" menu in their own top bar, which the designs don't show: it is the only way between screens | Round 3 | Navigation |
| B-35 | Inline links inside sentences are exempt from the 44 px phone target check (WCAG 2.5.8 inline exception); the Text overview ruler (mouse-only ticks) is hidden on phones | Round 3 | WCAG 2.5.8 |
| B-36 | The Atom feed export asks for the feed URL and title in a dialog and remembers them in this browser | Round 3 | OUT-10 needs a real feed URL |

| B-37 | After the first load, the service worker precaches the lazy chunks in the background so the app works offline (PK-08). Page loads still fetch them on demand, so X-03's start-up budget is unaffected | Coverage pass | Offline vs lazy loading |
| B-38 | No CLI `--today` option: the six date-pinned sunset fixtures run in Vitest, and the CLI's sunset rules are covered end to end with relative dates (OA-17) | Coverage pass | Keeps test-only flags out of the CLI |
| B-39 | Viewer: an operation with several tags is listed once, under its first tag (no duplicate one-row groups) | Round 4 | Main frame shows each endpoint once |
| B-40 | V-04: safe and docs-only changes fold into one expandable row each when there are 2 or more | Round 4 | Frame shows ~5 rows; data has more safe changes |
| B-41 | curl samples leave out `-X` when curl implies the method and quote the URL only when the shell needs it | Round 4 | One short line per sample, as designed |
| B-42 | M-05 phone Viewer overview keeps the header version select (M-04's frame has it; M-05's doesn't) | Round 4 | One header across phone Viewer pages |
| B-43 | The website keeps a theme toggle on every page, which the frames don't show: dark mode is a requirement, and removing it would change every layout | Round 4 | Rule 10 |
| B-44 | The `request-property-became-required` fixture uses the payments example (`required: [amount]` → `[amount, currency]`) so the generated rule page matches W04 | Round 4 | Rule pages are generated from fixtures |
| B-45 | Website dark nav keeps solid tokens instead of the frame's frosted bar, whose muted links fail contrast | Round 4 | WCAG 2.2 AA |
| B-46 | The result top bar keeps More (the only way to History, Saved sources and Settings; extends B-34) and Copy for LLM (decision 6), which the Main frame doesn't show | Round 4 | Navigation; decision 6 |
| B-47 | Workspace keeps the Affects me / Endpoints–SDK row, To review chip, search and Group by: they are OA-20/OA-22 features (docs/02 wins on behaviour) | Round 4 | Rule 2 |
| B-48 | The review card keeps Download / Import decisions.json and the Side by side / Inline switch: a browser can't write `.specdiff/`, so the file is how decisions travel (OA-21) | Round 4 | OA-21 |
| B-49 | M-02 collapses safe changes into one row, like docs-only, under All (same rule as B-40) | Round 4 | Frame shows 8 rows |
| B-50 | Rules and settings lists all 76 rules; the 4 with no default severity say why ("No severity"), so the app and the website agree | Round 4 | App 72 vs website 76 |
| B-51 | History has a "Save new comparisons to history" setting (`settings.saveHistory`, default on), as the empty-History frame shows | Round 4 | A11-HistoryEmpty |
| B-52 | Ignore whitespace is on by default in text mode, as in ACompare and the docs/07 example config | Round 4 | Approved frame |
| B-53 | App first paint: the Compare screen is server-rendered at build time and hydrated in place; the JS loads at low priority. Lighthouse mobile is 100 with real throttling and 92 simulated (was 87); desktop is 100. See `docs/audit/lighthouse.md` | Round 4 | Owner ruling: SSR hydration |
| B-54 | A Markdown heading that ends a hunk on both sides, at the same depth, is a rename (one edited heading, not remove + add) | Round 4 | AMarkdown |
| B-55 | JSON tree rows are one line; JSONPath is on each row's copy button and in "Changes by path" (JS-05) | Round 4 | AJson row height |
| B-56 | The JSON Markdown export is a table, as its card says | Round 4 | JS-08 |
| B-57 | A patch hunk whose header claims more lines than its body is recounted rather than rejected | Round 4 | A03-Patch's own example |
| B-58 | The Code badge reads "<Language> · Beta" (docs/02: Beta features are labelled in the UI) and the fallback reads "Text" | Round 4 | A09 frames vs docs/02 |
| B-59 | A03-MovedBlock keeps the A03-TextDiff toolbar and Split view (same screen, same controls) | Round 4 | Two frames of one screen disagree |
| B-60 | Markdown keeps per-block Viewed buttons (X-11 applies to every mode) | Round 4 | docs/02 wins on behaviour |

## Owner rulings (2026-11-15: "go with the recommendation")

| # | Ruling |
|---|---|
| B-13 | Rewrite the website's React islands in plain TypeScript so Home meets the 60 KB budget in docs/04. Done: React renders the islands at build time only; Home fetches 2.8 KB gzip (was 76.0 KB), guarded by `e2e/round4-website.spec.ts` |
| B-14 | Keep the three severities as docs/06 lists them (rule 10: default severities don't change) |
| B-21 | Lighthouse is run ad hoc with `npx lighthouse` (not a repo dependency) against the production preview; the scores are recorded in `docs/audit/lighthouse.md`. Visual baselines are locked after the round-4 design fixes, and the round-4 screen audit counts as the review by eye (B-3) |
| B-27 – B-38 | Accepted as recorded above |
