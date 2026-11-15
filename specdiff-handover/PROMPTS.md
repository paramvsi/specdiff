# Prompts for Claude Code

Paste these in order. **Wait for each report before sending the next.** Each prompt ends with a report; answer its questions, then continue. Paths are relative to the project root, with the pack at `specdiff-handover/`.

Reusable prompts (R, S, V, F, B) are at the end. Use them whenever a phase step tells you to.

---

## 0 · Kick-off (no code)

```
Read CLAUDE.md, then specdiff-handover/README.md, every file in specdiff-handover/docs/ in
order (01 to 10), specdiff-handover/research/competitive-research.md, the design system PDF,
specdiff-handover/design/prototypes/README.md, and look at the images in
specdiff-handover/design/screens/ for each folder.

Then report, without writing code:
1. In 10 bullets: what we are building, the three products, and what makes Specdiff different.
2. The non-negotiable rules you must follow, in your own words.
3. The phases P0–P5 with their steps, and your estimate for each.
4. Anything unclear, missing or contradictory across docs, prototypes and the PDF.
5. The open questions in docs/10 you need answered for P0 and P1 (D-1 to D-4, D-10), with
   your recommendation for each.
6. The first 10 commits you plan for P0.
```

---

## P0 · Setup

### P0.1–P0.5 · Workspace, tooling, shells, tokens, CI

```
Start P0 from docs/08-build-plan.md.

1. Initialise git (do not add a remote). Create the pnpm workspace + Turborepo with exactly
   the layout in docs/04-architecture.md: packages/{core,ui,viewer,embed,react,cli,action,
   express,spring-boot-starter}, apps/{app,website}, fixtures/, examples/, docs/.
2. Copy specdiff-handover/docs into docs/ and create docs/LIBRARIES-LOCK.md.
3. Install only the libraries in docs/05-libraries.md that P0 needs (TypeScript, Vite, React,
   Astro, ESLint + plugins, Prettier, Vitest, Playwright + axe, size-limit, Changesets, tsup,
   turbo). Follow the pinning rule: latest stable ≥ 14 days old, exact versions, one row per
   package in LIBRARIES-LOCK.md.
4. TypeScript strict in a shared tsconfig (strict, noUncheckedIndexedAccess,
   exactOptionalPropertyTypes).
5. apps/app: Vite + React shell with a /_ds route (dev only). apps/website: Astro shell with
   one page. Both import design/tokens.css once and self-host Geist and Geist Mono.
   Copy design/motion.css into the website.
6. The /_ds page shows every token (colour swatches in light and dark, type scale, spacing,
   radius, shadows) with a theme toggle using [data-theme].
7. Scripts at the root: lint, typecheck, test, build, e2e, size, format, plus
   `verify` (all of them) and `verify:netlify` (lint, typecheck, test, build, size).
   size-limit budgets from docs/04. One Playwright test that opens /_ds in light and dark
   and runs axe. A pre-push hook (simple-git-hooks) runs `pnpm verify`.
8. There are NO GitHub Actions in this project: do not create .github/workflows.
   Add netlify.toml and scripts/assemble-site.mjs exactly as in docs/04 "Hosting and checks"
   (website at /, app at /app, SPA redirect, security headers). Run the assemble script
   locally and check dist/. Do not connect a Netlify site or deploy.

Run every script. Report: done / deferred / unsure, the pinned versions you chose, and
netlify.toml. Do not push.
```

---

## P1 · Foundations, OpenAPI and review

### P1.1 · Design system in code

```
Build @specdiff/ui from the design system PDF and both component sheets:
design/prototypes/app/AComponents.dc.html and AComponents2.dc.html (images in
design/screens/app/). Use CSS Modules and --sd-* tokens only; Radix primitives for
behaviour; lucide-react for icons.

Components: Button (primary, secondary, ghost, dark, danger, icon-only), SegmentedControl,
Tabs, SeverityBadge (full and compact), MethodChip, FileChip, ModeBadge, Card, StatCard,
CodeLine and CodePane (with gutter markers), Dialog, Drawer, Popover menu, Toast, Tooltip,
Switch, Checkbox, Radio card, Select, TextField, PassphraseField with strength meter,
DecisionButtons (accept/reject, pressed states), ReviewProgress, ViewerBadge
(New/Changed/Breaking/Deprecated), MaskedText, BetaLabel, Kbd, Skeleton, EmptyState,
ProgressBar, TopBar shell, ThreePane layout.

Show each one on /_ds with all variants and states, in light and dark. Add unit tests for
behaviour and a Playwright + axe test of /_ds. Compare /_ds with the component sheet images
section by section and list any difference you could not match.
```

