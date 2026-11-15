# Releasing to npm

Seven packages are published together at one version (`.changeset/config.json` → `fixed`): `@specdiff/core`, `@specdiff/ui`, `@specdiff/viewer`, `@specdiff/embed`, `@specdiff/react`, `@specdiff/express` and `specdiff-cli`. The apps and the website are private and never published. The Spring Boot starter goes to Maven Central separately.

Publishing is public and permanent: a version can be unpublished only within 72 hours, and a name plus version can never be reused.

## Once

1. Create an npm account and turn on two-factor authentication for **authorization and writes**.
2. Create the `specdiff` organisation on npmjs.com (free, public packages), so the `@specdiff` scope is yours.
3. Never put an npm token in the repo, Netlify or a script. Publish from your own terminal.

## Each release

1. Describe the change: `pnpm changeset`, pick the bump, write one sentence. Commit the file.
2. Bump versions and changelogs: `pnpm changeset version`. Commit.
3. Check the packages the way users will get them:
   ```sh
   pnpm build
   R=$(mktemp -d); mkdir $R/tgz $R/user
   for d in core ui viewer embed react express cli; do (cd packages/$d && pnpm pack --pack-destination $R/tgz); done
   cd $R/user && npm init -y && npm install $R/tgz/specdiff-core-*.tgz $R/tgz/specdiff-cli-*.tgz
   npx specdiff --version                              # the new version
   npx specdiff old.yaml new.yaml --ci                 # a report, exit 1 when breaking
   npx specdiff old.yaml new.yaml --no-open            # the local UI loads both files
   ```
4. Log in and publish: `npm login`, then `pnpm release` (checks who you are, runs lint, typecheck, unit tests, build and size budgets, then `changeset publish`, which uses `pnpm publish` so `workspace:*` becomes the real version).
5. Push the version commit and tags: `git push --follow-tags`.

## Notes

- No provenance badge: npm provenance needs a CI service, and this project uses none.
- The CLI bundles the built app for its local UI; `turbo.json` builds `@specdiff/app` before `specdiff-cli`, and the CLI build fails if the app is missing.
- `specdiff --version` is baked in from `packages/cli/package.json` at build time.
