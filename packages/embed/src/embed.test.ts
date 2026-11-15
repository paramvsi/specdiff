import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadVersion, parseSpecText } from './load';
import { mount } from './index';

afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });

const yaml = `openapi: 3.0.3
info: { title: Pets, version: 1.0.0 }
paths:
  /pets:
    get: { summary: List pets, responses: { '200': { description: OK } } }
`;

describe('@specdiff/embed', () => {
  it('parses YAML and JSON', () => {
    expect(parseSpecText(yaml)).toMatchObject({ info: { version: '1.0.0' } });
    expect(parseSpecText('{"openapi":"3.1.0"}')).toEqual({ openapi: '3.1.0' });
    expect(() => parseSpecText('- a\n- b')).toThrow('does not contain an object');
  });

  it('reports CORS, HTTP and parse failures as load errors', async () => {
    expect((await loadVersion('https://s.example.com/a.yaml', async () => { throw new TypeError('x'); })).error?.kind).toBe('cors');
    expect((await loadVersion('https://s.example.com/a.yaml', async () => new Response('', { status: 404 }))).error).toMatchObject({ kind: 'http' });
    expect((await loadVersion('https://s.example.com/a.yaml', async () => new Response('a: [')))).toMatchObject({ error: { kind: 'parse' } });
  });

  it('mounts the Viewer into an element', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(yaml));
    const el = document.createElement('div');
    document.body.appendChild(el);
    const m = mount(el, { url: 'https://s.example.com/pets.yaml' });
    await vi.waitFor(() => expect(el.querySelector('h1')?.textContent).toBe('Pets'));
    m.unmount();
    expect(el.innerHTML).toBe('');
  });
});
