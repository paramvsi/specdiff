# @specdiff/react example

```bash
npm install @specdiff/react @specdiff/viewer @specdiff/core react@19 react-dom@19
```

See [`App.tsx`](./App.tsx):

- `<SpecdiffViewer url compareWith? theme? brand? basePath? tryIt? corsProxy? compare? />` fetches one or two
  OpenAPI 3.x files (YAML or JSON), loads `@specdiff/core` lazily for parsing and comparison, and renders the
  version-aware Viewer. Routes live in the URL hash (`#/op/…`, `#/schema/…`, `#/changes`), so it works on any
  route of your app; pass `basePath` if your page uses the hash itself.
- `<SpecdiffDiff before after />` renders a side-by-side text diff from `@specdiff/core/text`. Added, removed and
  changed lines carry `+`, `−` and `~`, never colour alone.
- Import `@specdiff/viewer/styles.css` once for the design tokens and fonts. Light and dark follow
  `theme` (`'light' | 'dark' | 'system'`); `brand.color` sets the primary button and selection colour.

Try it sends requests from the reader's browser. If your API does not allow your docs origin (CORS), the Viewer
explains how to fix it and lets the reader set their own CORS proxy; Specdiff does not run one.
