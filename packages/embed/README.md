# @specdiff/embed

The Specdiff Viewer as one script tag. Load the script and stylesheet, call `Specdiff.mount()`, and any page gets a version-aware API reference: search, code samples, Try it, and change badges when you give it an older version to compare with. React is bundled in; your page needs no framework.

Nothing is uploaded. The reader's browser fetches the spec files from the URLs you give and renders them.

## Install

```sh
npm install @specdiff/embed
```

Or build it from this repository: `pnpm --filter @specdiff/embed build` writes `packages/embed/dist/`.

## Host these files side by side

Copy everything in `dist/` to one folder on your site:

| File | |
|---|---|
| `specdiff-embed.js` | The Viewer. Defines the global `Specdiff` |
| `specdiff-embed.css` | Styles and design tokens |
| `specdiff-compare.js` | The comparison engine. Loaded on demand, only when you pass `compareWith` (and for Swagger 2.0 specs) |
| `fonts/` | Geist and Geist Mono, referenced from the CSS |

`specdiff-compare.js` is loaded from the same folder as `specdiff-embed.js`. If it is missing, the Viewer still renders and says that change badges are off.

## Usage

```html
<link rel="stylesheet" href="/specdiff/specdiff-embed.css" />
<div id="api"></div>
<script src="/specdiff/specdiff-embed.js"></script>
<script src="/docs.js"></script>
```

```js
// docs.js
Specdiff.mount(document.getElementById('api'), {
  url: '/openapi.yaml',
  compareWith: '/openapi-1.5.yaml',
  theme: 'system',
  brand: { name: 'Acme', color: '#1f55c4', logo: '/logo.svg' },
});
```

Keep the `mount` call in a file, not an inline script, and the page works with a strict Content Security Policy (`script-src 'self'`).

## `Specdiff.mount(element, options)`

| Option | Type | |
|---|---|---|
| `url` | `string` | Required. The spec to show, YAML or JSON |
| `compareWith` | `string` | An older version. Turns on change badges, history and "What changed" |
| `mode` | `'reference' \| 'changes'` | `reference` (default) opens the overview; `changes` opens "What changed" |
| `theme` | `'light' \| 'dark' \| 'system'` | Default `system` |
| `brand` | `{ color?, logo?, name? }` | Primary colour, logo URL, company name |
| `basePath` | `string` | Prefix inside the URL hash, for pages that use the hash themselves |
| `tryIt` | `boolean` | Show Try it. Default `true` |
| `corsProxy` | `string` | A CORS proxy for Try it. `{url}` is replaced by the encoded target URL |

It returns `{ unmount() }`. It throws if the element or `url` is missing. Swagger 2.0 files are upgraded to OpenAPI 3.1 for display.

The files are fetched by the browser, so a spec on another origin must allow CORS. If a load fails, the Viewer says why and offers to try again.

## Licence

MIT. Geist and Geist Mono are under the SIL Open Font License.
