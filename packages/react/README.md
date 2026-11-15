# @specdiff/react

React components for Specdiff: `<SpecdiffViewer>` fetches one or two OpenAPI files and renders the version-aware Viewer; `<SpecdiffDiff>` renders a side-by-side text diff. `@specdiff/core` (the parser and comparison engine) is loaded lazily, so the reference renders before it arrives.

Nothing is uploaded. Specs are fetched by the reader's browser and parsed in the page.

## Install

```sh
npm install @specdiff/react @specdiff/viewer @specdiff/core react@19 react-dom@19
```

## Usage

```tsx
import '@specdiff/viewer/styles.css'; // once: tokens and fonts
import { SpecdiffViewer, SpecdiffDiff } from '@specdiff/react';

export function ApiDocs() {
  return <SpecdiffViewer url="/openapi.yaml" compareWith="/openapi-1.5.yaml" theme="system" />;
}

export function ConfigDiff() {
  return <SpecdiffDiff before={'a: 1\nb: 2\n'} after={'a: 1\nb: 3\n'} label="Config changes" />;
}
```

`compareWith` adds change badges (New, Changed, Breaking, Deprecated), endpoint history and "What changed". Routes live in the URL hash, so the component works on any route of your app.

The published build puts the `SpecdiffDiff` styles in `@specdiff/react/styles.css`.

## API

`<SpecdiffViewer>` props:

| Prop | |
|---|---|
| `url` | Required. Spec URL, YAML or JSON |
| `compareWith` | Older version URL |
| `theme` | `'light' \| 'dark' \| 'system'` |
| `brand` | `{ color?, logo?, name? }` |
| `basePath` | Prefix inside the URL hash |
| `tryIt` | Show Try it (default `true`) |
| `corsProxy` | CORS proxy for Try it |
| `compare` | Your own comparison function; defaults to `compareOpenApi` from `@specdiff/core` |
| `className` | |

`<SpecdiffDiff>` props: `before`, `after`, `label` (accessible name of the table, default "Differences"), `className`. Added, removed and changed lines carry `+`, `−` and `~`, never colour alone.

Also exported:

- `fetchVersion(url, core, fetch?)`: fetch and parse one version; returns a `ViewerVersion` with a `cors`, `http` or `parse` error instead of throwing.
- `parseWith(core, text, name)`: parse a spec, upgrading Swagger 2.0.
- `Viewer` and its types (`Brand`, `CompareFn`, `ThemeSetting`, `VersionSet`, `ViewerProps`, `ViewerVersion`), re-exported from `@specdiff/viewer`. Use `Viewer` for a full timeline from the `versions.json` that `npx specdiff-cli history` writes.

## Licence

MIT
