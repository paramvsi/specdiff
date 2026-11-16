# 04 · Architecture

Frontend only. No backend services. Everything is static files plus published packages.

## Monorepo (pnpm workspaces + Turborepo)

```
specdiff/
├─ packages/
│  ├─ core/        @specdiff/core     parsers, normalisers, diff engines, OpenAPI rules, review fingerprints,
│  │                                  changelog builder, report schema. Pure TS, no DOM, runs in workers and Node.
│  ├─ ui/          @specdiff/ui       tokens, React components from the design system, diff viewers, /_ds showcase
│  ├─ viewer/      @specdiff/viewer   API reference screens (uses ui + core)
│  ├─ embed/       @specdiff/embed    script build, Specdiff.mount()
│  ├─ react/       @specdiff/react    React wrapper for viewer and diff
│  ├─ cli/         specdiff           CLI: local UI server, --ci, rev:path, history, git diff driver
│  ├─ express/     @specdiff/express  Express middleware (+ fastify export)
│  └─ spring-boot-starter/            Java + Maven: serves the built Viewer at /specdiff
├─ apps/
│  ├─ app/         the web app (Vite + React SPA, PWA; the empty Compare screen is prerendered at build time and hydrated, B-53)
│  └─ website/     marketing site, docs, rules reference, changelog (Astro, static)
├─ fixtures/
│  ├─ rules/<rule-id>/{before.yaml, after.yaml, expected.json}
│  ├─ specs/       sample and large real-world specs (Petstore, a 10 MB spec, a Swagger 2.0 spec)
│  └─ samples/     the payments example used by the designs and IN-05
├─ examples/       one runnable example per package
├─ docs/           the docs in this pack, kept current, plus LIBRARIES-LOCK.md
├─ scripts/       assemble-site.mjs (website + app → dist/), verify scripts
└─ netlify.toml   build command, publish dir, redirects, headers
```

Dependency direction: `core` ← `ui` ← `viewer` ← (`app`, `embed`, `react`, `express`, starter). `core` never imports UI code. `cli` imports `core` only (the CLI also serves the built `app`).

## Data flow

```
Input (paste / file / folder / ZIP / URL / patch / git rev:path)
  └─► Worker: detect mode ─► parse with source positions
        └─► normalise (OpenAPI: Swagger 2 → 3.1, deref with cycle tracking, flatten allOf if asked,
                       unify nullability, merge path-level params, sort)
              └─► diff engine for the mode ─► rules ─► changes[]
                    └─► dedup shared schemas, group by source block, apply preset + ignores + decisions
                          └─► Report { summary, changes[], versionCheck, stats }   (see docs/07)
UI: summary · explorer · detail · raw diff (location links both ways) · review · changelog · exports · share
```

- **One change model for every mode** (`docs/07`). OpenAPI adds `ruleId`, `severity`, `direction`, `sharedSchema`.
- **Rules are pure functions** over normalised before/after nodes. Each has an ID, default severity, direction, preset membership (Wire/SDK), explanation template, fix template and fixtures.
- **Fingerprints** are stable hashes of `ruleId + canonical location + before/after essentials`, so review decisions survive reformatting and re-ordering.
- **Version bump:** any breaking → major (minor below 1.0.0); any safe addition → minor; otherwise patch. Version check compares with `info.version` on both sides.

## Workers and responsiveness

- Parsing, normalising and diffing run in a dedicated worker via Comlink. Progress events per file and step drive the Parsing screen (A-02). Cancel terminates the worker.
- Lists over a few hundred rows use TanStack Virtual.
- The diff renderer, Markdown pipeline, tree-sitter grammars and the Viewer are separate lazy chunks.

## Budgets (enforced by size-limit in `pnpm verify` and the Netlify build)

| Target | Budget |
|---|---|
| App initial JS (gzip), without lazy chunks | ≤ 200 KB |
| Embed Viewer bundle (gzip) | ≤ 250 KB |
| Website JS on Home (gzip) | ≤ 60 KB (motion is CSS) |
| 10 MB spec | parse + diff off the main thread; 60 fps while scrolling results |
| Lighthouse (website and app) | ≥ 95 in every category |

