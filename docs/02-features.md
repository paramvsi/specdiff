# 02 · Features (final)

Every feature has an ID, a build phase (`docs/08-build-plan.md`) and a label: **Core** (must ship at launch), **Beta** (ships, labelled Beta in the UI), **Later** (after launch; do not build now).

Phases: **P0** setup · **P1** foundations + OpenAPI + review · **P2** JSON/YAML + Markdown + text extras · **P3** Code + Viewer · **P4** packages · **P5** website, polish, launch.

`★` marks features added in v2 of the pack (after the November 2026 research). `△` marks features whose scope changed in v2.

## WEB · Website

| ID | Feature | Phase | Label |
|---|---|---|---|
| WEB-01 △ | Home page per **Home v2** design: floating nav, word-by-word hero entrance, animated live demo (OpenAPI, JSON/YAML, Markdown tabs), scrolling formats strip, before/after drag slider, feature grid with micro-animations, Viewer band, package tabs with typed terminal, FAQ, CTA, footer | P5 | Core |
| WEB-02 | "Try it with a sample" opens the app with a sample comparison loaded | P5 | Core |
| WEB-03 | Docs: getting started, one page per mode, review, packages, FAQ (CORS, privacy, limits) | P5 | Core |
| WEB-04 △ | Rules reference: list with search and filters (severity, area) and a detail page per rule with before/after YAML, who it breaks, how to avoid it, example changelog line, and how to change its severity. **Generated from `@specdiff/core` rules and fixtures** | P5 | Core |
| WEB-05 △ | Guides: embed, React, CLI (including "use in any CI"), pre-commit hook, Express/Fastify, Spring Boot | P5 | Core |
| WEB-06 | Specdiff's own changelog page, with RSS | P5 | Core |
| WEB-07 | SEO: titles, descriptions, sitemap, canonical URLs, Open Graph images, light/dark | P5 | Core |
| WEB-08 | 404 page | P5 | Core |
| WEB-09 ★ | Motion system from `design/motion.css`: one load sequence, looping demo, all motion off under `prefers-reduced-motion` | P5 | Core |

## IN · Input (app)

| ID | Feature | Phase | Label |
|---|---|---|---|
| IN-01 | Paste into Before/After editors | P1 | Core |
| IN-02 | Drag and drop files (drag-over state per side); open file picker | P1 | Core |
| IN-03 | Load from URL; GitHub blob links converted to raw; CORS failure explained | P1 | Core |
| IN-04 | Drop a folder or ZIP for multi-file specs (external `$ref`s resolved inside it) | P1 | Core |
| IN-05 | Sample comparisons for every mode | P1 | Core |
| IN-06 | Swap before/after; reload one side | P1 | Core |
| IN-07 | Auto-detect mode (OpenAPI/Swagger, JSON, YAML, Markdown, code language, text) with manual override | P1 | Core |
| IN-08 | Parse in a Web Worker with per-file and per-step progress; cancel | P1 | Core |
| IN-09 | Parse errors pinned to line and column with a plain-English hint | P1 | Core |
| IN-10 | Size guard: warn above 10 MB; above 25 MB offer text-only mode | P1 | Core |
| IN-11 ★ | Saved sources: remember a spec URL; re-fetch it when the app opens and show "changed since your last visit" (IndexedDB, no background work) | P5 | Core |
| IN-12 ★ | Git `rev:path` inputs in the CLI (`main:openapi.yaml`) | P4 | Core |

## TX · Text mode (any file)

| ID | Feature | Phase | Label |
|---|---|---|---|
| TX-01 △ | Split and unified views (renderer: see `docs/10` decision D-2) | P1 | Core |
| TX-02 △ | Precision toggle: Smart / Word / Char | P1 | Core |
| TX-03 | Syntax highlighting for 50+ languages | P1 | Core |
| TX-04 | Ignore whitespace, case, line endings | P1 | Core |
| TX-05 | Collapse unchanged regions with expand controls | P1 | Core |
| TX-06 | Next/previous change; overview ruler of change positions | P1 | Core |
| TX-07 | Word wrap toggle; go to line | P1 | Core |
| TX-08 ★ | Regex filters that mask noise (timestamps, request IDs, UUIDs) on both sides before comparing; shown as `‹name›`; hit counts | P1 | Core |
| TX-09 ★ | Transforms: sort lines, lowercase, trim, normalise line breaks | P1 | Core |
| TX-10 ★ | Live re-diff while editing either side | P1 | Core |
| TX-11 ★ | Moved-block detection, with edits inside moved blocks highlighted | P2 | Core |
| TX-12 ★ | Open a pasted unified patch or `git diff` output as a text comparison | P2 | Core |

