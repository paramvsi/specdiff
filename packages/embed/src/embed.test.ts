/// <reference types="node" />
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

  it('applies YAML merge keys, as the comparison engine does', () => {
    expect(parseSpecText('base: &b { type: object }\nPet:\n  <<: *b\n  title: Pet\n')).toEqual({ base: { type: 'object' }, Pet: { type: 'object', title: 'Pet' } });
  });

  it('shows a load error, not an endless spinner, when a Swagger 2.0 upgrade fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('swagger: "2.0"\ninfo: { title: Old, version: "1" }\npaths: {}\n'));
    (globalThis as { SpecdiffCompare?: unknown }).SpecdiffCompare = { compareOpenApi: () => ({}), upgradeSpec: () => { throw new Error('bad swagger'); } };
    const el = document.createElement('div');
    document.body.appendChild(el);
    const m = mount(el, { url: 'https://s.example.com/old.yaml' });
    await vi.waitFor(() => expect(el.textContent).toContain('bad swagger'));
    expect(el.querySelector('[aria-busy=true]')).toBeNull();
    m.unmount();
    delete (globalThis as { SpecdiffCompare?: unknown }).SpecdiffCompare;
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

describe('version labels', () => {
  it('labels an unquoted info.version 1.10 as 1.10, not 1.1', async () => {
    const v = await loadVersion('https://s.example.com/a.yaml', async () => new Response('openapi: 3.1.0\ninfo: {title: T, version: 1.10}\npaths: {}\n'));
    expect(v.label).toBe('1.10');
  });
});

describe('IN-09 a JSON spec with comments', () => {
  it('says JSON has no comments instead of folding the comment into a key', () => {
    expect(() => parseSpecText('{\n  // spec\n  "openapi": "3.1.0", "info": {"title": "T", "version": "1"}, "paths": {}\n}')).toThrow(/JSON has no comments/);
    expect(() => parseSpecText('{ /* c */ "openapi": "3.1.0" }')).toThrow(/JSON has no comments/);
    expect(() => parseSpecText('{"openapi": "3.1.0", // trailing\n "paths": {}}')).toThrow(/JSON has no comments/);
  });
  it('still reads YAML flow mappings that hold a URL', () => {
    expect(parseSpecText('{openapi: 3.1.0, servers: [{url: http://x.example}]}')).toMatchObject({ servers: [{ url: 'http://x.example' }] });
  });
});

describe('M-21 one loader: the embed reads and compares specs exactly as the app does', () => {
  it('the same two specs give an identical report through the app loader and the embed', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { compareOpenApi } = await import('@specdiff/core');
    const { compareInput } = await import('@specdiff/viewer');
    const dir = join(__dirname, '../../../fixtures/samples');
    const text = (f: string) => readFileSync(join(dir, f), 'utf8');
    const fetchFile = (async (url: string) => new Response(text(String(url).split('/').pop()!))) as typeof fetch;
    const app = compareOpenApi({ name: 'payments-v1.yaml', content: text('payments-v1.yaml') }, { name: 'payments-v2.yaml', content: text('payments-v2.yaml') });
    const [a, b] = await Promise.all([loadVersion('https://s.example/payments-v1.yaml', fetchFile), loadVersion('https://s.example/payments-v2.yaml', fetchFile)]);
    expect(compareOpenApi(compareInput(a!), compareInput(b!))).toEqual(app);
  });
  it("uses core's parser: duplicate JSON keys are an error, with the position", () => {
    expect(() => parseSpecText('{"openapi":"3.1.0","info":{"title":"A","title":"B","version":"1"}}')).toThrow(/:1:\d+ Map keys must be unique/);
  });
});
