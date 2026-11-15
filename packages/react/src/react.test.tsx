import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
const el = () => document.body;
function render(node: ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
}
const cleanup = () => { if (root) act(() => root!.unmount()); root = undefined; document.body.innerHTML = ''; };
import { SpecdiffDiff } from './SpecdiffDiff';
import { SpecdiffViewer, fetchVersion } from './SpecdiffViewer';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const yaml = `openapi: 3.0.3
info: { title: Pets, version: 1.0.0 }
paths:
  /pets:
    get: { summary: List pets, responses: { '200': { description: OK } } }
`;

describe('@specdiff/react', () => {
  it('SpecdiffDiff marks added and removed lines with symbols, not colour alone', () => {
    render(<SpecdiffDiff before={'a\nb\n'} after={'a\nc\nd\n'} />);
    const table = el().querySelector('table[aria-label="Differences"]')!;
    expect(table.textContent).toContain('~');
    expect(el().querySelector('p')!.textContent).toMatch(/^\+\d+ added · −\d+ removed · ~\d+ changed$/);
  });

  it('SpecdiffDiff says when inputs are identical', () => {
    render(<SpecdiffDiff before="x" after="x" />);
    expect(el().textContent).toBe('The two inputs are identical.');
  });

  it('fetchVersion parses YAML and turns a blocked fetch into a CORS error', async () => {
    const core = await import('@specdiff/core');
    const ok = await fetchVersion('https://specs.example.com/pets.yaml', core, async () => new Response(yaml));
    expect(ok).toMatchObject({ label: '1.0.0', source: 'pets.yaml' });
    const blocked = await fetchVersion('https://specs.example.com/pets.yaml', core, async () => { throw new TypeError('Failed to fetch'); });
    expect(blocked.error).toEqual({ kind: 'cors', message: 'The browser could not read pets.yaml.', host: 'specs.example.com' });
  });

  it('SpecdiffViewer loads a spec URL and renders the overview', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(yaml));
    render(<SpecdiffViewer url="https://specs.example.com/pets.yaml" />);
    await vi.waitFor(() => expect(el().querySelector('h1')?.textContent).toBe('Pets'), { timeout: 5000 });
  });
});