## OA · OpenAPI mode (flagship)

| ID | Feature | Phase | Label |
|---|---|---|---|
| OA-01 △ | Parse Swagger 2.0 and OpenAPI 3.0, 3.1, 3.2 (YAML or JSON), including 3.2 streamed `itemSchema` and new HTTP methods; normalise to 3.1 for comparison | P1 | Core |
| OA-02 △ | Resolve internal and external `$ref`s; recursive schemas compared by reference, reported once per entry into a cycle, fast and deterministic | P1 | Core |
| OA-03 | Detect changes: endpoints, operations, parameters (path/query/header/cookie), request bodies, responses and status codes, headers, schemas (properties, types, formats, enums, nullability, required, constraints, `allOf`/`oneOf`/`anyOf`), security schemes and scopes, servers, webhooks, callbacks, content types, deprecations, extensions | P1 | Core |
| OA-04 | Classify each change: breaking, possibly breaking, safe, docs only; direction-aware (request vs response) | P1 | Core |
| OA-05 △ | Rule catalogue (`docs/06`) aligned with the OpenAPI Changes Model (decision D-1); security judged per operation, including inherited `security` and all four OAuth flows | P1 | Core |
| OA-06 | Path-parameter rename detection (`/users/{id}` → `/users/{userId}` is not a removal) | P1 | Core |
| OA-07 | Explanation per change: who it breaks, what they will see, how to avoid it | P1 | Core |
| OA-08 △ | Summary: counts per severity, change-type breakdown, suggested version, and a **version check** against `info.version` with a one-line verdict | P1 | Core |
| OA-09 | Explorer: change tree grouped by path, tag, schema or severity; filters; search including JSONPath | P1 | Core |
| OA-10 | Change detail: split before/after with source lines, side-by-side and inline | P1 | Core |
| OA-11 | Raw YAML/JSON diff with severity markers in the gutter, linked both ways to changes | P1 | Core |
| OA-12 | Noise control: hide docs-only, ignore examples, ignore extensions | P1 | Core |
| OA-13 | Deep link to any change (URL hash) | P1 | Core |
| OA-14 ★ | Shared-schema dedup: a change in a shared schema is reported once at the schema, listing the endpoints that use it | P1 | Core |
| OA-15 ★ | Group changes under the source block that caused them (the component you edited) | P1 | Core |
| OA-16 ★ | Nullability unified: `nullable: true`, `type: [x, "null"]` and `oneOf: [{type: "null"}, …]` are one concept; no false breaking changes | P1 | Core |
| OA-17 ★ | Deprecation and sunset policy: `x-sunset` dates and grace periods; moving a sunset date earlier is breaking | P1 | Core |
| OA-18 ★ | Comparison options: match inline vs `$ref`, case-insensitive headers, flatten `allOf`, merge path-level parameters, auto-upgrade 3.0 → 3.1, include path-parameter names | P1 | Core |
| OA-19 ★ | Strictness presets: **Wire** (HTTP payloads) and **SDK** (also operationId, schema and enum names) | P1 | Core |
| OA-20 ★ | SDK-impact view: each change shown as the client call it affects (TypeScript, Python, Java, Go naming) | P3 | Beta |
| OA-21 ★ | Review decisions: accept or reject each change with a note; stable fingerprints in `.specdiff/decisions.json`; progress count; respected by the CLI and pre-commit hook | P1 | Core |
| OA-22 ★ | "Changes that affect me": paste operationIds or drop a HAR file; filter changes locally; show call counts and requests that will fail | P3 | Core |
| OA-23 ★ | Validate a single spec (impossible constraints, duplicate enum values) | Later | Later |

## JS · JSON and YAML mode

| ID | Feature | Phase | Label |
|---|---|---|---|
| JS-01 | Structural tree diff; ignore key order (default on) | P2 | Core |
| JS-02 △ | Ignore array order (optional); match array items by key, **auto-detected** (`id`, `uuid`, `key`) with override | P2 | Core |
| JS-03 | Moved items shown as moves | P2 | Core |
| JS-04 | `null` vs missing kept distinct (option to treat equal); duplicate keys reported with line | P2 | Core |
| JS-05 | JSONPath for every change | P2 | Core |
| JS-06 | Ignore keys (e.g. `updatedAt`, `requestId`) | P2 | Core |
| JS-07 | Tree, side-by-side and raw views | P2 | Core |
| JS-08 △ | Export as JSON Patch (RFC 6902), Merge Patch (RFC 7386), JSONPath list or Markdown; verify patch round-trips | P2 | Core |
| JS-09 | TOML and .env | Later | Later |
| JS-10 ★ | Numeric tolerance (100.00 = 100; optional decimal tolerance) | P2 | Core |
| JS-11 ★ | "Type changed" as its own category in stats and filters | P2 | Core |