### P1.2 · App shell and input

```
Implement P1.2 from docs/08: screens A-01 Compare (ACompare.dc.html and A01-DragOver),
A-02 Parsing (A02-Parsing), O-05 Load from URL, O-08 File too large, and the parse-error
and identical states from AComponents. Features IN-01 to IN-10, X-02, X-08.

- Worker with Comlink: detect mode, parse with source positions (yaml library), report
  progress per file and per step, support cancel.
- GitHub blob URL → raw URL; CORS failure explained as in O-05.
- Folder and ZIP input (fflate) for multi-file specs.
- Samples for every mode using the payments example in docs/03.
- Size guard: warn above 10 MB, text-only above 25 MB.

Match each design at 1440 and 390 px, light and dark. Playwright tests for paste, drop,
URL, sample, swap, cancel and each error state; axe on each. Report done / deferred / unsure.
```

### P1.3 · Text mode (with renderer spike D-2)

```
First, spike decision D-2 from docs/10: build A-03 (design/prototypes/app/A03-TextDiff.dc.html)
twice, once with Monaco's diff editor and once with @pierre/diffs + shiki, both lazy-loaded.
Measure initial and lazy bundle sizes, time to first diff on a 2 MB log, scroll smoothness,
and how closely each matches the design (gutter, colours, collapsed regions, overview ruler).
Report the numbers and your recommendation, then STOP and wait for my decision.
```

After the decision:

```
Implement text mode with the chosen renderer: TX-01 to TX-10. Split/unified, Smart/Word/Char
precision, ignore whitespace/case/line endings, collapse unchanged with expand controls,
next/previous change and overview ruler, wrap and go-to-line, regex filters that mask matches
on both sides as ‹name› with hit counts (stored in .specdiff.yaml text.filters), transforms,
live re-diff. Match A-03 and A-03 dark. Tests for each option and filter. Report.
```

### P1.4 · Core engine (with resolver spike D-3)

```
Spike decision D-3: load Petstore, the largest real-world spec you can add to fixtures/specs,
and a Swagger 2.0 spec with @scalar/openapi-parser and with @apidevtools/json-schema-ref-parser.
Compare correctness of $ref resolution (internal, external, circular), Swagger 2 → 3 upgrade,
speed and bundle size. Report and STOP for my decision.
```

After the decision:

```
Build the engine in @specdiff/core: OA-01, OA-02, OA-16, OA-18, X-13.
- Parse Swagger 2.0 and OpenAPI 3.0/3.1/3.2 (YAML/JSON) with positions; normalise to 3.1.
- Deref with cycle tracking (compare by reference identity; report once per cycle entry).
- Normaliser: unify the three nullability forms, merge path-level parameters, optional
  allOf flattening, case-insensitive headers, inline-vs-$ref matching, path-param-name option.
- The Change and Report types and Zod schemas from docs/07, fingerprints, deterministic
  sorting. Property tests (fast-check) proving identical output for identical input and
  stable fingerprints under reformatting and key reordering.
No UI in this step. Report coverage and any spec the engine cannot load.
```

### P1.5 · Rules (repeat in batches)

```
Implement the rules in docs/06-openapi-rules.md in batches of about 10, starting with
"Endpoints and operations" and "Parameters". For each batch use Prompt R.
After all batches: shared-schema dedup (OA-14), grouping by source block (OA-15), sunset
policy (OA-17), Wire/SDK presets (OA-19), the version check and bump suggestion (OA-08), and
the explanation and changelog-line templates (OA-07). If decision D-1 is yes, add
"modelRefs" to each expected.json and a CI report of OpenAPI Changes Model entries with no rule.
Report the rule count, fixture count and any rule whose severity you think is wrong.
```

### P1.6 · OpenAPI screens

```
Implement P1.6: A-04 Summary (app/Main.dc.html), A-05 Workspace (AWorkspace) and its review
mode (A05-Review), A-06 Raw diff (A06-RawDiff), O-04 Explain drawer, plus their dark versions
(A04-Summary-Dark, ADark, A05-Review-Dark). Features OA-09 to OA-13, OA-21, X-11.

- Change tree grouped by path, tag, schema or severity; filters; search including JSONPath;
  virtualised.
- Detail: split before/after with source lines; endpoints that use a shared schema.
- Review: accept/reject with note; decisions saved to .specdiff/decisions.json (download and
  import in the browser; the CLI reads the file later); progress; next-to-review; mark viewed.
- Raw diff with gutter markers linked both ways; deep links via URL hash.
Use Prompt S for each screen. Playwright: review a whole comparison with the keyboard only.
Report.
```

### P1.7 · Output

