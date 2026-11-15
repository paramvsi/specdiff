// The OpenAPI rule catalogue (docs/06). This array is the source of truth for the website's rules
// reference (WEB-04) and the settings screen (A-12). Detection lives in ./detect-*.ts.
//
// Templates use placeholders filled per change:
//   {op}      the operation ("POST /v1/payments") or the shared component ("Card")
//   {target}  the thing that changed: property, parameter, status, header, media type, value…
//   {before}  the old value, {after} the new value (short form)
//   {where}   `target` in `op`, or just `op` when they are the same
import type { Direction, Kind, Severity } from '../schemas';

export type RuleArea =
  | 'Endpoints'
  | 'Parameters'
  | 'Request bodies'
  | 'Responses'
  | 'Shared schemas'
  | 'Security'
  | 'Deprecation and versioning'
  | 'Servers, webhooks, other'
  | 'Descriptions and examples';

export interface RuleMeta {
  id: string;
  title: string;
  /** Default severity. `null` for rules that are not reported as a change of their own (see `reportedAs`). */
  severity: Severity | null;
  direction: Direction;
  /** W: same severity in both presets. K→B: raised to breaking under the SDK preset. */
  preset: 'W' | 'K→B';
  area: RuleArea;
  kind: Kind;
  /**
   * change: reported as a change with this rule id.
   * contained: the rules of the contained request/response apply (itemSchema, callbacks).
   * version-check: reported in `Report.versionCheck`, not as a change.
   * not-reported: only reported when its comparison option is switched off.
   */
  reportedAs: 'change' | 'contained' | 'version-check' | 'not-reported';
  explanation: { who: string; see: string; avoid: string };
  changelog: string;
}

type Def = Omit<RuleMeta, 'reportedAs' | 'preset'> & Partial<Pick<RuleMeta, 'reportedAs' | 'preset'>>;

