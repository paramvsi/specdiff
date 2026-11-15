// Test harness for the Viewer (e2e/viewer.spec.ts). Served by `vite packages/viewer/harness --port 5174`.
// Scenarios via query string: ?spec=payments (default, v1 → v2) | petstore | swagger2 | load-error,
// plus &theme=light|dark and &brand=1 (V06 embedded look).
import '../src/styles.css';
import { compareOpenApi, parseDocument } from '@specdiff/core';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import paymentsV1 from '../../../fixtures/samples/payments-v1.yaml?raw';
import paymentsV2 from '../../../fixtures/samples/payments-v2.yaml?raw';
import petstore from '../../../fixtures/specs/petstore-3.0.yaml?raw';
import { upgradeSpec } from '@specdiff/core';
import swagger2 from '../../../fixtures/specs/petstore-swagger2.json?raw';
import { Viewer } from '../src/Viewer';
import type { VersionSet } from '../src/types';

const parse = (text: string, name: string) => parseDocument(text, name).value as object;
const q = new URLSearchParams(location.search);
const scenario = q.get('spec') ?? 'payments';
const theme = (q.get('theme') ?? 'light') as 'light' | 'dark';

const sets: Record<string, VersionSet> = {
  payments: {
    versions: [
      { label: '1.5.0', source: 'git tag v1.5.0', date: '2026-09-01', spec: parse(paymentsV1, 'payments-v1.yaml') },
      { label: '2.0.0', source: 'openapi.yaml · main', date: '2026-11-01', spec: parse(paymentsV2, 'payments-v2.yaml') },
    ],
    current: '2.0.0',
    compareWith: '1.5.0',
  },
  petstore: { versions: [{ label: '1.0.0', source: 'petstore-3.0.yaml', spec: parse(petstore, 'petstore-3.0.yaml') }], current: '1.0.0' },
  'swagger2-raw': { versions: [{ label: '1.0.0', source: 'petstore-swagger2.json', spec: JSON.parse(swagger2) as object }], current: '1.0.0' },
  // What the embed, React wrapper and app do: upgrade Swagger 2.0 with core before rendering.
  swagger2: { versions: [{ label: '1.0.0', source: 'petstore-swagger2.json', spec: upgradeSpec(JSON.parse(swagger2) as object) }], current: '1.0.0' },
  'load-error': {
    versions: [
      { label: '1.5.0', source: 'openapi-1.5.0.yaml', error: { kind: 'cors', message: 'Blocked', host: 'specs.acme.dev' } },
      { label: '2.0.0', source: 'openapi.yaml', spec: parse(paymentsV2, 'payments-v2.yaml') },
    ],
    current: '2.0.0',
    compareWith: '1.5.0',
  },
};

createRoot(document.getElementById('root')!).render(
  createElement(Viewer, {
    versions: sets[scenario] ?? sets.payments!,
    compare: (a, b) => compareOpenApi(a, b, undefined, { today: '2026-11-15' }),
    theme,
    parseSpec: parse,
    onRetry: () => undefined,
    ...(q.get('brand') ? { brand: { name: 'Acme', color: '#1f55c4', ...(q.get('logo') ? { logo: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22%3E%3Crect width=%2220%22 height=%2220%22 rx=%224%22 fill=%22%231f55c4%22/%3E%3C/svg%3E' } : {}) } } : {}),
  }),
);
