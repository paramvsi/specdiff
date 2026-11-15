# CLI example

From the repository root, after `pnpm build`:

```sh
node packages/cli/dist/cli.js fixtures/samples/payments-v1.yaml fixtures/samples/payments-v2.yaml --ci
```

It prints the report and exits 1, because the sample has 4 breaking changes. See `packages/cli/README.md` for CI, pre-commit and git diff driver setup.
