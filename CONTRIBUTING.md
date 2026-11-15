# Contributing

Thanks for helping. A few rules keep Specdiff trustworthy:

1. **Nothing leaves the browser.** No uploads, telemetry on content, or server calls. The CLI only fetches remote `$ref`s with `--allow-external-refs`.
2. **Every OpenAPI rule ships with fixtures**: `fixtures/rules/<rule-id>/before.yaml`, `after.yaml`, `expected.json`. The table-driven test runs them all. Severity follows the severity law in `docs/06-openapi-rules.md`.
3. **Deterministic output.** The same inputs give byte-identical reports.
4. **Accessibility is part of done.** Every screen is axe clean in light and dark; diff and severity are never colour alone.
5. **Tokens only.** Components use `var(--sd-*)` from `packages/ui/src/tokens.css`.

Run `pnpm verify` before you push (the pre-push hook does it too). Use feature IDs from `docs/02-features.md` in commit messages, e.g. `feat(OA-14): report shared-schema changes once`.

## Good first issues

- Add rules for the safe changes the catalogue doesn't name yet: request type widened, request enum value added, response enum value removed, a new content type.
- Code mode: add a grammar (Go, Kotlin or C#; decision D-11) and its declaration list in `packages/core/src/code/diff.ts`.
- Map rule fixtures to the oasdiff OpenAPI Changes Model (`modelRefs` in `expected.json`).
- Statement-level renames in code mode (the A-09 design shows `amount → amt`).
