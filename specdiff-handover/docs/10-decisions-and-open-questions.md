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
