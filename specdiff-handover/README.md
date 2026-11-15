# Specdiff handover pack · v2 (November 2026)

Everything Claude Code needs to build **Specdiff** end to end: the product, the final feature list, every screen (designed and approved), the design system, the libraries, data formats, the rule catalogue, and a phase-by-phase build plan with ready-to-paste prompts.

This is version 2 of the pack. It replaces v1 and adds: the competitive research from November 2026, 31 new features, 71 newly designed screens (website, Viewer, phone, overlays, dark checks), a motion spec for the website, data-format specs, and a pinned library list.

## How to start

1. Create an empty folder for the project and unzip this pack into it, so you have `specdiff-handover/` inside it.
2. Copy `specdiff-handover/CLAUDE.md` to the project root.
3. Open Claude Code in the project folder.
4. Send **Prompt 0 · Kick-off** from `PROMPTS.md`. Wait for its report, answer its questions, then continue phase by phase.

## Contents

| Path | What it is |
|---|---|
| `CLAUDE.md` | Standing instructions for Claude Code. Copy to the project root. |
| `PROMPTS.md` | Every prompt to send, in order: kick-off, P0–P5 with sub-steps, and reusable prompts for rules, screens, reviews and fixes. |
| `docs/01-product-brief.md` | What Specdiff is, who it's for, principles, positioning against the 2026 market, scope and non-goals. |
| `docs/02-features.md` | **Final feature list.** Every feature with an ID, phase and Core/Beta/Later label. |
| `docs/03-screens.md` | **Every screen** with its ID, purpose, features, and the design file and image to match. |
| `docs/04-architecture.md` | Monorepo layout, data flow, workers, performance budgets, security. |
| `docs/05-libraries.md` | **Every library**, what it is for, where it is used, and the pinning rule. |
| `docs/06-openapi-rules.md` | The breaking-change rule catalogue and how severity is decided. |
| `docs/07-data-formats.md` | Change model, `.specdiff.yaml`, `decisions.json`, share links, history, saved sources, report JSON. |
| `docs/08-build-plan.md` | Phases P0–P5 with feature IDs, screen IDs, "done when" checks, estimates and the launch checklist. |
| `docs/09-design-and-motion.md` | How to use the design system, port the prototypes, and implement the website motion. |
| `docs/10-decisions-and-open-questions.md` | Decisions already made, and the questions still open with suggested defaults. |
| `research/competitive-research.md` | November 2026 research on oasdiff, Bump.sh, Scalar, Redoc 3, Swagger UI, Optic, pb33f, Diffchecker, SemanticDiff, GraphQL Hive, Buf, Speakeasy and others, with sources. |
| `design/Specdiff-Design-System.pdf` | The design system (Direction A, Graphite & Chartreuse). |
| `design/tokens.css`, `design/tokens.json` | Design tokens: light, dark and high-contrast diff themes. |
| `design/motion.css` | The website's keyframes and the reduced-motion rule, ready to import. |
| `design/prototypes/app/` | 39 web app screens and overlays as HTML source (`*.dc.html`) plus `canvas.json`. |
| `design/prototypes/viewer/` | 24 Viewer and phone screens. |
| `design/prototypes/website/` | 15 website screens, including **Home v2** with motion. |
| `design/screens/{app,viewer,website}/*.jpg` | A rendered image of every prototype, for visual comparison. |
| `design/prototypes/README.md` | How to read the `.dc.html` files and which parts to ignore. |

## The three products in one sentence each

- **Website** (`specdiff.app`): marketing home with a live demo, docs, the rules reference and changelog. Astro, static.
- **Web app**: compare OpenAPI, JSON/YAML, Markdown, code and text in the browser; review breaking changes; export changelogs; share by link. React + Vite, Web Workers.
- **Viewer**: a version-aware API reference that replaces Swagger UI, shipped in the app and inside every package (embed, React, Express/Fastify, Spring Boot starter).

Nothing runs on a server. All parsing and diffing happen in the browser or the CLI. The website and app deploy as one static site on **Netlify**; there are no GitHub Actions.
