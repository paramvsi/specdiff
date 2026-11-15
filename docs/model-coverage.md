# OpenAPI Changes Model coverage

Decision D-1 (`docs/06-openapi-rules.md`): each Specdiff OpenAPI rule lists the change ids of oasdiff's **OpenAPI Changes Model** (Apache-2.0) that it covers, in `modelRefs` in `fixtures/rules/<rule-id>/expected.json` (and `expected.2.json` where present). Only ids are stored in this repo; the model itself is downloaded to the git-ignored `node_modules/.cache/specdiff/` by `pnpm model:coverage`.

## Numbers

Model 0.1.0-draft, generated from oasdiff v1.38.0: 784 named changes.

| | Before mapping | After mapping |
|---|---|---|
| Covered by a Specdiff rule | 13 (1.7%) | 329 (42.0%) |
| Not covered | 771 | 455 |
| Not covered, by level | info 399, error 350, warning 22 | info 332, error 115, warning 8 |
| Not covered, by area | schema 605, parameters 75, security 24, paths 20, responses 18, headers 12, requestBody 12, components 2, tags 2, info 1 | schema 386, parameters 15, responses 12, security 11, paths 10, requestBody 10, headers 8, components 2, info 1 |

Rules with at least one mapping: 61 of 76.

## How a mapping was decided

A model change is listed under a rule only when all of these hold:

1. The change's claims (location and action) cover an edit the rule's code actually detects (`packages/core/src/rules/operations.ts`, `schema.ts`).
2. Same direction and side of the wire. The model files endpoint, lifecycle and security changes under direction `none`; Specdiff files them as `both` (endpoints, sunset) or `request` (security). These were treated as compatible because the edit is the same; a model `request` change is never mapped to a `response` rule or the reverse.
3. The rule's fixture shows the edit, or the code plainly handles it.

Notes on the coarse rules:

- Specdiff's `request-property-*` and `response-*` schema rules run on every schema on that side, including the root body schema and properties nested inside a parameter's object schema. So they cover the model's `request-body-*` / `response-body-*` (root) and `request-parameter-property-*` / `request-header-property-*` (nested) variants as well as `*-property-*`.
- Changes with a `read-only` or `write-only` guard are mapped where the Specdiff rule still fires and downgrades the finding to docs-only.
- Removals with a `sanctioned` guard (deprecated, sunset passed) are **not** mapped: Specdiff does not report them. Removals before the sunset date are mapped, because Specdiff reports them.
- Not mapped on purpose, because Specdiff does not tell them apart from the stricter case: `*-pattern-generalized`, `*-all-of-added-annotation-only`, `*-type-compatible`, `api-security-added`, `api-global-security-added`, `api-operation-id-added`.

## Rules → mapped model changes

| Rule | Model changes |
|---|---|
| `callback-changed` | 0 |
| `description-changed` | 0 |
| `endpoint-added` | 1 |
| `endpoint-deprecated` | 2 |
| `endpoint-removed` | 2 |
| `endpoint-removed-after-deprecation` | 2 |
| `enum-name-changed` | 0 |
| `example-changed` | 0 |
| `extension-changed` | 0 |
| `inline-ref-equivalent` | 0 |
| `operation-id-changed` | 1 |
| `path-param-renamed` | 0 |
| `request-allof-branch-added` | 2 |
| `request-body-became-required` | 2 |
| `request-body-content-type-removed` | 1 |
| `request-param-added-optional` | 2 |
| `request-param-added-required` | 2 |
| `request-param-became-optional` | 1 |
| `request-param-became-required` | 1 |
| `request-param-constraint-relaxed` | 27 |
| `request-param-constraint-tightened` | 27 |
| `request-param-default-changed` | 3 |
| `request-param-enum-value-added` | 1 |
| `request-param-enum-value-removed` | 1 |
| `request-param-location-changed` | 0 |
| `request-param-nullable-removed` | 1 |
| `request-param-pattern-changed` | 1 |
| `request-param-removed` | 2 |
| `request-param-type-changed` | 2 |
| `request-param-type-widened` | 3 |
| `request-property-added-optional` | 1 |
| `request-property-added-required` | 3 |
| `request-property-became-required` | 3 |
| `request-property-constraint-tightened` | 68 |
| `request-property-enum-value-removed` | 6 |
| `request-property-nullable-removed` | 3 |
| `request-property-read-only-added` | 2 |
| `request-property-removed` | 2 |
| `request-property-type-changed` | 7 |
| `request-schema-became-false` | 4 |
| `request-union-branch-removed` | 4 |
| `response-body-schema-removed` | 3 |
| `response-constraint-removed` | 57 |
| `response-content-type-removed` | 1 |
| `response-header-removed` | 2 |
| `response-header-schema-changed` | 2 |
| `response-item-schema-changed` | 0 |
| `response-optional-property-removed` | 2 |
| `response-property-added` | 4 |
| `response-property-became-optional` | 2 |
| `response-property-enum-value-added` | 5 |
| `response-property-nullable-added` | 2 |
| `response-property-removed` | 3 |
| `response-property-type-changed` | 6 |
| `response-property-type-narrowed` | 6 |
| `response-required-became-write-only` | 1 |
| `response-status-added` | 2 |
| `response-success-status-removed` | 1 |
| `response-tuple-changed` | 4 |
| `response-union-branch-added` | 4 |
| `schema-renamed` | 0 |
| `security-added-to-open-operation` | 1 |
| `security-flow-url-changed` | 3 |
| `security-requirement-removed` | 2 |
| `security-scheme-added-to-operation` | 0 |
| `security-scheme-transport-changed` | 5 |
| `security-scope-added` | 2 |
| `server-url-changed` | 0 |
| `summary-changed` | 0 |
| `sunset-date-moved-earlier` | 4 |
| `sunset-date-removed` | 4 |
| `sunset-inside-grace-period` | 8 |
| `tag-changed` | 2 |
| `version-bump-missing` | 0 |
| `webhook-payload-property-removed` | 0 |
| `webhook-removed` | 1 |