## MD · Markdown mode

| ID | Feature | Phase | Label |
|---|---|---|---|
| MD-01 | Rendered diff with word-level insert/delete highlights | P2 | Core |
| MD-02 | Rendered, source and side-by-side views | P2 | Core |
| MD-03 | Outline of headings marked added/removed/edited, click to jump | P2 | Core |
| MD-04 | Changed links and images with before/after tooltips | P2 | Core |
| MD-05 | Changed code blocks shown as line diffs | P2 | Core |
| MD-06 | Broken anchor check (renamed heading still linked) | P2 | Core |
| MD-07 | GitHub-flavoured Markdown: tables, task lists, callouts | P2 | Core |
| MD-08 ★ | CriticMarkup export | Later | Later |

## CD · Code mode

| ID | Feature | Phase | Label |
|---|---|---|---|
| CD-01 | Structure-aware diff with tree-sitter (WASM) for TypeScript, JavaScript, Java, Python | P3 | Beta |
| CD-02 | Formatting-only changes collapse to "no logic change" | P3 | Beta |
| CD-03 | Renamed and moved functions/methods detected and labelled | P3 | Beta |
| CD-04 | Falls back to text mode for other languages or parse failures, with a notice | P3 | Beta |
| CD-05 | Parsers lazy-loaded per language | P3 | Beta |
| CD-06 ★ | Meaning-preserving edits hidden (argument order where named, number base, optional commas); toggles for renames and comment-only changes | P3 | Beta |

## OUT · Output

| ID | Feature | Phase | Label |
|---|---|---|---|
| OUT-01 | Changelog generator with templates: release notes, Keep a Changelog, Slack message, PR comment | P1 | Core |
| OUT-02 | Changelog is editable; group by severity; include/exclude docs-only | P1 | Core |
| OUT-03 | Export Markdown, JSON report, standalone HTML report | P1 | Core |
| OUT-05 △ | Share link: files compressed into the URL hash; options to include rules, decisions and the open change | P1 | Core |
| OUT-06 | Size-aware sharing: warn above ~8 KB; offer "download comparison file" instead | P1 | Core |
| OUT-07 | Local history (IndexedDB): search, filter, pin, delete, clear all, empty state | P1 | Core |
| OUT-08 | Print-friendly report | P5 | Core |
| OUT-09 ★ | Passphrase-locked share links (WebCrypto AES-GCM + PBKDF2); unlock screen | P1 | Core |
| OUT-10 ★ | Changelog as RSS/Atom feed for static hosting | P4 | Core |
| OUT-11 ★ | Published JSON Schema for the JSON report | P4 | Core |
| OUT-12 ★ | "Copy for LLM" (breaking, all, or current change) and "Open in Claude"; Specdiff makes no AI calls | P5 | Core |

## SET · Rules and settings

| ID | Feature | Phase | Label |
|---|---|---|---|
| SET-01 | Turn rules on/off; change a rule's severity | P1 | Core |
| SET-02 | Ignore paths (glob) and extensions (`x-*`) | P1 | Core |
| SET-03 △ | One `.specdiff.yaml` (rules, ignores, preset, options, filters, decisions path) imported/exported by the app and read by the CLI | P1 | Core |
| SET-04 | Diff options per mode | P1 | Core |
| SET-05 | Theme: light, dark, system | P1 | Core |
| SET-06 | Diff colour theme: default, colour-blind (blue/orange), high contrast | P1 | Core |
| SET-07 | Keyboard shortcut sheet; reduced motion respected | P1 | Core |

## VW · Viewer (Swagger UI replacement)

