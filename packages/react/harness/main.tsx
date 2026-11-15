// PK-03 e2e harness (e2e/coverage-web-vw-pk.spec.ts): renders the real @specdiff/react components in a
// browser. Loaded by the Viewer harness dev server (port 5174) through /@fs, from a page the test serves.
// ?part=viewer (default): <SpecdiffViewer url compareWith /> on the payments sample (v1.5.0 → v2.0.0).
// ?part=diff: <SpecdiffDiff before after /> on two short texts.
import '../../viewer/src/styles.css';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { SpecdiffDiff, SpecdiffViewer } from '../src/index';

const q = new URLSearchParams(location.search);
// One literal URL per file: Vite rewrites `new URL(literal, import.meta.url)` to the served file.
const v1 = new URL('../../../fixtures/samples/payments-v1.yaml', import.meta.url).href;
const v2 = new URL('../../../fixtures/samples/payments-v2.yaml', import.meta.url).href;
const root = createRoot(document.getElementById('root')!);

if (q.get('part') === 'diff') {
  root.render(createElement(SpecdiffDiff, { before: 'alpha\nbeta\ngamma\n', after: 'alpha\nbeta two\ngamma\ndelta\n', label: 'Sample diff' }));
} else {
  root.render(
    createElement(SpecdiffViewer, {
      url: v2,
      compareWith: v1,
      theme: (q.get('theme') ?? 'light') as 'light' | 'dark',
    }),
  );
}
