# Launch posts (drafts — the owner publishes)

Placeholders: `[site]` (domain, D-5), `[repo]` (https://github.com/paramvsi/specdiff once pushed), `[gif]`.

## GitHub release — v1.0.0

**Specdiff 1.0: see what changed in your API, and who it breaks**

Specdiff compares two versions of an OpenAPI spec (Swagger 2.0 to 3.2) and tells you which changes break clients, who they break, what those clients will see, and how to avoid it. It suggests the version number, lets your team accept or reject each change, and writes the changelog. Everything runs in the browser or on your machine; nothing is uploaded.

- 76 rules, each with before/after fixtures; shared-schema changes reported once.
- Review decisions in `.specdiff/decisions.json`, respected by `npx specdiff-cli --ci` in any CI and by a pre-commit hook.
- A version-aware API reference (the Viewer) to replace Swagger UI: timeline, badges, per-endpoint history, "what changed for me" from a HAR file.
- Also diffs JSON/YAML (with JSON Patch export), Markdown, code (Beta) and text with regex filters.
- Packages: CLI, embed script, React, Express/Fastify, Spring Boot starter.

MIT licensed.

## Show HN

**Show HN: Specdiff – OpenAPI diff that explains who each breaking change breaks**

I kept seeing API changes ship with a green diff tool and a broken mobile client a week later. Specdiff runs in the browser (nothing uploaded) and, for every change, says who it breaks, what they'll see, and how to avoid it. You can accept or reject changes and commit the decisions; `npx specdiff-cli --ci` respects them in any CI. It also has a Swagger UI replacement that knows about versions. Feedback on the rule severities is very welcome — they follow a written severity law in the repo. [site] · [repo]

## LinkedIn

API changes break clients quietly. I built Specdiff to make them loud and explained: compare two OpenAPI files in your browser, see which changes break whom and how to avoid it, review them as a team, and ship a changelog. Open source, nothing uploaded. [site]

## r/webdev

Title: I made a free, in-browser OpenAPI diff that explains breaking changes (and a version-aware Swagger UI replacement)

Body: Drop two spec files (or paste, or a GitHub link). You get severity per change, an explanation, the suggested version bump, a changelog, and share links that carry the files in the URL hash (optionally passphrase-locked). There's a CLI for CI and a pre-commit hook. Code is MIT. [site] [gif]

## dev.to

Title: Reviewing API changes like code: accept, reject, commit the decision

Outline: the severity law (requests may accept more, responses may promise more) → three real examples from the payments sample (removed endpoint, newly required field, removed shared-schema property) → decisions.json and the CLI gate → the Viewer's "what changed for me".
