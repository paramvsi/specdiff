# 08 · Build plan

Estimate: **350–530 focused hours** with Claude Code (the original 290–430 plus the v2 additions). At 15–20 hours a week, about 5–6 months. One public launch at the end; the app is usable from the end of P1.

After **every phase**: `pnpm verify` green (lint, typecheck, unit, build, size, e2e, axe, visual); axe clean; visual comparison against `design/screens/` at 1440 px and 390 px, light and dark; a progress report listing done / deferred / unsure with IDs. Then wait for the owner before the next phase.

---

## P0 · Setup (week 1, ~15 h)

**Steps:** P0.1 workspace → P0.2 tooling → P0.3 app and website shells → P0.4 tokens and fonts → P0.5 checks and Netlify config.

- pnpm workspace + Turborepo with the layout in `docs/04`; TypeScript strict everywhere.
- Vite + React app shell; Astro website shell; empty packages with build scripts.
- ESLint (with jsx-a11y), Prettier, Vitest, Playwright + axe, size-limit budgets, Changesets.
- `design/tokens.css` imported once; Geist and Geist Mono self-hosted; `design/motion.css` copied into the website.
- No GitHub Actions. `pnpm verify` (everything) and `pnpm verify:netlify` (lint, typecheck, unit, build, size) scripts; a pre-push hook (simple-git-hooks) runs `pnpm verify`.
- `netlify.toml` and `scripts/assemble-site.mjs` from `docs/04` (website at `/`, app at `/app`). Do not connect the site or deploy yet.
- `docs/LIBRARIES-LOCK.md` created with every pinned version.

**Done when:** `pnpm verify` and `pnpm verify:netlify` pass on the empty app and site; `dist/` assembles with the website at `/` and the app at `/app`; a `/_ds` test page shows the tokens in light and dark; fonts load from the app's own origin.

---

## P1 · Foundations + OpenAPI + review (weeks 2–9, ~170–230 h)

**Steps:**
1. **P1.1 Design system in code** — every component in the PDF and both component sheets (`AComponents`, `AComponents2`) in `@specdiff/ui`, shown on `/_ds`.
2. **P1.2 App shell and input** — Compare (A-01, drag-over), Load from URL (O-05), parsing worker and Parsing screen (A-02), mode detection, size guard (O-08), errors. *IN-01…10, X-02, X-08.*
3. **P1.3 Text mode** — renderer spike (D-2), then A-03 with filters, transforms, precision, live re-diff. *TX-01…10.*
4. **P1.4 Core engine** — OpenAPI parse/upgrade/deref (spike D-3), normaliser, change model, fingerprints, determinism tests. *OA-01, OA-02, OA-16, OA-18, X-13.*
5. **P1.5 Rules** — the catalogue in `docs/06` in batches of ~10, each with fixtures (Prompt R). Shared-schema dedup, source-block grouping, sunset policy, presets, version check. *OA-03…08, OA-14, OA-15, OA-17, OA-19.*
6. **P1.6 OpenAPI screens** — Summary (A-04), Workspace (A-05), Review mode (A-05 review), Raw diff (A-06), Explain drawer (O-04). *OA-09…13, OA-21, X-11.*
7. **P1.7 Output** — Changelog and export (A-10), share links with passphrase (O-09, O-10), history (A-11 + empty). *OUT-01…03, OUT-05, OUT-06, OUT-07, OUT-09.*
8. **P1.8 Settings and polish** — Rules and settings (A-12), command palette, shortcuts (O-03), toasts (O-13), dark checks. *SET-01…07, X-04, X-05, X-06.*

**Done when:** every rule in `docs/06` has passing fixtures; reports are byte-identical across runs; a 10 MB spec stays responsive; A-01…A-06, A-10…A-12 and their overlays match the designs in light and dark; decisions round-trip through `decisions.json`.

---

## P2 · JSON/YAML, Markdown, text extras (weeks 10–12, ~45–60 h)

**Steps:** P2.1 JSON/YAML engine and A-07 (tree, side by side, raw, export) → P2.2 Markdown engine and A-08 (rendered, source, side by side, checks) → P2.3 moved blocks and patch input → P2.4 deep links in every mode.

*JS-01…08, JS-10, JS-11, MD-01…07, TX-11, TX-12, X-12.*

**Done when:** fixtures cover key order, array matching (auto key), moves, null vs missing, duplicate keys, numeric tolerance; generated JSON Patch and Merge Patch round-trip; Markdown handles GFM tables, task lists, callouts, code blocks and broken anchors.

---

## P3 · Code (Beta) + Viewer + consumer features (weeks 13–18, ~80–110 h)

**Steps:**
1. **P3.1 Code mode (Beta)** — tree-sitter for TS, JS, Java, Python, lazy per language; A-09 and fallback. *CD-01…06.*
2. **P3.2 Viewer core** — overview, endpoint, schema, search, deprecated state, load error. *VW-01…04, VW-12, VW-14.*
3. **P3.3 Try it** — request builder, auth dialog, response, CORS guidance, code samples. *VW-05, VW-06, VW-13.*
4. **P3.4 Version awareness** — version set, picker, timeline, badges, endpoint history, what changed for me, fails-on-newer warning. *VW-07…11.*
5. **P3.5 Consumer features in the app** — "changes that affect me" (HAR / operationIds), SDK-impact view. *OA-22, OA-20.*

**Done when:** code mode falls back cleanly; the Viewer renders Petstore, a large real-world spec and a Swagger 2.0 spec correctly; Try it works against a CORS-enabled test API; every V-screen matches its design.

---

## P4 · Packages (weeks 19–21, ~50–70 h)

**Steps:** P4.1 CLI (local UI, `--ci` for any CI, formats, `rev:path`, `history`, `.specdiff.yaml`, decisions) → P4.2 git diff driver and pre-commit hook → P4.3 embed and React → P4.4 Express/Fastify → P4.5 Spring Boot starter → P4.6 RSS changelog export and report JSON Schema.

*PK-02…04, PK-06, PK-07, PK-09, PK-10, IN-12, OUT-10, OUT-11.*

**Done when:** each package has a README, an example in `examples/` and an e2e test; `specdiff --ci` and the pre-commit hook fail on a sample repo's breaking change and pass once it is accepted in decisions; the Spring Boot sample app serves `/specdiff`; nothing is published.

---

## P5 · Website, phone, polish, launch (weeks 22–24, ~45–60 h)

**Steps:** P5.1 Home v2 with motion (W-01) → P5.2 docs, guides, rules reference generated from core, changelog, 404 → P5.3 phone layouts M-01…M-05 → P5.4 saved sources, Copy for LLM, print report, PWA → P5.5 SEO, Lighthouse, budgets → P5.6 Netlify deploy (preview first) → P5.7 launch checklist.

*WEB-01…09, X-07, X-10, IN-11, OUT-08, OUT-12, PK-08.*

## Launch checklist

- All Core features done; Beta items labelled in the UI; Later items absent.
- Lighthouse 95+ in every category on website and app; axe clean on every screen; reduced motion verified.
- Size budgets pass; a 10 MB spec stays responsive.
- Netlify site connected and a deploy preview checked on phone and desktop; domain and package names confirmed (`docs/10`).
- npm packages and the Maven artifact published at 1.0.0 (**only after the owner says so**).
- README with a demo GIF, licence; CONTRIBUTING and a "good first issue" set.
- Launch posts drafted for the owner: GitHub release, LinkedIn, Hacker News "Show HN", r/webdev, dev.to.