```
Implement P1.7: A-10 Changelog and export (AChangelog), share dialog with passphrase
(O-09), unlock screen (O-10), History (A11-History and A11-HistoryEmpty).
Features OUT-01 to OUT-03, OUT-05, OUT-06, OUT-07, OUT-09.
Share-link format exactly as docs/07 §5 (deflate + base64url; AES-GCM with PBKDF2 for locked
links). Unit tests: encode/decode round trip, wrong passphrase, tampered link, size warning.
History in IndexedDB with search, filters, pin, delete, clear all. Report.
```

### P1.8 · Settings and polish

```
Implement P1.8: A-12 Rules and settings (A12-Settings and dark), command palette (cmdk, from
AComponents), O-03 Keyboard shortcuts (exact keys in the design), O-13 toasts.
Features SET-01 to SET-07, X-04, X-05, X-06. .specdiff.yaml import/export validated with Zod.
Then run Prompt B (end-of-phase) for P1.
```

---

## P2 · JSON/YAML, Markdown and text extras

```
Start P2 from docs/08.
P2.1 JSON/YAML: engine and A-07 (AJson, A07-JsonTree, A07-JsonExport). JS-01 to JS-08,
JS-10, JS-11. Auto-detect the array match key (id, uuid, key; must be unique in every item).
Exports: JSON Patch (verify with fast-json-patch that applying it to the left gives the
right), Merge Patch, JSONPath list, Markdown.
P2.2 Markdown: unified/remark/rehype with GFM and sanitisation; A-08 (AMarkdown,
A08-MdSideBySide). MD-01 to MD-07, including the broken-anchor check.
P2.3 Text extras: moved-block detection (A03-MovedBlock) and pasted patch input (A03-Patch).
TX-11, TX-12.
P2.4 Deep links to any change in every mode (X-12).
Fixtures for key order, array matching, moves, null vs missing, duplicate keys, number
tolerance, GFM tables, task lists, callouts, code blocks, renamed headings.
Use Prompt S for each screen, then Prompt B for P2.
```

---

## P3 · Code (Beta), Viewer and consumer features

### P3.1 · Code mode

```
Implement code mode (Beta): A09-Code and A09-Fallback. CD-01 to CD-06. web-tree-sitter with
TypeScript, JavaScript, Java and Python grammars, each lazy-loaded. Formatting-only changes
collapse to "no logic change"; renames and moves labelled; meaning-preserving edits hidden
with toggles; any other language or parse failure falls back to text with the notice.
Beta label visible. Report bundle sizes per grammar.
```

### P3.2–P3.4 · Viewer

```
Build @specdiff/viewer and its route in the app, matching design/prototypes/viewer/.
P3.2 Core: Main (overview), V01-Overview-Dark, V01-Overview-Error, V02-Endpoint (+ dark),
V02-Deprecated, V03-Schema, V05-Search. VW-01 to VW-04, VW-12, VW-14. A route per operation
and schema; render only what is near the viewport; brand colour and logo options.
P3.3 Try it: V02-TryIt, V02-TryIt-Response, V02-TryIt-Cors, V02-Auth, V02-CodeSamples.
VW-05, VW-06, VW-13. Tokens in memory unless "Remember in this browser" is ticked. Validate
the response against the schema. Optional user-supplied CORS proxy; we host none.
P3.4 Versions: V05-VersionPicker, V04-Timeline, V04-MyEndpoints, V02-History,
V02-TryIt-Warning. VW-07 to VW-11. Version set format in docs/07 §8.
Test with Petstore, a large real-world spec and a Swagger 2.0 spec. Use Prompt S per screen,
check the 250 KB embed budget, then report.
```

### P3.5 · Consumer features in the app

```
Implement OA-22 "changes that affect me" (A05-ConsumerFilter) with HAR matching as in
docs/07 §7, and OA-20 SDK-impact view (A05-SdkImpact, Beta) with TypeScript, Python, Java
and Go naming from operationId, tags and schema names. Then Prompt B for P3.
```

---

## P4 · Packages