Rules with no mapping, and why:

- `description-changed`, `summary-changed`, `example-changed`, `extension-changed`: the model treats these edits as non-contract and names no change for them (its stability and sunset `x-*` changes are lifecycle rules, not generic extension diffs).
- `path-param-renamed`, `request-param-location-changed`, `schema-renamed`, `enum-name-changed`, `inline-ref-equivalent`: the model has no rename, move or `$ref`-equivalence changes.
- `server-url-changed`, `version-bump-missing`, `webhook-payload-property-removed`: the model does not compare servers, version bumps or webhook payload schemas (only `api-version-changed`, an info change about any version edit).
- `security-scheme-added-to-operation`: the model has no change for adding a scheme inside an existing requirement (AND).
- `callback-changed`, `response-item-schema-changed`: umbrella rules; their fixtures are reported under other rules (for example `response-property-removed`), so they map nothing themselves.

## Uncovered error-level changes: candidates for new rules

115 model changes at `level: error` have no Specdiff rule. The 25 below are the most likely to show up in real specs. Descriptions are our own summaries.

| # | Model change id | Direction | What it is about |
|---|---|---|---|
| 1 | `request-body-removed` | request | The operation no longer declares a request body at all. |
| 2 | `request-body-media-type-schema-added` | request | A request media type that had no schema now has one, so arbitrary bodies are no longer accepted. |
| 3 | `response-body-schema-became-false` | response | A response schema became `false`, so no response body can be valid. |
| 4 | `response-header-became-optional` | response | A response header that was required may now be missing. |
| 5 | `response-header-became-nullable` | response | A response header schema now allows null. |
| 6 | `response-media-type-parameter-changed` | response | A media type parameter (for example `charset`) of a response changed. |
| 7 | `response-media-type-name-generalized` | response | A response media type was replaced by a broader one (for example a wildcard). |
| 8 | `request-required-property-became-not-read-only` | request | A required property is no longer `readOnly`, so clients must now send it. |
| 9 | `request-property-x-extensible-enum-value-removed` | request | A value was removed from an `x-extensible-enum` list on a request property. |
| 10 | `request-parameter-x-extensible-enum-value-removed` | request | Same as above, on a parameter schema. |
| 11 | `response-property-all-of-removed` | response | An `allOf` branch was removed from a response property, so its guarantees are gone. |
| 12 | `response-body-all-of-removed` | response | Same as above, on the root response schema. |
| 13 | `request-property-dependent-required-added` | request | A `dependentRequired` entry was added: sending one property now requires others. |
| 14 | `request-property-unevaluated-properties-added` | request | `unevaluatedProperties` was set on a request schema, closing it to extra properties. |
| 15 | `request-property-pattern-property-added` | request | A `patternProperties` entry was added, constraining matching request properties. |
| 16 | `request-body-wrapped-in-one-of` | request | The request schema was moved inside a new `oneOf`. |
| 17 | `response-body-wrapped-in-one-of` | response | The response schema was moved inside a new `oneOf`. |
| 18 | `response-property-multiple-of-changed` | response | A response `multipleOf` changed to a value that neither divides nor is divided by the old one. |
| 19 | `response-header-max-increased` | response | A response header's `maximum` was raised (one of 26 header-constraint changes; header schemas are only type-checked today). |
| 20 | `response-header-max-length-increased` | response | A response header's `maxLength` was raised. |
| 21 | `request-property-content-media-type-changed` | request | `contentMediaType` of an encoded string in the request changed. |
| 22 | `response-property-content-encoding-changed` | response | `contentEncoding` (for example base64) of a response string changed. |
| 23 | `api-deprecated-sunset-missing` | none | An operation was deprecated without a sunset date. |
| 24 | `request-property-deprecated-sunset-missing` | request | A request property was deprecated without a sunset date. |
| 25 | `api-stability-decreased` | none | An operation's declared stability level was lowered. |

Regenerate the numbers with `pnpm model:coverage` (add `--list` for every uncovered change).
