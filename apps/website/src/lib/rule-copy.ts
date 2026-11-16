// Per-rule page copy for W-04 (WEB-04): the headline and the intro, one entry per rule in
// @specdiff/core's catalogue. Written from each rule's metadata (title, kind, direction, area) and
// what its fixture reports, so every page says what changed in the spec in its own words.
// "Who it breaks" and "How to avoid it" are built from the fixture's real explanation (rule-page.ts).
// A unit-free guard: e2e/website.spec.ts checks every rule page has its own headline and intro.

export interface RuleCopy {
  headline: string;
  intro: string;
}

export const RULE_COPY: Record<string, RuleCopy> = {
  // Endpoints and operations
  'endpoint-removed': { headline: 'An endpoint was removed without deprecation', intro: 'A path and method that clients call is gone from the spec, and it was never marked deprecated first.' },
  'endpoint-removed-after-deprecation': { headline: 'A deprecated endpoint was removed', intro: 'An operation that was already marked `deprecated: true` is now gone from the spec.' },
  'endpoint-added': { headline: 'A new endpoint was added', intro: 'The spec has a path and method that did not exist in the previous version.' },
  'endpoint-deprecated': { headline: 'An endpoint was marked deprecated', intro: 'The operation now has `deprecated: true`. It still works, but clients are told to move away from it.' },
  'operation-id-changed': { headline: 'An operation was given a new operationId', intro: 'The `operationId` changed while the path and method stayed the same. Generated SDKs name their methods after it.' },
  'path-param-renamed': { headline: 'A path parameter was renamed', intro: 'Only the name inside the braces changed, such as `{id}` to `{userId}`. The URL clients call is the same.' },
  'tag-changed': { headline: 'An operation moved to different tags', intro: 'Tags were added, removed or reordered on an operation. Tags only group operations in the docs.' },
  // Parameters
  'request-param-removed': { headline: 'A request parameter was removed', intro: 'A query, header, path or cookie parameter that clients could send is no longer in the spec.' },
  'request-param-added-required': { headline: 'A new required parameter was added', intro: 'An operation gained a parameter that every request must now include. Existing clients do not send it.' },
  'request-param-added-optional': { headline: 'A new optional parameter was added', intro: 'An operation gained a parameter that clients may send. Requests without it still work.' },
  'request-param-became-required': { headline: 'An optional parameter became required', intro: 'A parameter that clients could leave out is now marked `required: true`.' },
  'request-param-became-optional': { headline: 'A required parameter became optional', intro: 'A parameter that every request had to include can now be left out.' },
  'request-param-type-changed': { headline: 'A request parameter changed type', intro: 'The parameter’s schema type changed to one that rejects values clients send today, such as string to integer.' },
  'request-param-type-widened': { headline: 'A request parameter accepts a wider type', intro: 'The parameter’s type now accepts more values, such as integer to number. Every old value is still valid.' },
  'request-param-location-changed': { headline: 'A request parameter moved to another location', intro: 'The parameter keeps its name but is read from somewhere else, such as the query string instead of a header.' },
  'request-param-enum-value-removed': { headline: 'A parameter no longer accepts one of its values', intro: 'A value was removed from the parameter’s `enum`. Requests that send it are no longer valid.' },
  'request-param-enum-value-added': { headline: 'A parameter accepts a new value', intro: 'A value was added to the parameter’s `enum`. Clients can send it; old values still work.' },
  'request-param-constraint-tightened': { headline: 'A request parameter’s limits got stricter', intro: 'A bound on the parameter was tightened: a maximum lowered, a minimum raised, a length or pattern made stricter, or a bound set where there was none.' },
  'request-param-constraint-relaxed': { headline: 'A request parameter’s limits were loosened', intro: 'A bound on the parameter was raised, lowered or removed so that more values are accepted.' },
  'request-param-pattern-changed': { headline: 'A request parameter’s pattern changed', intro: 'The parameter’s `pattern` regular expression changed, and the spec alone cannot tell whether the new one is stricter.' },
  'request-param-default-changed': { headline: 'A parameter’s default value changed', intro: 'The `default` the server falls back to when the parameter is left out is now a different value.' },
  'request-param-nullable-removed': { headline: 'A request parameter no longer accepts null', intro: 'The parameter used to allow `null` (by `nullable`, a `null` type or a `null` enum value) and now does not.' },
  'request-param-serialization-changed': { headline: 'A request parameter is serialized differently', intro: 'The parameter’s `style`, `explode` or `allowReserved` changed, so the same value is written differently on the wire. Writing out a default changes nothing.' },
  'request-param-deprecated': { headline: 'A request parameter was marked deprecated', intro: 'The parameter now has `deprecated: true`. Requests that send it still work, but clients are told to stop.' },
  // Request bodies
  'request-body-became-required': { headline: 'The request body became required', intro: 'An operation whose body was optional now has `requestBody.required: true`.' },
  'request-body-content-type-removed': { headline: 'A request content type was removed', intro: 'The operation no longer lists a media type, such as `application/xml`, that clients send bodies in.' },
  'request-property-removed': { headline: 'A request body property was removed', intro: 'A property clients could send in the request body is no longer in the schema. What happens depends on `additionalProperties`.' },
  'request-property-added-required': { headline: 'A new required request property was added', intro: 'The request body schema gained a property in its `required` list. Existing clients do not send it.' },
  'request-property-became-required': { headline: 'An optional request property became required', intro: 'A property that clients could leave out of the request body is now in the schema’s required list.' },
  'request-property-added-optional': { headline: 'A new optional request property was added', intro: 'The request body schema gained a property clients may send. Bodies without it still validate.' },
  'request-property-type-changed': { headline: 'A request property changed type', intro: 'A property in the request body now has a type that rejects values clients send today.' },
  'request-property-enum-value-removed': { headline: 'A request property no longer accepts one of its values', intro: 'A value was removed from a request body property’s `enum`. Bodies that use it are no longer valid.' },
  'request-property-nullable-removed': { headline: 'A request property no longer accepts null', intro: 'A request body property that allowed `null` now requires a real value.' },
  'request-property-constraint-tightened': { headline: 'A request property’s limits got stricter', intro: 'A bound on a request body property was tightened: max or min, length, item count, property count or pattern.' },
  'request-property-read-only-added': { headline: 'A request property became read-only', intro: 'A property clients send in the request body is now `readOnly: true`: the server sets it and clients should stop sending it.' },
  'request-union-branch-removed': { headline: 'A request oneOf or anyOf option was removed', intro: 'One of the shapes a request body could take under `oneOf` or `anyOf` is gone.' },
  'request-allof-branch-added': { headline: 'A request schema must match one more allOf part', intro: 'A schema was added to a request’s `allOf`, so a body now has to satisfy it as well.' },
  'request-schema-became-false': { headline: 'A request schema now rejects every value', intro: 'A request schema or property became the boolean schema `false`, so nothing clients send can validate.' },
  'request-dependency-added': { headline: 'Sending one request field now requires another', intro: 'A `dependentRequired` or `dependentSchemas` entry was added: when clients send the first property, they must now send more with it.' },
  'request-dependency-removed': { headline: 'A request field no longer requires another', intro: 'A `dependentRequired` or `dependentSchemas` dependency was removed. Requests that met it still validate.' },
  // Responses
  'response-success-status-removed': { headline: 'A success status code was removed', intro: 'A 2xx response the operation used to return is no longer in the spec.' },
  'response-status-added': { headline: 'An operation can return a new status code', intro: 'The operation lists a response status it did not document before.' },
  'response-body-schema-removed': { headline: 'A response no longer documents a body', intro: 'A response that described its body with a schema now has no content.' },
  'response-property-removed': { headline: 'A required response property was removed', intro: 'A property every response used to contain is gone from the response schema.' },
  'response-optional-property-removed': { headline: 'An optional response property was removed', intro: 'A property that responses could leave out is gone. Clients already had to cope with it missing.' },
  'response-property-became-optional': { headline: 'A response property may now be missing', intro: 'A property that every response contained is no longer in the schema’s required list.' },
  'response-property-type-changed': { headline: 'A response property changed type', intro: 'A response property now has a wider type, such as integer to number or `date` to `date-time`, so clients receive values they did not expect.' },
  'response-property-type-narrowed': { headline: 'A response property’s type was narrowed', intro: 'A response property now has a narrower type, such as number to integer. Every new value was already valid.' },
  'response-property-nullable-added': { headline: 'A response property can now be null', intro: 'A response property that always had a value may now be `null`.' },
  'response-property-enum-value-added': { headline: 'A response property can return a new value', intro: 'A value was added to a response property’s `enum`. Clients that switch on the value have not seen it before.' },
  'response-union-branch-added': { headline: 'A response can take a new oneOf or anyOf shape', intro: 'A new branch was added to a response’s `oneOf` or `anyOf`, so clients may receive a shape they do not handle.' },
  'response-property-added': { headline: 'A new response property was added', intro: 'Responses gained a property. Clients that do not know it can ignore it.' },
  'response-dependency-removed': { headline: 'A response field may now arrive without its companion', intro: 'A `dependentRequired` or `dependentSchemas` dependency was removed from a response, so a property that always came with another may now come alone.' },
  'response-dependency-added': { headline: 'A response field now always comes with another', intro: 'A dependency was added to a response schema: when the first property is present, the others are now promised too.' },
  'response-constraint-removed': { headline: 'A response constraint was removed or loosened', intro: 'A bound on a response value, such as `maximum`, was removed or widened, so clients may see values they never saw before.' },
  'response-content-type-removed': { headline: 'A response content type was removed', intro: 'The operation no longer returns a media type, such as `application/xml`, that clients ask for.' },
  'response-header-removed': { headline: 'A response header was removed', intro: 'A header the operation used to document in its response is no longer listed.' },
  'response-header-schema-changed': { headline: 'A response header changed type', intro: 'A response header’s type or format was widened, such as a date-time string to an integer.' },
  'response-header-serialization-changed': { headline: 'A response header is serialized differently', intro: 'A response header’s `explode` or `style` changed, so a list or object in it is written differently.' },
  'response-required-became-write-only': { headline: 'A required response property became write-only', intro: 'A property every response contained is now `writeOnly: true`, so the server stops returning it.' },
  'response-tuple-changed': { headline: 'A response tuple changed shape', intro: 'The `prefixItems` of a response array were reordered or changed, or the tuple was closed with `items: false`.' },
  'response-item-schema-changed': { headline: 'A streamed response item changed', intro: 'The OpenAPI 3.2 `itemSchema` of a streamed response changed. Each change inside it is reported by the response rules.' },
  // Shared schemas and structure
  'schema-renamed': { headline: 'A component schema was renamed', intro: 'A schema under `components.schemas` has a new name but the same shape. Nothing changes on the wire.' },
  'enum-name-changed': { headline: 'Enum constant names changed', intro: 'The `x-enum-varnames` or the enum’s type name changed. Values on the wire are the same; generated constant names are not.' },
  'inline-ref-equivalent': { headline: 'An inline schema moved to a $ref', intro: 'An inline subschema was replaced by a `$ref` to a component with the same shape. Clients see no difference.' },
  'conditional-schema-changed': { headline: 'A conditional schema changed', intro: 'An `if`/`then`/`else` or a `dependentSchemas` entry changed. The spec alone cannot tell whether it now allows more or less.' },
  'discriminator-property-changed': { headline: 'The discriminator property was renamed', intro: 'The `discriminator.propertyName` that picks a `oneOf`/`anyOf` variant changed, so payloads that set the old property no longer select one.' },
  'discriminator-mapping-changed': { headline: 'A discriminator value was removed or repointed', intro: 'A value in the discriminator `mapping` is gone or now points at another schema, in requests or responses.' },
  'request-discriminator-mapping-added': { headline: 'A request accepts a new discriminator value', intro: 'A value was added to the discriminator `mapping` of a request schema. Clients may send the new variant; old requests still validate.' },
  'response-discriminator-mapping-added': { headline: 'A response can carry a new discriminator value', intro: 'A value was added to the discriminator `mapping` of a response schema. Clients that switch on it without a default case may not handle it.' },
  'discriminator-presence-changed': { headline: 'A discriminator was added or removed', intro: 'The `oneOf`/`anyOf` variants are the same, but a `discriminator` now tells them apart, or no longer does.' },
  'property-deprecated': { headline: 'A property was marked deprecated', intro: 'A schema property now has `deprecated: true`. It still works, and the changelog lists it under Deprecated.' },
  // Security
  'security-added-to-open-operation': { headline: 'An open endpoint now requires authentication', intro: 'An operation that had no security requirement now requires one, directly or inherited from the root.' },
  'security-scheme-added-to-operation': { headline: 'An endpoint requires another authentication scheme', intro: 'An operation’s security requirement gained a scheme that clients must now send as well.' },
  'security-scope-added': { headline: 'An endpoint requires a new OAuth scope', intro: 'An operation now needs an OAuth scope that existing tokens were not issued with.' },
  'security-requirement-removed': { headline: 'An authentication option was removed', intro: 'An operation no longer accepts one of the security requirements clients authenticate with today.' },
  'security-scheme-transport-changed': { headline: 'A security scheme changed how credentials are sent', intro: 'A security scheme’s type, API key name or location, HTTP scheme or OpenID URL changed.' },
  'security-flow-url-changed': { headline: 'An OAuth token or authorization URL moved', intro: 'The token, authorization or refresh URL of an OAuth flow now points at a different host.' },
  'security-removed-from-operation': { headline: 'An operation no longer requires authentication', intro: 'An operation that required credentials now accepts calls without them. Nothing breaks, so it is safe, but it is always shown in the Security area for review.' },
  // Deprecation, sunset and versioning
  'sunset-date-moved-earlier': { headline: 'A sunset date was moved earlier', intro: 'The `x-sunset` date of a deprecated item is now sooner than it was, so clients have less time to move.' },
  'sunset-date-removed': { headline: 'A sunset date was removed', intro: 'A deprecated item lost its `x-sunset` date, so clients no longer know when it goes away.' },
  'sunset-inside-grace-period': { headline: 'A sunset date is inside the grace period', intro: 'An item’s `x-sunset` date is closer than the grace period your rules allow (90 days by default).' },
  'version-bump-missing': { headline: 'A breaking change shipped without a major version bump', intro: 'The spec has breaking changes but `info.version` did not get a major bump (below 1.0.0, a minor bump).' },
  // Servers, webhooks, other
  'server-url-changed': { headline: 'A server URL changed', intro: 'A base URL in `servers` changed or was removed, so clients built from the spec call a different host.' },
  'webhook-removed': { headline: 'A webhook was removed', intro: 'A webhook clients subscribe to is no longer in the spec’s `webhooks`.' },
  'webhook-payload-property-removed': { headline: 'A webhook payload property was removed', intro: 'A property in the payload your API sends to subscribers is gone.' },
  'callback-payload-property-removed': { headline: 'A callback payload property was removed', intro: 'A property in the callback request your API sends to clients is gone, whether it was required or optional.' },
  'callback-changed': { headline: 'A callback changed', intro: 'A callback request or response changed. The request and response rules apply to it with their direction reversed.' },
  'extension-changed': { headline: 'An x- extension value changed', intro: 'The value of a vendor extension (`x-*`) changed. This rule is off by default.' },
  // Descriptions and examples
  'description-changed': { headline: 'A description was reworded', intro: 'A `description` on an operation, parameter, schema or property has new text.' },
  'summary-changed': { headline: 'An operation summary was reworded', intro: 'An operation’s one-line `summary`, shown in docs and as the SDK method comment, has new text.' },
  'example-changed': { headline: 'An example was updated', intro: 'An `example` or `examples` value changed. Docs and mock servers show the new one.' },
};