## Share links

`#v=1&c=<base64url(deflate(JSON{left,right,mode,options,view,decisions?}))>`. With a passphrase: `#v=1&e=1&s=<salt>&i=<iv>&c=<base64url(AES-GCM(deflate(...)))>`, key from PBKDF2-SHA-256 (≥ 310,000 iterations). The hash never reaches a server. Warn above ~8 KB; offer "Download comparison (.specdiff.json)".

## Storage

IndexedDB via idb-keyval: history (with pinning), saved sources and their last snapshot, settings. All of it clearable from History and Settings. Viewer auth tokens stay in memory unless "Remember in this browser" is ticked (then localStorage, with the warning shown in V-02 Auth).

## Security and privacy

- All input is untrusted. Markdown is sanitised (rehype-sanitize, GitHub schema). No `eval`, no `new Function`, no `innerHTML` from user content.
- URL loading uses `fetch` from the browser; CORS failures are explained, never proxied by us.
- The CLI does not fetch remote `$ref` URLs in `--ci` mode unless `--allow-external-refs` is given (then every host). In the local UI it fetches them and follows relative `$ref`s inside a fetched file on the same host; other hosts need the flag (M-1). At most 50 files and 25 MB in all. It refuses git revisions starting with `-`, and passes `--end-of-options` to every git call.
- Content Security Policy on website and app: no inline scripts, `connect-src` limited to what the user loads.
- No analytics on content. At launch, no analytics at all.

## Testing layers

| Layer | Tool | What |
|---|---|---|
| Rules | Vitest + fixtures | Every rule: before/after → expected changes. Property tests (fast-check) for direction and determinism |
| Core | Vitest | Parsers, normaliser, dedup, fingerprints, version check, share-link codec, HAR matching |
| UI | Vitest + Testing Library | Components and stores |
| E2E | Playwright | Main path per screen, keyboard paths, PWA offline |
| A11y | @axe-core/playwright | Every screen, light and dark |
| Visual | Playwright `toHaveScreenshot` | Each screen vs `design/screens/` reference at 1440 and 390 |
| Packages | Example projects | CLI exit codes and decisions handling, pre-commit hook on a sample repo, Spring Boot sample app serves `/specdiff` |

## Hosting and checks (Netlify, no GitHub Actions)

One Netlify site serves both apps from the monorepo:

- **Build command:** `pnpm verify:netlify && node scripts/assemble-site.mjs` — lint, typecheck, unit tests, build and size budgets, then copy `apps/website/dist` to `dist/` and `apps/app/dist` to `dist/app/`. A failing check fails the deploy.
- **Publish directory:** `dist`. **Node:** current Active LTS via `NODE_VERSION`. **pnpm:** via `corepack`.
- **Redirects:** `/app/*  /app/index.html  200` for the SPA; the website's own 404 page for everything else.
- **Headers (`netlify.toml`):** Content-Security-Policy (no inline scripts; `connect-src` must allow `https:` because users load specs from URLs and send Try it requests), `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, long `Cache-Control` for hashed assets, short for HTML.
- **Deploy previews** per branch once the repo is connected (ask the owner before connecting or pushing).
- **Domain** via Netlify DNS once decided (D-5).

Playwright e2e, axe and visual tests are too heavy for the Netlify build, so they run locally in `pnpm verify` and in the pre-push hook. Package releases (npm, Maven Central) run locally with Changesets and Maven, only when the owner says so.

```toml
# netlify.toml (starting point)
[build]
  command = "pnpm verify:netlify && node scripts/assemble-site.mjs"
  publish = "dist"
[build.environment]
  NODE_VERSION = "<current Active LTS>"
[[redirects]]
  from = "/app/*"
  to = "/app/index.html"
  status = 200
[[headers]]
  for = "/*"
  [headers.values]
    Referrer-Policy = "no-referrer"
    X-Content-Type-Options = "nosniff"
    Content-Security-Policy = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https:; connect-src 'self' https:; worker-src 'self' blob:"
[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
```
