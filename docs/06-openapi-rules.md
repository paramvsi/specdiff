# 06 · OpenAPI rule catalogue

Severity: **B** breaking · **P** possibly breaking · **S** safe · **D** docs only. Presets: **W** = same severity in both presets; **K → B** = raised to breaking under the SDK preset (Wire keeps the listed severity). The A-12 design shows 58 rules; this catalogue is the source of truth (docs/10 B-2).

Every rule needs: ID, default severity, direction (request/response/both), preset, explanation template (who it breaks, what they will see), fix template, and fixtures in `fixtures/rules/<id>/` (`before.yaml`, `after.yaml`, `expected.json`). The website's rules reference (WEB-04) is generated from these.

## How severity is decided (the severity law)

Apply this, and write each rule's severity from it, not from intuition:

1. A change is **breaking** when a request that was valid before can now be rejected, or a response can now carry something clients were never written to handle.
2. It is **safe** when neither can happen.
3. It is **possibly breaking** when the spec alone cannot decide (for example a new enum value in a response, which strict clients reject and lenient ones ignore).
4. **Direction matters.** Requests may accept more but not less; responses may promise more but not less. Adding `null` to a request field's type is safe; adding it to a response field is possibly breaking.
5. `readOnly` properties never appear in requests and `writeOnly` never in responses, so changes to them on that side are D.
6. A removal of something marked `deprecated` follows its `x-sunset` date: before the date it is B, after the date it is not reported, with no date it is P.
   `x-sunset` is read as an ISO date or date-time (no zone means UTC) or as an HTTP date (`Tue, 01 Dec 2026 00:00:00 GMT`, as in the Sunset header). Other forms, such as `12/1/2026`, are ambiguous and count as no date.

## Decision D-1: OpenAPI Changes Model

oasdiff publishes the **OpenAPI Changes Model** (Apache-2.0): 681 named changes with direction, effect, guards and derived severity, plus all 15,255 possible edits (github.com/oasdiff/openapi-changes-model). Default plan: use it as the coverage checklist and test oracle. Map each Specdiff rule to the model's change names in `fixtures/rules/<id>/expected.json` (`"modelRefs": [...]`), and add a local coverage report (`pnpm model:coverage`) of model changes with no Specdiff rule. Confirm with the owner before copying the model file into the repo (licence notice needed).

## Endpoints and operations

| ID | Change | Sev | Preset |
|---|---|---|---|
| endpoint-removed | Path + method removed without deprecation | B | W |
| endpoint-removed-after-deprecation | Removed after deprecation (follows sunset rule 6) | P | W |
| endpoint-added | New path or method | S | W |
| endpoint-deprecated | `deprecated: true` added | S | W |
| operation-id-changed | `operationId` changed (generated SDK method renamed) | P | K → B |
| path-param-renamed | `{id}` → `{userId}` only | S | W |
| tag-changed | Tags added, removed or reordered | D | W |

## Parameters

| ID | Change | Sev | Preset |
|---|---|---|---|
| request-param-removed | Parameter removed | P | W |
| request-param-added-required | New required parameter | B | W |
| request-param-added-optional | New optional parameter | S | W |
| request-param-became-required | Optional → required | B | W |
| request-param-became-optional | Required → optional | S | W |
| request-param-type-changed | Type changed (narrowed) | B | W |
| request-param-type-widened | Type widened (e.g. integer → number) | S | W |
| request-param-location-changed | e.g. query → header | B | W |
| request-param-enum-value-removed | Allowed value removed | B | W |
| request-param-enum-value-added | Allowed value added | S | W |
| request-param-constraint-tightened | max lowered, min raised, length or pattern stricter, or a bound set where none existed | B | W |
| request-param-constraint-relaxed | Bound loosened or removed | S | W |
| request-param-pattern-changed | Pattern changed (cannot prove which is stricter) | P | W |
| request-param-default-changed | Default changed (server-side fallback) | D | W |
| request-param-nullable-removed | No longer accepts null (any of the three nullability forms) | B | W |

## Request bodies

| ID | Change | Sev | Preset |
|---|---|---|---|
| request-body-became-required | Body now required | B | W |
| request-body-content-type-removed | e.g. `application/xml` removed | B | W |
| request-property-removed | Property removed (client may still send it; depends on additionalProperties) | P | W |
| request-property-added-required | New required property (with or without a default) | B | W |
| request-property-became-required | Optional → required | B | W |
| request-property-added-optional | New optional property | S | W |
| request-property-type-changed | Type narrowed | B | W |
| request-property-enum-value-removed | Allowed value removed | B | W |
| request-property-nullable-removed | No longer nullable | B | W |
| request-property-constraint-tightened | max/min/length/items/properties/pattern stricter, or bound newly set | B | W |
| request-property-read-only-added | Now `readOnly` (clients must stop sending it) | P | W |
| request-union-branch-removed | `oneOf`/`anyOf` branch removed | B | W |
| request-allof-branch-added | `allOf` branch added (narrows what may be sent) | B | W |
| request-schema-became-false | Schema became `false` (nothing validates) | B | W |

