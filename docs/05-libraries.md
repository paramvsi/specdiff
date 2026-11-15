# 05 · Libraries

The only dependencies allowed. Ask the owner before adding anything else.

## Pinning rule

For every package below: install the **latest stable release that has been public for at least 14 days**, pin the exact version (no `^` or `~`), and add a row to `docs/LIBRARIES-LOCK.md` (package, version, date added, why). Re-check versions at the start of P5 and before launch. Node: the current Active LTS. Java: 21 (LTS). Spring Boot: the current 3.x line.

## Workspace and tooling

| Package | Used in | Purpose |
|---|---|---|
| `pnpm` | root | Package manager, workspaces |
| `turbo` | root | Task pipeline and caching |
| `typescript` | all | Strict mode (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| `eslint`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y` | all | Linting, accessibility lint |
| `prettier` | all | Formatting |
| `@changesets/cli` | root | Versioning and changelogs for packages |
| `tsup` | packages | Library builds (ESM + types; UMD/IIFE for embed) |
| `size-limit`, `@size-limit/preset-app` | root | Bundle budgets (run locally and in the Netlify build) |
| `simple-git-hooks` | root | Pre-push hook running `pnpm verify` (there is no CI service) |
| `netlify-cli` (dev only, optional) | root | `netlify dev` and manual deploys, if the owner wants them |

## App, UI and Viewer (React)

| Package | Purpose |
|---|---|
| `react`, `react-dom` | UI |
| `vite`, `@vitejs/plugin-react` | App build and dev server |
| `vite-plugin-pwa` | Installable/offline app (PK-08) |
| `zustand` | State |
| `@radix-ui/react-dialog`, `-tabs`, `-toggle-group`, `-tooltip`, `-popover`, `-dropdown-menu`, `-switch`, `-checkbox`, `-radio-group`, `-select`, `-slider`, `-scroll-area` | Accessible primitives, styled with tokens |
| `cmdk` | Command palette (X-04) |
| `lucide-react` | Icons (stroke icons as in the designs) |
| `@tanstack/react-virtual` | Virtualised change lists, trees, history |
| `comlink` | Worker RPC |
| `idb-keyval` | IndexedDB storage |
| `fflate` | Deflate for share links and ZIP input (IN-04) |
| Geist + Geist Mono woff2 (OFL) | Self-hosted fonts, from the official Geist release or `@fontsource` packages |
| Styling | **CSS Modules + `design/tokens.css`**. No CSS-in-JS runtime. (Tailwind v4 `@theme` is an acceptable alternative only if the owner agrees in P0.) |

## Engine (`@specdiff/core`)

| Package | Purpose |
|---|---|
| `yaml` | YAML/JSON parsing with source positions (line/column for errors, raw-diff links, fingerprints) |
| `@scalar/openapi-parser` **or** `@apidevtools/json-schema-ref-parser` | `$ref` resolution and Swagger 2 → 3.x upgrade. **Spike both in P1 (decision D-3)**; keep one |
| `diff` (jsdiff) | Line/word/char diffs for text, Markdown words and custom views |
| `picomatch` | Glob ignore paths |
| `semver` | Version check and bump suggestion |
| `zod` | Validate `.specdiff.yaml`, `decisions.json`, report JSON; export the report JSON Schema (OUT-11) |
| `fast-json-patch` | Verify generated JSON Patches round-trip (JS-08) — tests and export check only |
| `unified`, `remark-parse`, `remark-gfm`, `remark-rehype`, `rehype-sanitize`, `rehype-stringify`, `github-slugger` | Markdown mode: AST diff, GFM, sanitised rendering, heading anchors (MD-06) |
| `web-tree-sitter` + per-language WASM grammars (TypeScript, JavaScript, Java, Python) | Code mode (Beta), lazy per language |

HAR parsing, JSONPath generation, RFC 6902/7386 generation, nullability unification, shared-schema dedup and fingerprints are **our own code** in `core`.

## Diff renderer (decision D-2)

| Option | Packages | Notes |
|---|---|---|
| A (default) | `monaco-editor`, `@monaco-editor/react` | Proven diff editor; heavy, must be lazy |
| B | `@pierre/diffs`, `shiki` | Lighter, Shiki-based, virtualised, worker highlighting, colour-blind themes; newer |

Spike both against A-03 in P1 and keep one. Syntax highlighting elsewhere (Viewer code samples, Markdown code blocks) uses `shiki` either way.

## Website

| Package | Purpose |
|---|---|
| `astro`, `@astrojs/mdx`, `@astrojs/react`, `@astrojs/sitemap` | Static site, docs in MDX. React renders the demo, slider and tabs at build time; plain TypeScript makes them interactive (B-13), so no React reaches the browser |
| `shiki` | Code blocks in docs |
| `design/motion.css` | All website motion. No animation library |

## CLI and middleware

| Package | Purpose |
|---|---|
| `commander` | CLI arguments |
| `picocolors` | Terminal colours |
| `open` | Open the local UI in a browser |
| `sirv` | Tiny static server for the local UI |
| `express`, `fastify`, `@fastify/static` | **Peer dependencies** of `@specdiff/express` |

## Java (Spring Boot starter)

| Artifact | Purpose |
|---|---|
| `spring-boot-autoconfigure`, `spring-boot-starter-web` (provided) | Auto-configuration serving the built Viewer at `/specdiff` and reading `/v3/api-docs` |
| `org.springdoc:springdoc-openapi-starter-webmvc-api` (optional) | Detect the app's OpenAPI document when present |
| `junit-jupiter`, `spring-boot-starter-test` | Tests |
| `central-publishing-maven-plugin`, `maven-gpg-plugin`, `maven-source-plugin`, `maven-javadoc-plugin` | Maven Central release (ask before publishing) |

Group ID: `io.github.paramvsi` (confirm in `docs/10`).

## Testing

| Package | Purpose |
|---|---|
| `vitest`, `@vitest/coverage-v8` | Unit and rule tests |
| `@testing-library/react`, `@testing-library/user-event`, `jsdom` | Component tests |
| `fast-check` | Property tests for rules and determinism |
| `@playwright/test`, `@axe-core/playwright` | E2E, accessibility and visual tests, run locally and on pre-push |

## Not allowed

GitHub Actions toolkits (`@actions/*`), Moment/Lodash-style utility kits, CSS-in-JS runtimes, analytics SDKs, any library that sends data to a server, any AI SDK.
