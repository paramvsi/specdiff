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