```
Start P4 from docs/08. Do not publish anything.
P4.1 CLI `specdiff`: `npx specdiff a b` serves the built app locally and opens it with both
files loaded; `--ci` prints the report and works in any CI system (document GitLab CI,
Jenkins and plain shell examples in the README; no GitHub Actions); `--format md|json|html`;
`--fail-on breaking|possibly|missing-version-bump|none`; git `rev:path` inputs (pass
--end-of-options to git; refuse revisions starting with "-"); no remote $ref fetching in
--ci unless --allow-external-refs; `history <file> --out versions.json`; reads
.specdiff.yaml and .specdiff/decisions.json (accepted breaking changes do not fail).
P4.2 git diff driver (`specdiff git-diff-driver`) and a pre-commit hook config (the snippet
on the Home v2 "Pre-commit" tab).
P4.3 @specdiff/embed (Specdiff.mount) and @specdiff/react.
P4.4 @specdiff/express with a fastify export (peer deps), serving the Viewer at /docs.
P4.5 Spring Boot starter (Java 21, Spring Boot 3.x): auto-configuration serving the built
Viewer at /specdiff, reading /v3/api-docs; sample app in examples/; the embedded look matches
V06-Embedded.
P4.6 RSS/Atom changelog export (OUT-10) and report JSON Schema (OUT-11).
Each package: README, example, e2e test. Then Prompt B for P4 and ask me before any publish.
```

---

## P5 · Website, phone, polish and launch

### P5.1 · Home v2

```
Build the website home page in apps/website to match
design/prototypes/website/W01v2-Home.dc.html, W01v2-Home-Dark and W01v2-Home-390, using
docs/09-design-and-motion.md and design/motion.css. Static Astro page with React islands only
for: the demo tabs, the before/after slider (a real range input), the package tabs. FAQ
uses <details>. All motion is CSS; pause loops off-screen; everything off under reduced
motion with the final states visible. Website JS ≤ 60 KB gzip.
Use the compact phone nav from W01v2-Home-390. Use Prompt S at 1440 and 390, light and dark.
```

### P5.2–P5.6

```
P5.2 Docs (W02-Docs), guides, Rules reference list and detail (W03-Rules, W04-RuleDetail)
generated at build time from @specdiff/core rules and fixtures, Changelog page with RSS
(W06-Changelog), 404 (W08-404), each with its phone layout. Use the v2 floating nav and
footer on every page. WEB-02 to WEB-08.
P5.3 Phone read-only layouts in the app and Viewer: M01-SharedLink, M02-Summary, M03-Change,
M04-ViewerEndpoint, M05-ViewerOverview. X-07.
P5.4 Saved sources (A13-SavedSources, IN-11), Copy for LLM menu (O11-CopyLLM, OUT-12),
print-friendly report (OUT-08), PWA (PK-08).
P5.5 SEO (titles, descriptions, sitemap, canonical, Open Graph images), Lighthouse 95+ on
website and app, all budgets.
P5.6 Netlify: confirm netlify.toml and the assembled dist/ (website at /, app at /app, SPA
redirect, headers, 404). Then STOP and ask me to connect the repo to Netlify; once I have,
check the deploy preview at 1440 and 390 and fix anything that differs from local.
P5.7 Run the launch checklist in docs/08. Report everything failing. Draft the README with a
demo GIF and the launch posts. Ask me before publishing packages, buying a domain or pushing.
```

---

## Reusable prompts

### R · Rule batch

```
Add rules <IDs> from docs/06-openapi-rules.md. For each rule:
1. fixtures/rules/<id>/before.yaml and after.yaml: the smallest valid specs that show it,
   plus a second pair for the opposite direction or an edge case where relevant.
2. expected.json: the exact changes, severity, direction and (if D-1) modelRefs.
3. The rule as a pure function, its explanation template (who / what they see / how to avoid)
   and its changelog line.
4. A Vitest test that runs the fixture.
Apply the severity law in docs/06; if a rule's listed severity contradicts it, tell me
instead of changing it. Show the test output.
```

### S · Build or check a screen against its design

```
Build/check <screen ID> to match design/prototypes/<folder>/<file>.dc.html and
design/screens/<folder>/<file>.jpg. Compare section by section: layout, spacing, type sizes,
colours (tokens only), copy, icons, states, focus order. Check light and dark, 1440 and
390 px if it has a phone layout. Add or update a Playwright visual test and an axe test.
List every remaining difference and why.
```

### V · Visual review sweep

```
Open every implemented screen in the app, Viewer and website at 1440 and 390, light and
dark, and compare with design/screens/. Produce a table: screen, difference, severity
(layout / colour / copy / minor), fix plan. Then fix them in order of severity.
```

### F · Fix a bug

```
Bug: <what happens, where, steps>. First write a failing test that reproduces it, then fix
it, then show the test passing and the full suite still green. Commit as fix(<ID>): ...
```

### B · End of phase

```
End of <phase>. Run `pnpm verify` (lint, typecheck, test, build, size, e2e with axe and
visual) and `pnpm verify:netlify`. Run Prompt V for the
screens in this phase. Update docs/ for anything that changed, and docs/10 "Decided during
build". Report: done (IDs), deferred (IDs and why), unsure (questions). Do not push.
```
