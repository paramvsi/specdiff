# Competitive research (November 2026)

What similar tools do, what Specdiff borrows, and what it does differently. Feature IDs refer to `docs/02`.

## OpenAPI diff and change management

**oasdiff** (Go, Apache-2.0). The most complete rule engine: the catalogue grew from 575 to 681 to 755 checks between September and November 2026. Free tier: CLI, GitHub Action with inline annotations, a web diff tool, and a side-by-side review link where specs are stored encrypted and the key stays in the URL fragment. Pro ($100/month): approve/reject per change, audit trail, merge gate. Also: `.oasdiff.yaml` config, git `rev:path` inputs, `--fetch`, git diff driver, pre-commit `breaking-files`, MCP server, deterministic output, shared-schema dedup (Microsoft Graph: 713,875 findings → 18,953), nullability unified across the three forms, sunset-date rules, `--fail-on MISSING-VERSION-BUMP`, security judged per operation including inherited security and all four OAuth flows, external `$ref`s off by default on fork PRs after a security advisory. It publishes the **OpenAPI Changes Model** (681 named changes, 15,255 possible edits) under Apache-2.0.
→ Borrowed: OA-14, OA-15, OA-16, OA-17, OA-08 version check, OA-18 options, PK-04 `rev:path`, PK-05 fork safety, PK-09, PK-10, SET-03 single config, X-13 determinism. **Different:** review decisions are free and stored in the repo (OA-21), no upload of any kind.
Sources: https://www.oasdiff.com/whats-new · https://www.oasdiff.com/pricing · https://github.com/oasdiff/oasdiff · https://github.com/oasdiff/openapi-changes-model

**Scalar OpenAPI Diff** (free web tool). Runs in the browser; share links keep both documents after `#`; upgrades Swagger 2.0 with `@scalar/openapi-parser`; path-parameter renames are notes. Its own page lists limits: no security requirements, response headers, examples or descriptions; `oneOf/anyOf/allOf` compared at the top level only; external `$ref`s not fetched; no CI command.
→ Privacy alone is no longer unique. Specdiff wins on depth and review.
Source: https://scalar.com/tools/openapi-diff

**Bump.sh** (hosted, from $50/month; Pro $120). Automatic changelog, breaking-change detection, email digests, RSS feed, PR comments, API Explorer. Spec must live on their platform; no permanent free tier.
→ Borrowed: OUT-10 RSS changelog.
Sources: https://docs.bump.sh/help/api-change-management/ · https://bump.sh/pricing

**Optic** — archived January 2026, no longer maintained. Its idea of a visual changelog in PRs, rendered locally from data in the URL, informs OUT-05.
Sources: https://dev.to/peter_zsobrk_50d5c4ac7de/optic-is-dead-alternatives-for-openapi-breaking-change-detection-dmp · https://useoptic.com/blog/web-previews

**pb33f openapi-changes** (Go). Offline HTML report with timeline, explorer graph, side-by-side/focused/unified/inline diffs; walks git history of a spec.
→ Borrowed: PK-04 `history`, VW-07 timeline fed from git.
Source: https://pb33f.io/openapi-changes/

**Speakeasy** (SDK generation). PR comments show changes as SDK calls, e.g. `open_router.responses.send(): Removed (Breaking ⚠️)`.
→ Borrowed: OA-20 SDK-impact view.
Source: https://www.speakeasy.com/docs/sdks/guides/sdk-preview-breaking-changes

**GraphQL Hive** (schema registry). Breaking changes judged against real usage ("conditional breaking changes"), top affected operations, approvals kept per PR.
→ Borrowed: OA-22 "changes that affect me" from a HAR file, locally.
Source: https://the-guild.dev/graphql/hive/docs/schema-registry/schema-checks

**Buf** (Protobuf). Strictness categories FILE, PACKAGE, WIRE_JSON, WIRE.
→ Borrowed: OA-19 Wire and SDK presets.
Source: https://buf.build/docs/breaking/rules

**AsyncAPI diff** (`@asyncapi/diff`). Breaking / non-breaking / unclassified with overrides. → Later.
Source: https://github.com/asyncapi/diff

## General and structural diff

**Diffchecker.** Text, PDF, Word, Excel, images, folders; Smart/Word/Char precision; text transforms; real-time editing; AI explain on Pro; desktop app for offline use ($15/month); ads on free tier.
→ Borrowed: TX-02, TX-09, TX-10.
Source: https://www.diffchecker.com/pricing

**Kaleidoscope** (macOS). Text filters that remove timestamps, addresses and IDs before comparing.
→ Borrowed: TX-08.
Source: https://kaleidoscope.app/v4

**SemanticDiff** (VS Code, GitHub). Hides style-only changes, detects moved code and refactorings, language invariances (argument order, number base).
→ Borrowed: TX-11, CD-06.
Source: https://semanticdiff.com/docs/what-is-semanticdiff

**JSON diff sites** (many). Ignore key/array order, match array items by key (auto-try `id`, `uuid`, `key`), JSONPath per change, JSON Patch and Merge Patch, duplicate-key reporting, numeric tolerance.
→ Borrowed: JS-02 auto key, JS-08 Merge Patch, JS-10, JS-11.
Sources: https://coderspace.io/en/tools/json-diff/ · https://jasperbernaers.com/json-diff-viewer/

**GitHub "Files changed"** (default since January 2026). Resizable file tree with comment/warning indicators, virtualised large PRs, mark as viewed.
→ Borrowed: X-11.
Source: https://github.blog/changelog/2026-01-22-improved-pull-request-files-changed-page-on-by-default/

**@pierre/diffs** (open source). Shiki-based diff rendering, virtualisation, worker highlighting, colour-blind themes, React and vanilla. Candidate renderer (decision D-2).
Source: https://diffs.com/

## API reference renderers (Viewer competitors)

**Swagger UI** (Apache-2.0). Supports OpenAPI 2.0–3.2 since April 2026; dark mode; deep linking; reliable but dated.
Sources: https://github.com/swagger-api/swagger-ui/releases · https://swagger.io/blog/swagger-launches-support-for-openapi-3-2-0

**Scalar API Reference** (MIT). Modern layout, built-in API client, 11 themes, CORS proxy, framework integrations (Express, Fastify, Hono), Swagger-style classic layout.
Source: https://scalar.com/guides/migration/swagger-ui

**Redoc CE 3.0** (MIT, 23 October 2026). OpenAPI 3.2, AsyncAPI, GraphQL; dark mode; CSS-variable theming; search across fields, parameters and response codes; a route per operation; renders only near the viewport; "Copy for LLM", "Open in Claude/ChatGPT".
→ Borrowed: VW-01 routing and windowing, VW-04 search depth, VW-14.
Source: https://redocly.com/blog/redoc-3-release

**Gap that still holds:** none of the free renderers is version-aware (timeline, change badges, per-endpoint history, "what changed for me"). Small framework add-ons (a Django Swagger plugin with NEW/UPDATE/DELETE badges for local use) show the demand. This is the Viewer's reason to exist.
Source: https://pypi.org/project/swagger-diff-ui/0.1.0/

## Design references

- Developer tools (Vercel, Linear, Raycast, Resend) use monospace in their brands. Geist Mono, JetBrains Mono, IBM Plex Mono and Commit Mono are all 0.6 em per character; ligatures off in diffs.
- Colour-blind-safe diff: blue for added, orange for removed works across protanopia, deuteranopia and tritanopia. Specdiff's palette follows this axis.