const defs: Def[] = [
  // ---------------------------------------------------------------- Endpoints and operations
  {
    id: 'endpoint-removed', title: 'Endpoint removed', severity: 'breaking', direction: 'both', area: 'Endpoints', kind: 'removed',
    explanation: {
      who: 'Every client that calls {op}.',
      see: '404 Not Found (or 405 Method Not Allowed) instead of a response.',
      avoid: 'Mark it `deprecated: true` with an `x-sunset` date for at least one release before removing it.',
    },
    changelog: 'Removed `{op}`.',
  },
  {
    id: 'endpoint-removed-after-deprecation', title: 'Endpoint removed after deprecation', severity: 'possibly', direction: 'both', area: 'Endpoints', kind: 'removed',
    explanation: {
      who: 'Clients that still call the deprecated {op}.',
      see: '404 Not Found once the endpoint is gone.',
      avoid: 'Give it an `x-sunset` date and remove it only after that date.',
    },
    changelog: 'Removed the deprecated `{op}`.',
  },
  {
    id: 'endpoint-added', title: 'Endpoint added', severity: 'safe', direction: 'both', area: 'Endpoints', kind: 'added',
    explanation: { who: 'No existing client.', see: 'Nothing: {op} is new.', avoid: 'Nothing to avoid.' },
    changelog: 'Added `{op}`.',
  },
  {
    id: 'endpoint-deprecated', title: 'Endpoint deprecated', severity: 'safe', direction: 'both', area: 'Endpoints', kind: 'changed',
    explanation: {
      who: 'Clients of {op}, later.',
      see: 'Nothing yet; generated SDKs may show a deprecation warning.',
      avoid: 'Add an `x-sunset` date so clients know when it goes.',
    },
    changelog: 'Deprecated `{op}`.',
  },
  {
    id: 'operation-id-changed', title: 'operationId changed', severity: 'possibly', direction: 'both', preset: 'K→B', area: 'Endpoints', kind: 'renamed',
    explanation: {
      who: 'Clients that use a generated SDK for {op}.',
      see: 'The SDK method `{before}` is renamed to `{after}` on the next regeneration, so their code stops compiling.',
      avoid: 'Keep the old operationId, or ship both names for a release.',
    },
    changelog: 'Renamed the operation `{before}` to `{after}` (`{op}`).',
  },
  {
    id: 'path-param-renamed', title: 'Path parameter renamed', severity: 'safe', direction: 'request', area: 'Endpoints', kind: 'renamed',
    explanation: {
      who: 'No client: the URL on the wire is the same.',
      see: 'Nothing. Generated SDKs may rename an argument.',
      avoid: 'Nothing to avoid.',
    },
    changelog: 'Renamed the path parameter in `{before}` to `{after}`.',
  },
  {
    id: 'tag-changed', title: 'Tags changed', severity: 'docs', direction: 'both', area: 'Descriptions and examples', kind: 'changed',
    explanation: { who: 'Readers of the documentation.', see: '{where} appears under different tags.', avoid: 'Nothing to avoid.' },
    changelog: 'Changed the tags of {where}.',
  },

  // ---------------------------------------------------------------- Parameters
  {
    id: 'request-param-removed', title: 'Request parameter removed', severity: 'possibly', direction: 'request', area: 'Parameters', kind: 'removed',
    explanation: {
      who: 'Clients of {op} that send `{target}`.',
      see: 'The server ignores it, or rejects unknown parameters with 400 Bad Request.',
      avoid: 'Deprecate the parameter first and keep accepting it.',
    },
    changelog: '`{op}` no longer takes `{target}`.',
  },
  {
    id: 'request-param-added-required', title: 'Required request parameter added', severity: 'breaking', direction: 'request', area: 'Parameters', kind: 'added',
    explanation: {
      who: 'Every client of {op}.',
      see: '400 Bad Request, because they do not send `{target}`.',
      avoid: 'Make `{target}` optional with a server-side default.',
    },
    changelog: '`{op}` now requires `{target}`.',
  },
  {
    id: 'request-param-added-optional', title: 'Optional request parameter added', severity: 'safe', direction: 'request', area: 'Parameters', kind: 'added',
    explanation: { who: 'No existing client.', see: 'Nothing: `{target}` is optional.', avoid: 'Nothing to avoid.' },
    changelog: '`{op}` accepts a new optional `{target}`.',
  },
  {
    id: 'request-param-became-required', title: 'Request parameter became required', severity: 'breaking', direction: 'request', area: 'Parameters', kind: 'changed',
    explanation: {
      who: 'Clients of {op} that leave out `{target}`.',
      see: '400 Bad Request.',
      avoid: 'Keep `{target}` optional and apply a default on the server.',
    },
    changelog: '`{op}` now requires `{target}`.',
  },
  {
    id: 'request-param-became-optional', title: 'Request parameter became optional', severity: 'safe', direction: 'request', area: 'Parameters', kind: 'changed',
    explanation: { who: 'No existing client.', see: 'Nothing: requests that send `{target}` still work.', avoid: 'Nothing to avoid.' },
    changelog: '`{target}` on `{op}` is now optional.',
  },
  {
    id: 'request-param-type-changed', title: 'Request parameter type changed', severity: 'breaking', direction: 'request', area: 'Parameters', kind: 'typeChanged',
    explanation: {
      who: 'Clients of {op} that send `{target}` as {before}.',
      see: '400 Bad Request when the value no longer matches {after}.',
      avoid: 'Accept both types for a release, or add a new parameter.',
    },
    changelog: '`{target}` on `{op}` changed from {before} to {after}.',
  },
  {
    id: 'request-param-type-widened', title: 'Request parameter type widened', severity: 'safe', direction: 'request', area: 'Parameters', kind: 'typeChanged',
    explanation: { who: 'No existing client.', see: 'Nothing: every old value is still accepted.', avoid: 'Nothing to avoid.' },
    changelog: '`{target}` on `{op}` now accepts {after}.',
  },
  {
    id: 'request-param-location-changed', title: 'Request parameter moved', severity: 'breaking', direction: 'request', area: 'Parameters', kind: 'moved',
    explanation: {
      who: 'Clients of {op} that send `{target}`.',
      see: 'The server no longer finds it (it moved from {before} to {after}), so 400 Bad Request or the wrong result.',
      avoid: 'Accept the parameter in both places for a release.',
    },
    changelog: '`{target}` on `{op}` moved from {before} to {after}.',
  },
  {
    id: 'request-param-enum-value-removed', title: 'Request parameter value removed', severity: 'breaking', direction: 'request', area: 'Parameters', kind: 'removed',
    explanation: {
      who: 'Clients of {op} that send `{target}={before}`.',
      see: '400 Bad Request.',
      avoid: 'Keep accepting the value and map it to its replacement.',
    },
    changelog: '`{target}` on `{op}` no longer accepts `{before}`.',
  },
  {
    id: 'request-param-enum-value-added', title: 'Request parameter value added', severity: 'safe', direction: 'request', area: 'Parameters', kind: 'added',
    explanation: { who: 'No existing client.', see: 'Nothing: `{after}` is a new choice.', avoid: 'Nothing to avoid.' },
    changelog: '`{target}` on `{op}` accepts `{after}`.',
  },
  {
    id: 'request-param-constraint-tightened', title: 'Request parameter constraint tightened', severity: 'breaking', direction: 'request', area: 'Parameters', kind: 'changed',
    explanation: {
      who: 'Clients of {op} that send `{target}` values allowed before ({before}) but not now ({after}).',
      see: '400 Bad Request.',
      avoid: 'Keep the old bound, or clamp values on the server instead of rejecting them.',
    },
    changelog: '`{target}` on `{op}` is now limited to {after} (was {before}).',
  },
  {
    id: 'request-param-constraint-relaxed', title: 'Request parameter constraint relaxed', severity: 'safe', direction: 'request', area: 'Parameters', kind: 'changed',
    explanation: { who: 'No existing client.', see: 'Nothing: more values are accepted ({before} → {after}).', avoid: 'Nothing to avoid.' },
    changelog: '`{target}` on `{op}` now allows {after} (was {before}).',
  },
  {
    id: 'request-param-pattern-changed', title: 'Request parameter pattern changed', severity: 'possibly', direction: 'request', area: 'Parameters', kind: 'changed',
    explanation: {
      who: 'Clients of {op} whose `{target}` values match the old pattern but not the new one.',
      see: '400 Bad Request for those values. The spec alone cannot tell which pattern is stricter.',
      avoid: 'Check that every value the old pattern allowed still matches.',
    },
    changelog: 'The pattern for `{target}` on `{op}` changed.',
  },
  {
    id: 'request-param-default-changed', title: 'Request parameter default changed', severity: 'docs', direction: 'request', area: 'Parameters', kind: 'changed',
    explanation: {
      who: 'Clients of {op} that leave out `{target}`.',
      see: 'The server falls back to {after} instead of {before}; the request itself still validates.',
      avoid: 'Announce the new default in the changelog.',
    },
    changelog: 'The default for `{target}` on `{op}` is now {after} (was {before}).',
  },
  {
    id: 'request-param-nullable-removed', title: 'Request parameter no longer accepts null', severity: 'breaking', direction: 'request', area: 'Parameters', kind: 'changed',
    explanation: { who: 'Clients of {op} that send `{target}` as null.', see: '400 Bad Request.', avoid: 'Keep accepting null and treat it as “not set”.' },
    changelog: '`{target}` on `{op}` can no longer be null.',
  },

  // ---------------------------------------------------------------- Request bodies
  {
    id: 'request-body-became-required', title: 'Request body became required', severity: 'breaking', direction: 'request', area: 'Request bodies', kind: 'changed',
    explanation: { who: 'Clients of {op} that send no body.', see: '400 Bad Request.', avoid: 'Keep the body optional and use defaults.' },
    changelog: '`{op}` now requires a request body.',
  },
  {
    id: 'request-body-content-type-removed', title: 'Request content type removed', severity: 'breaking', direction: 'request', area: 'Request bodies', kind: 'removed',
    explanation: { who: 'Clients of {op} that send `{target}`.', see: '415 Unsupported Media Type.', avoid: 'Keep accepting `{target}` for a release.' },
    changelog: '`{op}` no longer accepts `{target}` bodies.',
  },
  {
    id: 'request-property-removed', title: 'Request property removed', severity: 'possibly', direction: 'request', area: 'Request bodies', kind: 'removed',
    explanation: {
      who: 'Clients of {op} that still send `{target}`.',
      see: 'The value is ignored, or 400 Bad Request if the schema rejects unknown properties (additionalProperties: false).',
      avoid: 'Deprecate `{target}` first and keep accepting it.',
    },
    changelog: '`{op}` no longer takes `{target}`.',
  },
  {
    id: 'request-property-added-required', title: 'Required request property added', severity: 'breaking', direction: 'request', area: 'Request bodies', kind: 'added',
    explanation: {
      who: 'Every client of {op}.',
      see: '400 Bad Request, because they do not send `{target}`.',
      avoid: 'Add `{target}` as optional with a server-side default.',
    },
    changelog: '`{op}` now requires `{target}`.',
  },
  {
    id: 'request-property-became-required', title: 'Request property became required', severity: 'breaking', direction: 'request', area: 'Request bodies', kind: 'changed',
    explanation: {
      who: 'Any client that calls {op} without `{target}`.',
      see: '400 Bad Request.',
      avoid: 'Add a default or keep the field optional.',
    },
    changelog: '`{op}` now requires `{target}`.',
  },
  {
    id: 'request-property-added-optional', title: 'Optional request property added', severity: 'safe', direction: 'request', area: 'Request bodies', kind: 'added',
    explanation: { who: 'No existing client.', see: 'Nothing: `{target}` is optional.', avoid: 'Nothing to avoid.' },
    changelog: '`{op}` accepts a new optional `{target}`.',
  },
  {
    id: 'request-property-type-changed', title: 'Request property type changed', severity: 'breaking', direction: 'request', area: 'Request bodies', kind: 'typeChanged',
    explanation: {
      who: 'Clients of {op} that send `{target}` as {before}.',
      see: '400 Bad Request when the value no longer matches {after}.',
      avoid: 'Accept both types for a release, or add a new property.',
    },
    changelog: '`{target}` in `{op}` changed from {before} to {after}.',
  },
  {
    id: 'request-property-enum-value-removed', title: 'Request property value removed', severity: 'breaking', direction: 'request', area: 'Request bodies', kind: 'removed',
    explanation: { who: 'Clients of {op} that send `{target}: {before}`.', see: '400 Bad Request.', avoid: 'Keep accepting the value and map it to its replacement.' },
    changelog: '`{target}` in `{op}` no longer accepts `{before}`.',
  },
  {
    id: 'request-property-nullable-removed', title: 'Request property no longer accepts null', severity: 'breaking', direction: 'request', area: 'Request bodies', kind: 'changed',
    explanation: { who: 'Clients of {op} that send `{target}: null`.', see: '400 Bad Request.', avoid: 'Keep accepting null and treat it as “not set”.' },
    changelog: '`{target}` in `{op}` can no longer be null.',
  },
  {
    id: 'request-property-constraint-tightened', title: 'Request property constraint tightened', severity: 'breaking', direction: 'request', area: 'Request bodies', kind: 'changed',
    explanation: {
      who: 'Clients of {op} that send `{target}` values allowed before ({before}) but not now ({after}).',
      see: '400 Bad Request.',
      avoid: 'Keep the old bound, or normalise values on the server instead of rejecting them.',
    },
    changelog: '`{target}` in `{op}` is now limited to {after} (was {before}).',
  },
  {
    id: 'request-property-read-only-added', title: 'Request property became read-only', severity: 'possibly', direction: 'request', area: 'Request bodies', kind: 'changed',
    explanation: {
      who: 'Clients of {op} that send `{target}`.',
      see: 'The value is ignored, or rejected by servers that enforce readOnly.',
      avoid: 'Keep accepting and ignoring `{target}` for a release.',
    },
    changelog: '`{target}` in `{op}` is now read-only; stop sending it.',
  },
  {
    id: 'request-union-branch-removed', title: 'Request oneOf/anyOf option removed', severity: 'breaking', direction: 'request', area: 'Request bodies', kind: 'removed',
    explanation: { who: 'Clients of {op} that send the {before} shape.', see: '400 Bad Request.', avoid: 'Keep accepting the old shape for a release.' },
    changelog: '`{op}` no longer accepts the {before} shape for `{target}`.',
  },
  {
    id: 'request-allof-branch-added', title: 'Request allOf part added', severity: 'breaking', direction: 'request', area: 'Request bodies', kind: 'added',
    explanation: {
      who: 'Clients of {op} whose payloads do not satisfy the new {after} part.',
      see: '400 Bad Request.',
      avoid: 'Make every property of the new part optional.',
    },
    changelog: '`{target}` in `{op}` must now also match {after}.',
  },
  {
    id: 'request-schema-became-false', title: 'Request schema rejects everything', severity: 'breaking', direction: 'request', area: 'Request bodies', kind: 'changed',
    explanation: { who: 'Every client of {op} that sends `{target}`.', see: '400 Bad Request: the schema is now `false`, so no value is valid.', avoid: 'Remove the property instead, after a deprecation period.' },
    changelog: '`{target}` in `{op}` no longer accepts any value.',
  },

  // ---------------------------------------------------------------- Responses
  {
    id: 'response-success-status-removed', title: 'Success status removed', severity: 'breaking', direction: 'response', area: 'Responses', kind: 'removed',
    explanation: {
      who: 'Clients of {op} that handle the {target} response.',
      see: 'A status code they were never written to handle.',
      avoid: 'Keep returning {target} for a release.',
    },
    changelog: '`{op}` no longer returns {target}.',
  },
  {
    id: 'response-status-added', title: 'Response status added', severity: 'possibly', direction: 'response', area: 'Responses', kind: 'added',
    explanation: {
      who: 'Clients of {op} with strict status handling.',
      see: 'A {target} response they may not handle.',
      avoid: 'Document when {target} is returned so clients can prepare.',
    },
    changelog: '`{op}` can now return {target}.',
  },
  {
    id: 'response-body-schema-removed', title: 'Response body removed', severity: 'breaking', direction: 'response', area: 'Responses', kind: 'removed',
    explanation: { who: 'Clients of {op} that read the {target} body.', see: 'An empty or undocumented body.', avoid: 'Keep the body schema for a release.' },
    changelog: '`{op}` no longer documents a body for {target}.',
  },
  {
    id: 'response-property-removed', title: 'Response property removed', severity: 'breaking', direction: 'response', area: 'Responses', kind: 'removed',
    explanation: {
      who: 'Clients of {op} that read `{target}`.',
      see: '`{target}` is undefined, so code that relies on it fails or shows empty values.',
      avoid: 'Keep `{target}` and mark it `deprecated` with an `x-sunset` date, then remove it in the next major version.',
    },
    changelog: 'Removed `{target}` from `{op}` responses.',
  },
  {
    id: 'response-optional-property-removed', title: 'Optional response property removed', severity: 'docs', direction: 'response', area: 'Responses', kind: 'removed',
    explanation: {
      who: 'Nobody on the wire: `{target}` was optional, so clients already handle it being absent.',
      see: 'Nothing new.',
      avoid: 'Mention it in the changelog.',
    },
    changelog: 'Removed the optional `{target}` from `{op}` responses.',
  },
  {
    id: 'response-property-became-optional', title: 'Response property became optional', severity: 'breaking', direction: 'response', area: 'Responses', kind: 'changed',
    explanation: {
      who: 'Clients of {op} that expect `{target}` to be present.',
      see: '`{target}` is sometimes missing.',
      avoid: 'Keep returning `{target}` every time.',
    },
    changelog: '`{target}` in `{op}` responses may now be missing.',
  },
  {
    id: 'response-property-type-changed', title: 'Response property type changed', severity: 'breaking', direction: 'response', area: 'Responses', kind: 'typeChanged',
    explanation: {
      who: 'Clients of {op} that read `{target}` as {before}.',
      see: 'A {after} value they cannot parse.',
      avoid: 'Add a new property with the new type and keep the old one.',
    },
    changelog: '`{target}` in `{op}` responses changed from {before} to {after}.',
  },
  {
    id: 'response-property-type-narrowed', title: 'Response property type narrowed', severity: 'safe', direction: 'response', area: 'Responses', kind: 'typeChanged',
    explanation: { who: 'No existing client.', see: 'Nothing: every new value was valid before.', avoid: 'Nothing to avoid.' },
    changelog: '`{target}` in `{op}` responses is now always {after}.',
  },
  {
    id: 'response-property-nullable-added', title: 'Response property can be null', severity: 'possibly', direction: 'response', area: 'Responses', kind: 'changed',
    explanation: {
      who: 'Clients of {op} that use `{target}` without a null check.',
      see: 'A null value; strict clients fail, lenient ones may crash later.',
      avoid: 'Leave the property out instead of returning null, or announce it.',
    },
    changelog: '`{target}` in `{op}` responses can now be null.',
  },
  {
    id: 'response-property-enum-value-added', title: 'Response value added', severity: 'possibly', direction: 'response', area: 'Responses', kind: 'added',
    explanation: {
      who: 'Clients of {op} that switch on `{target}`.',
      see: 'The new value `{after}`: strict clients reject it, lenient ones ignore it.',
      avoid: 'Announce new values ahead of time, or tell clients to handle unknown values.',
    },
    changelog: '`{target}` in `{op}` responses can now be `{after}`.',
  },
  {
    id: 'response-union-branch-added', title: 'Response oneOf/anyOf option added', severity: 'breaking', direction: 'response', area: 'Responses', kind: 'added',
    explanation: { who: 'Clients of {op} that handle every documented shape of `{target}`.', see: 'A {after} shape they were never written to handle.', avoid: 'Return the new shape only to clients that ask for it.' },
    changelog: '`{target}` in `{op}` responses can now be {after}.',
  },
  {
    id: 'response-property-added', title: 'Response property added', severity: 'safe', direction: 'response', area: 'Responses', kind: 'added',
    explanation: { who: 'No existing client.', see: 'A new `{target}` they can ignore.', avoid: 'Nothing to avoid.' },
    changelog: 'Added `{target}` to `{op}` responses.',
  },
  {
    id: 'response-constraint-removed', title: 'Response constraint removed or loosened', severity: 'breaking', direction: 'response', area: 'Responses', kind: 'changed',
    explanation: {
      who: 'Clients of {op} that rely on `{target}` staying within {before}.',
      see: 'Values they never saw before ({after}).',
      avoid: 'Keep the bound, or add a new property for the wider values.',
    },
    changelog: '`{target}` in `{op}` responses may now be {after} (was {before}).',
  },
  {
    id: 'response-content-type-removed', title: 'Response content type removed', severity: 'breaking', direction: 'response', area: 'Responses', kind: 'removed',
    explanation: { who: 'Clients of {op} that ask for `{target}`.', see: '406 Not Acceptable or a body they cannot parse.', avoid: 'Keep returning `{target}` for a release.' },
    changelog: '`{op}` no longer returns `{target}`.',
  },
  {
    id: 'response-header-removed', title: 'Response header removed', severity: 'possibly', direction: 'response', area: 'Responses', kind: 'removed',
    explanation: { who: 'Clients of {op} that read the `{target}` header.', see: 'The header is missing.', avoid: 'Keep sending the header for a release.' },
    changelog: '`{op}` no longer sends the `{target}` header.',
  },
  {
    id: 'response-header-schema-changed', title: 'Response header type changed', severity: 'breaking', direction: 'response', area: 'Responses', kind: 'typeChanged',
    explanation: { who: 'Clients of {op} that parse the `{target}` header as {before}.', see: 'A {after} value they cannot parse.', avoid: 'Send the new format in a new header.' },
    changelog: 'The `{target}` header on `{op}` changed from {before} to {after}.',
  },
  {
    id: 'response-required-became-write-only', title: 'Required response property became write-only', severity: 'breaking', direction: 'response', area: 'Responses', kind: 'changed',
    explanation: { who: 'Clients of {op} that read `{target}`.', see: '`{target}` is no longer returned.', avoid: 'Keep returning it, or deprecate it first.' },
    changelog: '`{target}` is no longer returned by `{op}`.',
  },
  {
    id: 'response-tuple-changed', title: 'Response tuple changed', severity: 'breaking', direction: 'response', area: 'Responses', kind: 'changed',
    explanation: { who: 'Clients of {op} that read `{target}` by position.', see: 'Items in a different order or shape ({after}).', avoid: 'Add new items at the end only.' },
    changelog: 'The items of `{target}` in `{op}` responses changed.',
  },
  {
    id: 'response-item-schema-changed', title: 'Streamed item schema changed', severity: null, direction: 'response', area: 'Responses', kind: 'changed', reportedAs: 'contained',
    explanation: {
      who: 'Clients that read the streamed items of {op}.',
      see: 'OpenAPI 3.2 `itemSchema` changes are judged by the same rules as a response body.',
      avoid: 'See the rule reported for the item.',
    },
    changelog: 'The streamed items of `{op}` changed.',
  },

  // ---------------------------------------------------------------- Shared schemas and structure
  {
    id: 'schema-renamed', title: 'Component schema renamed', severity: 'docs', direction: 'both', preset: 'K→B', area: 'Shared schemas', kind: 'renamed',
    explanation: {
      who: 'Clients that use a generated SDK.',
      see: 'The type `{before}` is called `{after}` on the next regeneration. Nothing changes on the wire.',
      avoid: 'Keep the old name, or add an alias.',
    },
    changelog: 'Renamed the schema `{before}` to `{after}`.',
  },
  {
    id: 'enum-name-changed', title: 'Enum names changed', severity: 'docs', direction: 'both', preset: 'K→B', area: 'Shared schemas', kind: 'renamed',
    explanation: {
      who: 'Clients that use a generated SDK.',
      see: 'Enum constants for `{target}` are renamed ({before} → {after}). Nothing changes on the wire.',
      avoid: 'Keep the old names.',
    },
    changelog: 'Renamed the enum constants of `{target}`.',
  },
  {
    id: 'inline-ref-equivalent', title: 'Inline schema moved to $ref', severity: 'docs', direction: 'both', area: 'Shared schemas', kind: 'moved', reportedAs: 'not-reported',
    explanation: {
      who: 'Nobody: the shape is the same.',
      see: 'Nothing. Reported only when “Match inline vs $ref” is off.',
      avoid: 'Nothing to avoid.',
    },
    changelog: '`{target}` in `{op}` now uses `{after}`.',
  },

  // ---------------------------------------------------------------- Security
  {
    id: 'security-added-to-open-operation', title: 'Authentication now required', severity: 'breaking', direction: 'request', area: 'Security', kind: 'added',
    explanation: { who: 'Every client of {op} that calls it without credentials.', see: '401 Unauthorized.', avoid: 'Keep an anonymous option (`{}`) in `security` for a release.' },
    changelog: '`{op}` now requires authentication ({after}).',
  },
  {
    id: 'security-scheme-added-to-operation', title: 'Authentication scheme added', severity: 'breaking', direction: 'request', area: 'Security', kind: 'added',
    explanation: { who: 'Clients of {op} that authenticate with {before}.', see: '401 Unauthorized until they also send {after}.', avoid: 'Add the new scheme as an alternative, not as an extra requirement.' },
    changelog: '`{op}` now also requires `{target}`.',
  },
  {
    id: 'security-scope-added', title: 'OAuth scope added', severity: 'breaking', direction: 'request', area: 'Security', kind: 'added',
    explanation: { who: 'Clients of {op} whose tokens lack the `{after}` scope.', see: '403 Forbidden.', avoid: 'Grant the scope to existing tokens before requiring it.' },
    changelog: '`{op}` now requires the `{after}` scope.',
  },
  {
    id: 'security-requirement-removed', title: 'Authentication option removed', severity: 'breaking', direction: 'request', area: 'Security', kind: 'removed',
    explanation: { who: 'Clients of {op} that authenticate with {before}.', see: '401 Unauthorized.', avoid: 'Keep the option for a release and announce its removal.' },
    changelog: '`{op}` no longer accepts {before}.',
  },
  {
    id: 'security-scheme-transport-changed', title: 'Security scheme changed', severity: 'breaking', direction: 'request', area: 'Security', kind: 'changed',
    explanation: { who: 'Every client that uses the `{target}` scheme.', see: '401 Unauthorized: credentials are expected as {after} instead of {before}.', avoid: 'Add a new scheme and keep the old one for a release.' },
    changelog: 'The `{target}` security scheme changed from {before} to {after}.',
  },
  {
    id: 'security-flow-url-changed', title: 'OAuth URL changed', severity: 'possibly', direction: 'request', area: 'Security', kind: 'changed',
    explanation: { who: 'Clients with the `{target}` URL configured.', see: 'Token requests to the old host ({before}) may fail.', avoid: 'Keep the old URL working as a redirect.' },
    changelog: 'The `{target}` URL changed to {after}.',
  },

  // ---------------------------------------------------------------- Deprecation, sunset and versioning
  {
    id: 'sunset-date-moved-earlier', title: 'Sunset date moved earlier', severity: 'breaking', direction: 'both', area: 'Deprecation and versioning', kind: 'changed',
    explanation: { who: 'Clients that planned to migrate from {op} by {before}.', see: 'The endpoint goes away earlier, on {after}.', avoid: 'Never move a sunset date earlier; move it later if needed.' },
    changelog: '`{op}` now sunsets on {after} (was {before}).',
  },
  {
    id: 'sunset-date-removed', title: 'Sunset date removed', severity: 'possibly', direction: 'both', area: 'Deprecation and versioning', kind: 'removed',
    explanation: { who: 'Clients of the deprecated {op}.', see: 'No date for when it goes away ({before} before).', avoid: 'Keep an `x-sunset` date on deprecated items.' },
    changelog: '`{op}` no longer has a sunset date.',
  },
  {
    id: 'sunset-inside-grace-period', title: 'Sunset inside the grace period', severity: 'breaking', direction: 'both', area: 'Deprecation and versioning', kind: 'changed',
    explanation: { who: 'Clients of {op}.', see: 'It sunsets on {after}, sooner than the grace period allows ({before}).', avoid: 'Set the sunset date at least the grace period from today.' },
    changelog: '`{op}` sunsets on {after}.',
  },
  {
    id: 'version-bump-missing', title: 'Version bump missing', severity: null, direction: 'both', area: 'Deprecation and versioning', kind: 'changed', reportedAs: 'version-check',
    explanation: {
      who: 'Everyone who reads `info.version` to judge an upgrade.',
      see: 'A breaking release that looks compatible.',
      avoid: 'Bump the major version (minor below 1.0.0) when anything breaks.',
    },
    changelog: 'info.version should be {after}.',
  },

  // ---------------------------------------------------------------- Servers, webhooks, other
  {
    id: 'server-url-changed', title: 'Server URL changed', severity: 'possibly', direction: 'both', area: 'Servers, webhooks, other', kind: 'changed',
    explanation: { who: 'Clients configured with {before}.', see: 'Connection errors or 404 if the old URL stops working.', avoid: 'Keep the old base URL working as a redirect.' },
    changelog: 'The server URL {before} changed to {after}.',
  },
  {
    id: 'webhook-removed', title: 'Webhook removed', severity: 'possibly', direction: 'response', area: 'Servers, webhooks, other', kind: 'removed',
    explanation: { who: 'Receivers of the `{target}` webhook.', see: 'The events stop arriving.', avoid: 'Announce the removal and keep sending for a release.' },
    changelog: 'Removed the `{target}` webhook.',
  },
  {
    id: 'webhook-payload-property-removed', title: 'Webhook payload property removed', severity: 'breaking', direction: 'response', area: 'Servers, webhooks, other', kind: 'removed',
    explanation: { who: 'Receivers of {op} that read `{target}`.', see: '`{target}` is missing from the payload.', avoid: 'Keep sending `{target}`, deprecated, for a release.' },
    changelog: 'Removed `{target}` from the {op} payload.',
  },
  {
    id: 'callback-changed', title: 'Callback changed', severity: null, direction: 'both', area: 'Servers, webhooks, other', kind: 'changed', reportedAs: 'contained',
    explanation: {
      who: 'Clients that implement the `{target}` callback.',
      see: 'Callback requests and responses are judged by the same rules with direction reversed: the callback request is what clients receive.',
      avoid: 'See the rule reported for the callback.',
    },
    changelog: 'The `{target}` callback changed.',
  },
  {
    id: 'extension-changed', title: 'Extension changed', severity: 'docs', direction: 'both', area: 'Servers, webhooks, other', kind: 'changed',
    explanation: { who: 'Tools that read `{target}`.', see: 'A different extension value ({before} → {after}).', avoid: 'Nothing to avoid on the wire.' },
    changelog: 'Changed {where}.',
  },
  {
    id: 'description-changed', title: 'Description changed', severity: 'docs', direction: 'both', area: 'Descriptions and examples', kind: 'changed',
    explanation: { who: 'Readers of the documentation.', see: 'New wording for {where}.', avoid: 'Nothing to avoid.' },
    changelog: 'Updated the description of {where}.',
  },
  {
    id: 'summary-changed', title: 'Summary changed', severity: 'docs', direction: 'both', area: 'Descriptions and examples', kind: 'changed',
    explanation: { who: 'Readers of the documentation.', see: 'A new summary for {where}.', avoid: 'Nothing to avoid.' },
    changelog: 'Updated the summary of {where}.',
  },
  {
    id: 'example-changed', title: 'Example changed', severity: 'docs', direction: 'both', area: 'Descriptions and examples', kind: 'changed',
    explanation: { who: 'Readers of the documentation and mock servers.', see: 'A new example for {where}.', avoid: 'Nothing to avoid.' },
    changelog: 'Updated the example of {where}.',
  },
];

export const rules: readonly RuleMeta[] = defs.map((d) => ({ reportedAs: 'change', preset: 'W', ...d }));

export const ruleById: ReadonlyMap<string, RuleMeta> = new Map(rules.map((r) => [r.id, r]));

export function getRule(id: string): RuleMeta {
  const r = ruleById.get(id);
  if (!r) throw new Error(`Unknown rule ${id}`);
  return r;
}

export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}
