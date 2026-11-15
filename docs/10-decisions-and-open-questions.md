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
