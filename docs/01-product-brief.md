# 01 · Product brief: Specdiff

> **One line:** Specdiff shows what changed between two versions of an API spec, config, document or code file, explains which changes break clients and how to avoid it, lets your team accept or reject each one, and turns them into a changelog. Everything runs in the browser; nothing is uploaded.

## 1. Why it exists

API teams change their OpenAPI specs constantly, and the people who depend on those APIs find out about breaking changes when production fails. In November 2026 the tools each solve one slice (details and sources in `research/competitive-research.md`):

| Tool | Good at | Gap Specdiff fills |
|---|---|---|
| oasdiff (CLI, Apache-2.0) | 755 checks, CI, free side-by-side review link, MCP server | Approve/reject and audit are paid ($100/month); review page needs an encrypted upload; terminal-first |
| Scalar OpenAPI Diff (web, free) | In-browser, hash share links | Small rule set: no security, response headers, external `$ref`s, or `oneOf/anyOf/allOf` depth |
| Bump.sh (hosted, from $50/month) | Changelog, notifications, RSS | Spec must live on their platform; no free tier |
| Optic | — | Archived in January 2026 |
| pb33f openapi-changes | Offline HTML report, git history timeline | CLI-first, no reference docs |
| Diffchecker | Text, PDF, images; AI explain | No API or JSON meaning; ads; desktop app is paid |
| SemanticDiff, Difftastic | Language-aware code diff | VS Code / GitHub / terminal only |
| Swagger UI, Scalar, Redoc 3 | API reference docs | **None is version-aware**: no timeline, change badges or "what changed for me" |

**Positioning:** *The deepest explanation of an API change, a free review workflow with no server, and the only version-aware API reference.* Privacy is now table stakes (Scalar and oasdiff both offer it), so Specdiff leads with **explanation**, **review** and **version awareness**, and keeps privacy as a promise it can prove.

## 2. Who it's for

1. **Backend and API engineers** reviewing a spec change before merging ("will this break anyone?").
2. **API consumers** (frontend, mobile, partner teams) checking what changed in a provider's new version, and whether it affects the endpoints they call.
3. **Tech leads and release managers** writing release notes, choosing the version number and signing off on breaking changes.
4. **Anyone comparing two files** who wants a better diff than a generic site, without uploading private content.

## 3. Principles

1. **Private by design.** All parsing and diffing happen in the browser. No accounts, no uploads, no content analytics. Share links carry the content themselves and can be locked with a passphrase.
2. **Meaning over text.** Show what changed and why it matters. Raw lines are one click away, never the first thing.
3. **Explain, don't just flag.** Every breaking change says who it breaks, what they will see, and how to avoid it.
4. **Report once.** A shared schema change is one finding at the schema, not one per endpoint. Nullability written three ways is one concept.
5. **Fast with big files.** Heavy work runs in workers; heavy parts load only when needed.
6. **Accessible by default.** Colour-blind-safe diff colours, symbols as well as colour, full keyboard use, WCAG AA.
7. **Calm, precise interface.** Direction A, Graphite & Chartreuse: dense, quiet, one bold accent. The website may move; the app stays still.

## 4. What we are building (three products, one codebase)

### 4.1 Website (`specdiff.app`, domain to confirm)
Home page with a live, animated demo, before/after slider, feature grid, Viewer showcase, package tabs, FAQ. Docs, the rules reference generated from code and fixtures, and the project changelog. Static, fast, SEO-friendly. Design: **Home v2** in `design/prototypes/website/W01v2-*`.

### 4.2 Web app (the diff tool)
- **Compare** any two files: paste, drop, open, folder or ZIP, URL or GitHub link, or a pasted patch.
- **Modes**, auto-detected with manual override: OpenAPI (flagship), JSON/YAML, Markdown, Code (Beta), Text.
- **OpenAPI**: semantic diff of Swagger 2.0 and OpenAPI 3.0/3.1/3.2; severity per change; explanation and fix; version-bump check; shared-schema dedup; Wire/SDK strictness presets; SDK-impact view (Beta); "changes that affect me" filter from operationIds or a HAR file.
- **Review**: accept or reject each change with a note; decisions saved to `.specdiff/decisions.json`, which the CLI and pre-commit hook respect; "mark as viewed" progress.
- **Output**: changelog templates, exports (Markdown, JSON, HTML, JSON Patch, Merge Patch, RSS), share links (optionally passphrase-locked), local history, saved sources that re-check a URL on each visit.
- **Rules and settings**: presets, per-rule severity, ignore paths, regex text filters, diff options, themes; all stored in one `.specdiff.yaml` shared with the CLI.

### 4.3 Viewer (Swagger UI replacement)
A modern API reference from any OpenAPI/Swagger file: overview, endpoint and schema pages, search across fields, code samples, Try it with auth, CORS guidance. Plus what no free renderer does: **version timeline, New/Changed/Breaking/Deprecated badges, per-endpoint history, "What changed for me?", and a warning when a Try it request would fail on the newer version.**

### 4.4 Packages
`@specdiff/core` engine; embed script; React component; `specdiff` CLI (`npx specdiff-cli`, `--ci` for any CI system, git `rev:path`, `history`); Express and Fastify middleware; **Spring Boot starter** (Maven Central) serving the Viewer at `/specdiff`; git diff driver; pre-commit hook. A local MCP server is planned for later.

## 5. Scope decisions

- **Everything launches together.** Code mode, the SDK-impact view and the local MCP server are Beta or Later as labelled in `docs/02`.
- **Frontend only.** No backend, database or accounts. Hosting: one static Netlify site and package registries.
- **No GitHub Actions.** No Action package and no CI workflows in the repo; checks run locally and in the Netlify build. Teams can still run `npx specdiff-cli --ci` in whatever CI they use.
- **Light first, dark too**, plus colour-blind and high-contrast diff themes.
- **Open source, MIT licence.**
- **No AI calls from Specdiff.** "Copy for LLM" and "Open in Claude" hand the content to the user's own tools.

## 6. Non-goals (v1)

- Accounts, teams, cloud storage, hosted approvals, notifications or webhooks.
- PDF, Word, Excel, image or folder comparison.
- Editing and saving specs, or merging text. *Specdiff reads; your editor writes.*
- Mock servers or API testing beyond the Viewer's Try it.
- Server-side or browser-initiated AI.

## 7. Success measures (portfolio scale)

- A senior engineer understands a 50-change OpenAPI diff in under 2 minutes.
- Lighthouse 95+ on website and app; WCAG AA; keyboard-only use works.
- A 10 MB spec parses without freezing the page.
- Real usage signals: GitHub stars, npm and Maven downloads, `specdiff --ci` used in other projects' pipelines.

## 8. Brand

- **Name:** Specdiff (lower case in the wordmark: `specdiff`).
- **Mark:** two overlapping rounded rectangles: an outlined "before" and a chartreuse "after" with a plus.
- **Direction A, Graphite & Chartreuse:** Geist + Geist Mono; sage-grey ground `#ECEEE9`; ink `#15171A`; chartreuse `#C8F24A` used sparingly; blue/orange for added/removed (colour-blind safe).
