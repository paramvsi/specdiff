# Libraries lock

Pinning rule (docs/05): latest stable release public for at least 14 days, pinned exactly. Versions found with `node scripts/pick-versions.mjs <pkg>`. Cut-off date for this table: 2026-11-01.

| Package | Version | Added | Why |
|---|---|---|---|
| typescript | 6.0.3 | 2026-11-15 | Strict typing. **Not 7.0.2**: typescript-eslint 8.72 peers `<6.1.0` and @astrojs/check peers `^5 \|\| ^6` |
| turbo | 2.11.10 | 2026-11-15 | Task pipeline |
| eslint | 9.39.5 | 2026-11-15 | Lint. **Not 10.x**: eslint-plugin-jsx-a11y 6.10.2 peers eslint `<=9` |
| @eslint/js | 9.39.5 | 2026-11-15 | ESLint recommended config (owner OK'd at kick-off) |
| globals | 17.13.0 | 2026-11-15 | ESLint globals (owner OK'd at kick-off) |
| typescript-eslint | 8.72.1 | 2026-11-15 | TS lint |
| eslint-plugin-react-hooks | 7.1.1 | 2026-11-15 | Hooks lint |
| eslint-plugin-jsx-a11y | 6.10.2 | 2026-11-15 | Accessibility lint |
| prettier | 3.9.10 | 2026-11-15 | Formatting |
| @changesets/cli | 3.0.3 | 2026-11-15 | Package versioning |
| tsup | 9.0.0 | 2026-11-15 | Library builds |
| size-limit | 14.3.0 | 2026-11-15 | Budgets |
| @size-limit/file | 14.3.0 | 2026-11-15 | Gzip size only. Replaces `@size-limit/preset-app`, which downloads headless Chrome (owner OK'd at kick-off) |
| simple-git-hooks | 2.14.0 | 2026-11-15 | pre-push → `pnpm verify` |
| vitest | 5.0.5 | 2026-11-15 | Unit tests |
| @vitest/coverage-v8 | 5.0.5 | 2026-11-15 | Coverage |
| jsdom | 30.1.3 | 2026-11-15 | DOM tests |
| fake-indexeddb | 6.2.7 | 2026-11-15 | IndexedDB in tests (owner OK'd at kick-off) |
| @playwright/test | 1.64.1 | 2026-11-15 | E2E, visual |
| @axe-core/playwright | 4.14.0 | 2026-11-15 | Accessibility checks |
| @types/node | 26.6.6 | 2026-11-15 | Node types (owner OK'd at kick-off) |
| react, react-dom | 19.3.1 | 2026-11-15 | UI |
| @types/react, @types/react-dom | 19.3.0 | 2026-11-15 | React types (owner OK'd at kick-off) |
| vite | 8.3.5 | 2026-11-15 | App build |
| @vitejs/plugin-react | 6.1.2 | 2026-11-15 | React in Vite |
| @fontsource/geist-sans, @fontsource/geist-mono | 5.3.0 | 2026-11-15 | Self-hosted Geist (OFL). Re-declared as family `Geist` in `packages/ui/src/fonts.css` to match tokens |
| astro | 7.4.4 | 2026-11-15 | Website |
| @astrojs/check | 0.9.12 | 2026-11-15 | Website typecheck (owner OK'd at kick-off) |
| yaml | 2.9.1 | 2026-11-15 | Parsing with source positions |
| @scalar/openapi-parser | 0.29.19 | 2026-11-15 | D-3 candidate |
| @apidevtools/json-schema-ref-parser | 16.0.5 | 2026-11-15 | D-3 candidate |
| diff | 9.0.0 | 2026-11-15 | Line/word/char diffs |
| picomatch, @types/picomatch | 4.0.7, 4.0.3 | 2026-11-15 | Ignore globs |
| semver, @types/semver | 7.8.5, 7.8.0 | 2026-11-15 | Version check |
| zod | 4.6.7 | 2026-11-15 | Schemas |
| fast-check | 4.10.2 | 2026-11-15 | Property tests |
| fast-json-patch | 3.1.1 | 2026-11-15 | Patch round-trip check (tests). Last release 2022: that is the latest stable |
| fflate | 0.8.3 | 2026-11-15 | Share links, ZIP |
| zustand | 5.0.16 | 2026-11-15 | State |
| @radix-ui/* (12 primitives) | see packages/ui/package.json | 2026-11-15 | Accessible primitives |
| cmdk | 1.1.1 | 2026-11-15 | Command palette |
| lucide-react | 1.66.0 | 2026-11-15 | Icons |
| @tanstack/react-virtual | 3.14.24 | 2026-11-15 | Virtualised lists |
| comlink | 4.4.2 | 2026-11-15 | Worker RPC |
| idb-keyval | 6.3.0 | 2026-11-15 | IndexedDB |
| shiki | 4.5.0 | 2026-11-15 | Syntax highlighting (lazy) |
| @testing-library/react, @testing-library/user-event | 16.3.3, 14.6.8 | 2026-11-15 | Component tests |
| unified, remark-parse, remark-gfm, remark-rehype, rehype-sanitize, rehype-stringify | 11.0.5, 11.0.0, 4.0.1, 11.1.2, 6.0.0, 10.0.1 | 2026-11-15 | Markdown mode |
| github-slugger | 2.0.0 | 2026-11-15 | Heading anchors (MD-06) |
| @types/mdast, @types/hast | 4.0.4, 3.0.5 | 2026-11-15 | AST types (type-only, like the other @types) |
