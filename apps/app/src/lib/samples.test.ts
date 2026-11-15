// The samples reach the designed states (A-07, A-08, A-09): checked through the same engine the app runs.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Config } from '@specdiff/core';
import { diffCode, initRuntime, loadLanguage, type CodeDiff } from '@specdiff/core/code';
import { diffJson } from '@specdiff/core/json';
import { diffMarkdown } from '@specdiff/core/markdown';
import { describe, expect, it } from 'vitest';
import { samples, SAMPLE_JSON_IGNORE_KEYS } from './samples';

const get = (id: string) => samples().find((s) => s.id === id)!;

describe('samples', () => {
  it('keeps the sample ids', () => {
    expect(samples().map((s) => s.id)).toEqual(['openapi', 'json', 'markdown', 'code', 'text']);
  });

  it('JSON (A07-JsonTree): keyed array, move, type change, null vs missing, 7 differences', () => {
    const s = get('json');
    const o = Config.parse({ json: { ignoreKeys: SAMPLE_JSON_IGNORE_KEYS } }).json;
    const d = diffJson(JSON.parse(s.before.content), JSON.parse(s.after.content), o);
    expect(d.matchKeys).toEqual({ '$.flags[*]': 'key' });
    expect(d.stats).toMatchObject({ added: 1, changed: 2, moved: 1, typeChanged: 1 });
    // beta_banner removed, plus rollout.region null → missing (counted on its own where core supports it).
    expect(d.changes.filter((c) => c.kind === 'removed')).toHaveLength(2);
    expect(d.changes.find((c) => c.kind === 'moved')).toMatchObject({ before: 3, after: 11 });
    expect(d.changes.find((c) => c.jsonPath === '$.rollout.region')).toMatchObject({ kind: 'removed', before: null });
    expect(d.changes).toHaveLength(7);
  });

  it('Markdown (AMarkdown): broken anchor, changed links, a changed code block, a table', () => {
    const s = get('markdown');
    const md = diffMarkdown(s.before.content, s.after.content);
    expect(md.brokenAnchors.map((a) => a.anchor)).toContain('environment-variables');
    expect(md.blocks.flatMap((b) => b.links ?? []).length).toBe(2);
    expect(md.blocks.some((b) => b.code && b.status === 'edited')).toBe(true);
    expect(md.blocks.some((b) => b.type === 'table' && b.status === 'edited')).toBe(true);
    expect(md.stats.added).toBeGreaterThan(0);
    expect(md.stats.removed).toBeGreaterThan(0);
  });

  it('Code (A-09): a logic change, a move, a local rename amount → amt and a reformatted method', async () => {
    const req = createRequire(import.meta.url);
    const wasm = (pkg: string, file: string) => new Uint8Array(readFileSync(req.resolve(`${pkg}/${file}`)));
    await initRuntime(undefined, wasm('web-tree-sitter', 'web-tree-sitter.wasm'));
    const java = await loadLanguage('java', async () => wasm('tree-sitter-java', 'tree-sitter-java.wasm'));
    const s = get('code');
    const d = diffCode(s.before.content, s.after.content, 'java', java) as CodeDiff;
    const by = Object.fromEntries(d.items.map((i) => [i.name, i]));
    expect(by['PaymentService.create']?.status).toBe('changed');
    expect(by['PaymentService.validateCurrency']?.status).toBe('moved');
    expect(by['PaymentService.checkAmount']?.status).toBe('renamedLocals');
    expect(by['PaymentService.checkAmount']?.renames).toEqual([{ from: 'amount', to: 'amt', uses: 4 }]);
    expect(by['PaymentService.refund']?.status).toBe('formatting');
  });
});
