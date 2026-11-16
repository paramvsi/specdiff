import { describe, expect, it } from 'vitest';
import { prefetchRemoteRefs } from './remote';

const site: Record<string, string> = {
  'https://api.example/specs/common.yaml': "Card:\n  $ref: './card.yaml'\nOther:\n  $ref: 'https://cdn.other.example/money.yaml'\n",
  'https://api.example/specs/card.yaml': 'type: object\n',
  'https://cdn.other.example/money.yaml': 'type: string\n',
};
const fake = (async (url: string) => (site[String(url)] !== undefined ? new Response(site[String(url)]) : new Response('no', { status: 404 }))) as typeof fetch;
const spec = "paths: {}\ncomponents:\n  schemas:\n    Card:\n      $ref: 'https://api.example/specs/common.yaml#/Card'\n";

describe('M-1 remote $refs', () => {
  it('follows relative $refs inside a remote file on the same host; another host needs --allow-external-refs', async () => {
    const files: Record<string, string> = {};
    const r = await prefetchRemoteRefs([spec], files, { allowCrossHost: false, fetchImpl: fake });
    expect(Object.keys(files).sort()).toEqual(['https://api.example/specs/card.yaml', 'https://api.example/specs/common.yaml']);
    expect(r.skipped).toEqual(['https://cdn.other.example/money.yaml (another host; pass --allow-external-refs)']);
  });
  it('with --allow-external-refs, other hosts are fetched too', async () => {
    const files: Record<string, string> = {};
    await prefetchRemoteRefs([spec], files, { allowCrossHost: true, fetchImpl: fake });
    expect(Object.keys(files)).toContain('https://cdn.other.example/money.yaml');
  });
  it('stops at 50 files and at 25 MB in all', async () => {
    const many = (async (url: string) => new Response(`$ref: './f${Number(/f(\d+)/.exec(String(url))?.[1] ?? 0) + 1}.yaml'\n`)) as typeof fetch;
    const files: Record<string, string> = {};
    const r = await prefetchRemoteRefs(["$ref: 'https://api.example/f0.yaml'"], files, { allowCrossHost: false, fetchImpl: many });
    expect(Object.keys(files)).toHaveLength(50);
    expect(r.skipped.at(-1)).toMatch(/50 files/);
    const big = (async () => new Response('x'.repeat(13 * 1024 * 1024) + "\n$ref: './b.yaml'\n")) as typeof fetch;
    const f2: Record<string, string> = {};
    const r2 = await prefetchRemoteRefs(["$ref: 'https://api.example/a.yaml'"], f2, { allowCrossHost: false, fetchImpl: big });
    expect(Object.keys(f2)).toHaveLength(1);
    expect(r2.skipped.at(-1)).toMatch(/25 MB/);
  });
});

it('M-1: core resolves the relative $ref inside the fetched file, so nothing is left unresolved', async () => {
  const { compareOpenApi } = await import('@specdiff/core');
  const doc = "openapi: 3.1.0\ninfo: { title: T, version: '1' }\npaths:\n  /a:\n    get:\n      responses:\n        '200':\n          description: OK\n          content:\n            application/json:\n              schema:\n                $ref: 'https://api.example/specs/common.yaml#/Card'\n";
  const files: Record<string, string> = {};
  await prefetchRemoteRefs([doc], files, { allowCrossHost: false, fetchImpl: fake });
  const r = compareOpenApi({ name: 'a.yaml', content: doc, files }, { name: 'b.yaml', content: doc, files });
  expect(r.warnings ?? []).toEqual([]);
});
