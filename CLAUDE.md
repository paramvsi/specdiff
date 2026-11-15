# CLAUDE.md · Specdiff

You are building **Specdiff** from scratch: a privacy-first, browser-only tool that diffs OpenAPI specs, JSON/YAML, Markdown, code and text; explains which changes break clients; suggests the version bump; lets reviewers accept or reject each change; generates changelogs; renders a version-aware API reference (the **Viewer**, a Swagger UI replacement); and ships as a website, a web app, a CLI and installable packages (npm and Maven Central). The website and app are hosted on **Netlify**.

The owner is **Paramveer Singh** (GitHub `paramvsi`). This is an open-source portfolio flagship: code quality, tests, docs and commit history are part of the product.

## Read first, in this order

1. This file.
2. `specdiff-handover/README.md`.
3. `specdiff-handover/docs/01` → `10`, in order.
4. `specdiff-handover/design/Specdiff-Design-System.pdf` and `docs/09-design-and-motion.md`.
5. `specdiff-handover/design/prototypes/README.md`, then open the images in `design/screens/` for the phase you are in.

Do not write code until the kick-off report (Prompt 0 in `PROMPTS.md`) has been answered.

## Non-negotiable rules

1. **Frontend only.** No backend services, databases, accounts, uploads or telemetry on content. Parsing and diffing run in Web Workers in the browser, or in Node for the CLI. Hosting is one static **Netlify** site (website at `/`, app at `/app`) plus package registries. **No GitHub Actions** of any kind: no workflows in the repo and no Action package.
2. **The design is approved. Match it.** Every screen in `docs/03-screens.md` has a prototype in `design/prototypes/` and an image in `design/screens/`. Port layout, spacing, type sizes, colours, copy and states exactly. Where the PDF and a prototype disagree, the PDF wins. Where `docs/02` and a prototype disagree on behaviour, `docs/02` wins.
3. **Tokens only.** Use `design/tokens.css` variables (`--sd-*`) in every component. No raw hex values in components. Geist and Geist Mono, self-hosted (OFL). Lucide icons. Ligatures off in code.
4. **Accessibility is a requirement, not a polish step.** WCAG 2.2 AA. Visible focus. Full keyboard use. Touch targets ≥ 44 px on phone layouts. Diff and severity are never shown by colour alone: always pair with `+ − ~ ↕` and `! ? + ¶`. Respect `prefers-reduced-motion`. axe must be clean on every screen.
5. **Every OpenAPI rule ships with fixtures.** `fixtures/rules/<rule-id>/before.yaml`, `after.yaml`, `expected.json`, plus a Vitest test. No rule without a passing fixture.
6. **Performance budgets** (`docs/04`): app initial JS ≤ 200 KB gzip without lazy chunks; Viewer embed ≤ 250 KB gzip; a 10 MB spec parses and diffs off the main thread and scrolling stays at 60 fps. Monaco or the diff renderer, tree-sitter, Markdown and the Viewer are lazy-loaded.
7. **Security.** Treat every input as untrusted. Sanitise rendered Markdown. Never `eval` or `new Function`. The CLI does not fetch remote `$ref` URLs in `--ci` mode unless `--allow-external-refs` is passed. Share-link passphrases never leave the browser.
8. **Deterministic output.** The same two inputs always give byte-identical reports (sort keys, stable IDs, stable fingerprints). Tests assert this.
9. **Dependencies.** Only the libraries in `docs/05-libraries.md`. Install the latest stable version that has been published for at least 14 days, pin it exactly (no `^` or `~`), and record it in `docs/LIBRARIES-LOCK.md` the first time you add it.
10. **Ask before you:** add a dependency not in `docs/05`, change the information architecture or a screen's layout, change a rule's default severity, publish any package, buy or configure a domain, connect or change the Netlify site, push to a remote, or open a PR.

## How to work

- Follow `docs/08-build-plan.md` phase by phase (P0 → P5). Within a phase, follow the step order in `PROMPTS.md`.
- Use feature IDs (`docs/02`) and screen IDs (`docs/03`) in commit messages, branch names and PR titles, e.g. `feat(OA-14): report shared-schema changes once`.
- Small conventional commits. One feature or rule per commit where possible. Commit messages end with the attribution lines the session tells you to use.
- Write tests with the code, not after it. Unit tests in Vitest; e2e and a11y in Playwright + @axe-core/playwright; visual comparison against `design/screens/` at 1440 px and 390 px, light and dark.
- Checks run in two places, since there is no CI service: `pnpm verify` locally (lint, typecheck, unit, build, size, e2e + axe + visual), wired to a pre-push git hook; and `pnpm verify:netlify` (lint, typecheck, unit, build, size) as the Netlify build command, so a failing check blocks the deploy.
- At the end of every phase run `pnpm verify`. Then report: **done** (with IDs), **deferred** (with reason), **unsure** (with the question).
- Open questions are in `docs/10`. Ask, don't guess. When the owner is not around, take the suggested default, write it down in `docs/10` under "Decided during build", and carry on.
- Keep `docs/` in the repo up to date when behaviour changes. The website's docs and rules reference are generated from the code and fixtures, so they never drift.

## Definition of done for any feature

- Matches its design in light and dark, at 1440 px and 390 px where the screen has a phone layout.
- Keyboard-operable with visible focus; screen-reader labels present; axe clean.
- Unit tests and, for UI, a Playwright test of the main path.
- Error, empty, loading and too-large states handled where they apply (`docs/03` lists them).
- No new dependency outside `docs/05`. Bundle budgets still pass.
- Documented in the docs site if it is user-visible.
