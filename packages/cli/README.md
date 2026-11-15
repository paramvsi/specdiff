# specdiff-cli

See what changed between two versions of an OpenAPI spec: which changes break clients, why, and the version you should ship. Runs on your machine; nothing is uploaded.

```sh
npx specdiff-cli old.yaml new.yaml            # opens the Specdiff app locally with both files loaded
npx specdiff-cli main:openapi.yaml openapi.yaml --ci   # prints the report, exits 1 on breaking changes
```

Installed (`npm i -D specdiff-cli`), the command is `specdiff`.

## Options

| Option | |
|---|---|
| `--ci` | Print the report and exit with the gate's code |
| `--format md\|json\|html` | Report format (default `md`). JSON follows the published report schema |
| `--fail-on breaking\|possibly\|missing-version-bump\|none` | When to exit 1 (default from `.specdiff.yaml`, else `breaking`) |
| `--config <file>` | `.specdiff.yaml` to use (default: `./.specdiff.yaml`, then the repo root) |
| `--allow-external-refs` | Fetch remote `$ref` URLs. Off by default in `--ci` |
| `--out <file>` | Write the report to a file |

Inputs are file paths or git `rev:path` (`main:openapi.yaml`, `v1.5.0:api/openapi.yaml`). Revisions that start with `-` are refused.

Exit codes: `0` passed, `1` the gate failed, `2` usage or input error.

External `$ref`s (`$ref: './schemas/card.yaml#/Card'`) are resolved from the spec's folder and its subfolders, wherever you run the command from. A `$ref` that cannot be resolved is compared as written and listed under **Warnings** in the report (and on stderr), because changes behind it are not seen. With no changes at all, the suggested version is the current one (`no change`).

## Changelogs and feeds

```sh
specdiff changelog v1.yaml v2.yaml                          # release notes (Markdown)
specdiff changelog main:openapi.yaml openapi.yaml --format keep-a-changelog --date 2026-11-15
specdiff changelog v1.yaml v2.yaml --format atom \
  --feed-url https://api.example.org/changelog.xml --title "Payments API" --out public/changelog.xml
```

| Option | |
|---|---|
| `--format md\|atom\|keep-a-changelog\|slack\|pr-comment` | `md` (default) is release notes; `atom` is an Atom feed for a static site |
| `--feed-url <url>` | Required with `atom`: where the feed is published (its id and `rel="self"` link) |
| `--site-url <url>` | With `atom`: the site the feed links to |
| `--title <title>` | Feed title (default `API changelog`), or the heading for `md` and `slack` |
| `--release <version>` | Version in the heading (default: the suggested version) |
| `--date <date>` | ISO date: the Keep a Changelog heading date, and the Atom `updated` time (default now) |
| `--out <file>` | Write to a file instead of stdout |

## Review decisions

Accept or reject changes in the app, save `.specdiff/decisions.json` in your repo, and the CLI respects them: an accepted breaking change no longer fails the check; a rejected one always does. Decisions whose change no longer exists are reported as stale and ignored.

## Use it in any CI

GitLab CI:

```yaml
api-check:
  image: node:26
  script:
    - git fetch origin main
    - npx specdiff-cli origin/main:openapi.yaml openapi.yaml --ci
```

Jenkins (declarative):

```groovy
stage('API check') {
  steps { sh 'npx specdiff-cli origin/main:openapi.yaml openapi.yaml --ci --format html --out specdiff.html' }
  post { always { archiveArtifacts artifacts: 'specdiff.html' } }
}
```

Plain shell:

```sh
npx specdiff-cli "$(git merge-base HEAD origin/main):openapi.yaml" openapi.yaml --ci || exit 1
```

## Pre-commit hook

With [pre-commit](https://pre-commit.com), add to `.pre-commit-config.yaml`:

```yaml
repos:
  - repo: local
    hooks:
      - id: specdiff
        name: specdiff
        entry: npx specdiff-cli --ci --fail-on breaking
        language: system
        files: openapi\.yaml$
```

Given one file, the CLI compares `HEAD:<file>` with your working copy. A new file passes.

This repository is also a pre-commit hook repo (`.pre-commit-hooks.yaml`, hook id `specdiff`, `language: node`). Once `specdiff-cli` is published:

```yaml
repos:
  - repo: https://github.com/paramvsi/specdiff
    rev: v0.1.0
    hooks:
      - id: specdiff
```

It runs `specdiff --ci --fail-on breaking <file>` on staged files whose names match `(openapi|swagger).*\.(ya?ml|json)$`. Keep one matching spec per commit: pre-commit passes every matching file in one call, and two file names are read as `<before> <after>`.

## git diff driver

```sh
git config diff.specdiff.command "specdiff git-diff-driver"
echo "openapi.yaml diff=specdiff" >> .gitattributes
git diff openapi.yaml                 # uses the driver by default
git log -p --ext-diff openapi.yaml    # git log needs --ext-diff to use it
```

## Version history for the Viewer

```sh
specdiff history openapi.yaml --out versions.json
```

Builds a version set from your git tags (or recent commits) for the Viewer's timeline.