| ID | Feature | Phase | Label |
|---|---|---|---|
| VW-01 △ | API overview: info, servers, auth, endpoints by tag with change badges; a route per operation and schema; renders only what is near the viewport; CSS-variable theming | P3 | Core |
| VW-02 | Endpoint page: description, parameters, headers, request body, responses, examples; deprecated state with sunset date and migration | P3 | Core |
| VW-03 | Schema page: fields, types, constraints, removed fields struck through, "used in" | P3 | Core |
| VW-04 △ | Search across endpoints, fields, parameters, response codes and descriptions | P3 | Core |
| VW-05 | Try it: request builder (form and JSON), servers, auth (API key, bearer, basic, OAuth2 client credentials), send from browser, response viewer with schema check; tokens in memory unless "remember" is ticked | P3 | Core |
| VW-06 | Code samples: curl, JavaScript (fetch), Python (requests), Java (HttpClient) | P3 | Core |
| VW-07 | Version timeline: load several versions; version picker; compare any two | P3 | Core |
| VW-08 | Badges: New, Changed, Breaking, Deprecated on endpoints and fields | P3 | Core |
| VW-09 | Per-endpoint history across versions | P3 | Core |
| VW-10 | "What changed for me?": pick endpoints or drop a HAR file; upgrade checklist | P3 | Core |
| VW-11 | Try-it warning when the request would fail on the newer version, with a one-click fix | P3 | Beta |
| VW-12 | Deep links; light/dark; brand colour and logo option for embeds | P3 | Core |
| VW-13 △ | CORS guidance when a request is blocked; optional user-supplied CORS proxy URL (Specdiff hosts none) | P3 | Core |
| VW-14 ★ | "Copy for LLM" on each Viewer page | P3 | Core |

## PK · Packages

| ID | Feature | Phase | Label |
|---|---|---|---|
| PK-01 | `@specdiff/core`: parsing, normalising, diff engines, rules, changelog builder (no DOM) | P1 | Core |
| PK-02 | `@specdiff/embed`: script build, `Specdiff.mount(el, { url, compareWith, mode, theme, brand })` | P4 | Core |
| PK-03 | `@specdiff/react`: components wrapping the Viewer and diff | P4 | Core |
| PK-04 △ | `specdiff` CLI: `npx specdiff-cli old new` opens the local UI; `--ci` prints the report and exits non-zero per `--fail-on` (breaking, possibly, missing-version-bump); `--format md\|json\|html`; git `rev:path`; `history <file>` walks git history for the Viewer timeline; reads `.specdiff.yaml` and decisions | P4 | Core |
| PK-06 | Express and Fastify middleware serving the Viewer at `/docs` | P4 | Core |
| PK-07 | Spring Boot starter (Maven Central): serves the Viewer at `/specdiff`, reads the app's OpenAPI document automatically | P4 | Core |
| PK-08 | Offline/installable web app (PWA) | P5 | Core |
| PK-09 ★ | Git diff driver: `git log -p` shows the semantic changelog for spec files | P4 | Core |
| PK-10 ★ | Pre-commit hook configuration | P4 | Core |
| PK-11 ★ | Local MCP server in the CLI (stdio; nothing leaves the machine) | Later | Later |

## X · Across everything

| ID | Feature | Phase | Label |
|---|---|---|---|
| X-01 | 100% client-side; no content leaves the browser; no account | P1 | Core |
| X-02 | Web Workers for parsing and diffing; virtualised lists | P1 | Core |
| X-03 | Code-splitting: diff renderer, tree-sitter, Markdown and Viewer loaded on demand | P1 | Core |
| X-04 | Command palette (Cmd/Ctrl+K): files, changes, actions, settings | P1 | Core |
| X-05 | Full keyboard navigation; visible focus; screen-reader labels; WCAG AA | P1 | Core |
| X-06 | Diff colours always paired with `+ − ~ ↕` and severity symbols `! ? + ¶` | P1 | Core |
| X-07 | Phone layout: read-only view of comparisons, shared links and the Viewer | P5 | Core |
| X-08 | Error, empty, identical, loading and too-large states for every mode; toasts | P1 | Core |
| X-09 | Automated tests: every OpenAPI rule has fixtures; Playwright + axe on every screen | P1 | Core |
| X-10 | Privacy-friendly page analytics only (no file content), or none | P5 | Core |
| X-11 ★ | "Mark as viewed" per change or file with review progress, in every mode | P1 | Core |
| X-12 ★ | Deep link to any change in every mode | P2 | Core |
| X-13 ★ | Deterministic output: same inputs → byte-identical reports and fingerprints | P1 | Core |

## Not doing (v1)

GitHub Action package (was PK-05) and CI snippet export (was OUT-04), removed 15 Nov 2026: no GitHub Actions; use `npx specdiff-cli --ci` in any CI · Hosted approvals, accounts or a server-side review store · server-side or browser-initiated AI calls · merging or editing text · PDF, Word, Excel, image or folder comparison · AsyncAPI diff (Later) · localised messages (Later).

## Totals

136 features: Core 124 · Beta 8 · Later 4 (33 are new in v2). The v2 additions add roughly 60–100 hours to the original 290–430 hour estimate. If time is short, move these to Later first: OA-20, OA-22, TX-11, TX-12, OUT-10, PK-09.
