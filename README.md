# specdiff

**See what changed between two versions of an API spec, which changes break clients, and how to avoid it.** Everything runs in your browser; nothing is uploaded.

- **Explain, don't just flag.** Every breaking change says who it breaks, what they'll see, and how to avoid it. 76 rules, each with fixtures.
- **Review for free, in your repo.** Accept or reject each change; decisions live in `.specdiff/decisions.json`, and the CLI and pre-commit hook respect them.
- **A version-aware API reference.** The Viewer replaces Swagger UI and shows what changed between versions: timeline, badges, per-endpoint history, "what changed for me".
- **Not just OpenAPI.** JSON/YAML, Markdown, code (Beta) and text diffs with filters, moves and patches.

<!-- Demo GIF: record with `pnpm exec playwright test e2e/openapi.spec.ts --headed` and add docs/demo.gif before launch. -->

## Try it

- Web app: `/app` on the Specdiff site (open a sample, or drop two files).
- CLI: `npx specdiff-cli old.yaml new.yaml` (opens the app locally) or `npx specdiff-cli main:openapi.yaml openapi.yaml --ci` (prints the report, exits 1 on breaking changes). See [packages/cli](packages/cli/README.md).

## Packages

| Package | |
|---|---|
| [`specdiff-cli`](packages/cli) | CLI: `--ci` for any CI system, git `rev:path`, `history`, git diff driver, pre-commit |
| [`@specdiff/core`](packages/core) | Parsing, diff engines, OpenAPI rules, reports. No DOM; runs in workers and Node |
| [`@specdiff/embed`](packages/embed) | `Specdiff.mount(el, { url, compareWith })` — the Viewer in one script tag |
| [`@specdiff/react`](packages/react) | `<SpecdiffViewer />` and `<SpecdiffDiff />` |
| [`@specdiff/express`](packages/express) | Express and Fastify middleware serving the Viewer at `/docs` |
| [`specdiff-spring-boot-starter`](packages/spring-boot-starter) | Serves the Viewer at `/specdiff` from your app's `/v3/api-docs` |

## Develop

Node 26 (Active LTS), pnpm 10, Java 21 and Maven for the starter.

```sh
pnpm install
pnpm --filter @specdiff/app dev        # app at http://localhost:5173/app/
pnpm --filter @specdiff/website dev    # website
pnpm verify                            # lint, typecheck, unit, build, size, e2e + axe (also runs on git push)
```

There is no CI service: `pnpm verify` runs locally and on pre-push, and `pnpm verify:netlify` runs as the Netlify build command. The handover pack that specified this project is in [`specdiff-handover/`](specdiff-handover/README.md); decisions taken during the build are in [`docs/10`](docs/10-decisions-and-open-questions.md).

## Licence

MIT