## Responses

| ID | Change | Sev | Preset |
|---|---|---|---|
| response-success-status-removed | 2xx status removed | B | W |
| response-status-added | New status code | P | W |
| response-body-schema-removed | Body schema removed | B | W |
| response-property-removed | Required property removed | B | W |
| response-optional-property-removed | Optional property removed (clients already handle absence) | D | W |
| response-property-became-optional | Required → optional (may be missing) | B | W |
| response-property-type-changed | Type widened (e.g. integer → number; `date` → `date-time`) | B | W |
| response-property-type-narrowed | Type narrowed (e.g. number → integer) | S | W |
| response-property-nullable-added | Can now be null | P | W |
| response-property-enum-value-added | New value clients may not handle | P | W |
| response-union-branch-added | New `oneOf`/`anyOf` branch | B | W |
| response-property-added | New property | S | W |
| response-constraint-removed | e.g. `maximum` removed: values clients never saw | B | W |
| response-content-type-removed | Media type removed | B | W |
| response-header-removed | Header removed | P | W |
| response-header-schema-changed | Header type/format widened (e.g. date-time string → integer) | B | W |
| response-required-became-write-only | Required response property became `writeOnly` | B | W |
| response-tuple-changed | `prefixItems` reordered, or tuple closed with `items: false` | B | W |
| response-item-schema-changed | OpenAPI 3.2 `itemSchema` (streamed items) changed by the same rules as a body | — | W |

## Shared schemas and structure

| ID | Change | Sev | Preset |
|---|---|---|---|
| schema-renamed | Component schema renamed (same shape) | D | K → B |
| enum-name-changed | `x-enum-varnames` or enum type name changed | D | K → B |
| inline-ref-equivalent | Inline subschema moved to `$ref` with the same shape | not reported | W |

Shared-schema dedup (OA-14) applies to every rule above: when the change sits in a component used in several places, report it once at the component and list the first three usages plus a count.

## Security

| ID | Change | Sev | Preset |
|---|---|---|---|
| security-added-to-open-operation | Operation with no security now requires some (directly or inherited) | B | W |
| security-scheme-added-to-operation | New auth requirement | B | W |
| security-scope-added | New OAuth scope required (any of the four flows) | B | W |
| security-requirement-removed | Auth option removed | B | W |
| security-scheme-transport-changed | Type, API key name/location, HTTP scheme or OpenID URL changed | B | W |
| security-flow-url-changed | Token/authorization/refresh URL host changed (compared by meaning) | P | W |

## Deprecation, sunset and versioning

| ID | Change | Sev | Preset |
|---|---|---|---|
| sunset-date-moved-earlier | `x-sunset` moved earlier | B | W |
| sunset-date-removed | Sunset date removed from a deprecated item | P | W |
| sunset-inside-grace-period | Sunset set closer than the configured grace period | B | W |
| version-bump-missing | Breaking change without a major bump of `info.version` (below 1.0.0: minor) | reported in the version check, and fails CI with `--fail-on missing-version-bump` | — |

## Servers, webhooks, other

| ID | Change | Sev | Preset |
|---|---|---|---|
| server-url-changed | Base URL changed or removed (server variables read with their defaults) | P | W |
| webhook-removed | Webhook removed | P | W |
| webhook-payload-property-removed | Payload property removed | B | W |
| callback-changed | Callback request/response changed (rules apply with direction reversed) | — | W |
| extension-changed | `x-*` changed (off by default) | D | W |
| description-changed / summary-changed / example-changed | Docs only | D | W |

## Behaviour notes

- `allOf` is merged before comparison when "Flatten allOf" is on; otherwise a change inside one branch is reported as P with a note that another branch may still guarantee it.
- `oneOf`/`anyOf` are compared by matching subschemas (by `$ref` name, then by shape); unmatched → P.
- Circular references are compared by reference identity; a change inside a cycle is reported once per entry into the cycle.
- HTTP header names are case-insensitive (RFC 9110) unless the option is off.
- A JSON spec reports line and column the same as YAML.
- Output order is deterministic: sort by file, line, column, rule ID.
