# @specdiff/viewer

The Specdiff Viewer as a React component: a version-aware API reference and a Swagger UI replacement. It renders an OpenAPI document with search, code samples and Try it. Give it two or more versions and it adds change badges (New, Changed, Breaking, Deprecated), a per-endpoint history and a "What changed" view.

Most people use it through [`@specdiff/react`](../react/README.md) (fetches the files for you) or [`@specdiff/embed`](../embed/README.md) (one script tag). Use this package directly when you already have the parsed specs, for example the `versions.json` that `specdiff history` writes.

Nothing is uploaded. Specs are rendered in the browser. Try it sends requests from the reader's browser straight to your API, or through a CORS proxy only if you set one.

## Install

```sh
npm install @specdiff/viewer @specdiff/core react@19 react-dom@19
```

## Usage

```tsx
import '@specdiff/viewer/styles.css';
import { Viewer, type VersionSet } from '@specdiff/viewer';
import { compareOpenApi, parseDocument } from '@specdiff/core';
import versions from './versions.json'; // from: npx specdiff-cli history openapi.yaml --out versions.json

export function ApiDocs() {
  return (
    <Viewer
      versions={versions as VersionSet}
      compare={(before, after) => compareOpenApi(before, after)}
      parseSpec={(text, name) => parseDocument(text, name).value as object}
      theme="system"
      brand={{ name: 'Acme', color: '#1f55c4', logo: '/logo.svg' }}
    />
  );
}
```

A `VersionSet` is `{ versions: [{ label, source, date?, spec?, error? }], current, compareWith? }`. Routes live in the URL hash (`#/op/…`, `#/schema/…`, `#/changes`).

## `Viewer` props

| Prop | Type | |
|---|---|---|
| `versions` | `VersionSet` | Required. The versions to show and which is current |
| `compare` | `(before, after) => Report \| Promise<Report>` | Turns on change badges and "What changed". Pass `compareOpenApi` from `@specdiff/core` |
| `theme` | `'light' \| 'dark' \| 'system'` | Default `system` |
| `brand` | `{ color?, logo?, name? }` | Primary colour, logo URL, company name before the API title |
| `basePath` | `string` | Prefix inside the hash, for pages that use the hash themselves |
| `tryIt` | `boolean` | Show Try it. Default `true` |
| `corsProxy` | `string` | Reader-supplied CORS proxy. `{url}` is replaced by the encoded target URL |
| `parseSpec` | `(text, name) => object` | Parses a file the reader adds. JSON works without it |
| `onRetry` | `(label) => void` | "Try again" on a version that failed to load |
| `compareUnavailableReason` | `string` | Note shown in "What changed" when there is no `compare` |
| `className` | `string` | |

## Other exports

`buildModel`, `search`, `deref`, `typeLabel`, `METHODS` (the reference model); `sample`, `exampleFor`, `buildUrl` (code samples); `indexChanges`, `checklist` (change index); `checkSchema`, `requestIssues` (Try it request checks); and the types `Brand`, `CompareFn`, `CompareInput`, `LoadError`, `ThemeSetting`, `VersionSet`, `ViewerProps`, `ViewerVersion`.

## Licence

MIT
