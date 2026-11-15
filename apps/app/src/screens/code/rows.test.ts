// A-09 structural rows (round 3): moved rows, rename folds, CD-06 fold labels.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { diffCode, initRuntime, loadLanguage, type CodeDiff, type CodeLang } from '@specdiff/core/code';
import type { Language } from 'web-tree-sitter';
import { beforeAll, describe, expect, it } from 'vitest';
import { samples } from '../../lib/samples';
import { formattingReason, structuralRows, type CodeRow } from './rows';

const req = createRequire(import.meta.url);
const wasm = (pkg: string, file: string) => new Uint8Array(readFileSync(req.resolve(`${pkg}/${file}`)));
const langs = {} as Record<CodeLang, Language>;
beforeAll(async () => {
  await initRuntime(undefined, wasm('web-tree-sitter', 'web-tree-sitter.wasm'));
  langs.java = await loadLanguage('java', async () => wasm('tree-sitter-java', 'tree-sitter-java.wasm'));
  langs.typescript = await loadLanguage('typescript', async () => wasm('tree-sitter-typescript', 'tree-sitter-typescript.wasm'));
});

const rowsFor = (a: string, b: string, l: CodeLang, opts = { hideRenames: true, hideComments: false }) =>
  structuralRows(diffCode(a, b, l, langs[l]) as CodeDiff, a, b, opts);
const sample = samples().find((s) => s.id === 'code')!;
const text = (v: CodeRow) => (v.kind === 'moved' ? v.segs.map((s) => s.text).join('') : v.kind === 'row' ? (v.row.right ?? v.row.left)!.segs.map((s) => s.text).join('') : v.reason);

describe('structuralRows on the A-09 sample', () => {
  it('renders validateCurrency as five moved rows at lines 13–17, from line 33', () => {
    const v = rowsFor(sample.before.content, sample.after.content, 'java');
    const moved = v.filter((x) => x.kind === 'moved');
    expect(moved.map((m) => [m.n, m.from, m.first])).toEqual([[13, 33, true], [14, 34, false], [15, 35, false], [16, 36, false], [17, 37, false]]);
    expect(v.some((x) => x.kind === 'row' && x.row.type !== 'same' && text(x).includes('validateCurrency(String'))).toBe(false);
  });
  it('folds the renamed lines (old and new) while "Hide renames" is on, shows both when off', () => {
    const on = rowsFor(sample.before.content, sample.after.content, 'java');
    expect(on.filter((x) => x.kind === 'fold').map((x) => text(x))).toEqual(['3 lines with renamed names, no logic change', '1 line with renamed names, no logic change', '12 lines reformatted, no logic change']);
    expect(on.some((x) => x.kind === 'row' && /\bamt\b/.test(text(x)))).toBe(false);
    const off = rowsFor(sample.before.content, sample.after.content, 'java', { hideRenames: false, hideComments: false });
    const change = off.filter((x) => x.kind === 'row' && x.row.type === 'change');
    expect(change.map((x) => x.kind === 'row' && [x.row.left!.n, x.row.right!.n])).toEqual([[14, 20], [20, 26], [21, 27], [22, 28], [24, 30]]);
  });
  it('keeps the file in after order with every after line once', () => {
    const v = rowsFor(sample.before.content, sample.after.content, 'java', { hideRenames: false, hideComments: false });
    const after = v.flatMap((x) => (x.kind === 'moved' ? [x.n] : x.kind === 'row' ? (x.row.right ? [x.row.right.n] : []) : x.rows.flatMap((r) => (r.right ? [r.right.n] : []))));
    expect(after).toEqual(Array.from({ length: 49 }, (_, k) => k + 1));
  });
});

describe('CD-06 fold labels', () => {
  const a = 'export function pay(a: number) {\n  // old\n  return a + 1;\n}\n', b = a.replace('old', 'new');
  it('comment-only changes show as rows unless hidden, then fold as "only comments changed"', () => {
    expect(rowsFor(a, b, 'typescript').filter((x) => x.kind === 'fold')).toEqual([]);
    expect(rowsFor(a, b, 'typescript', { hideRenames: true, hideComments: true }).filter((x) => x.kind === 'fold').map(text)).toEqual(['1 line, only comments changed']);
  });
  it('names the kind of hidden edit', () => {
    expect(formattingReason(14, ['whitespace'])).toBe('14 lines reformatted, no logic change');
    expect(formattingReason(1, ['number-literal', 'trailing-comma'])).toBe('1 line: number base, trailing comma changed, no logic change');
    expect(formattingReason(2, ['semicolon'])).toBe('2 lines: semicolons changed, no logic change');
    expect(formattingReason(3, ['keyword-argument-order'])).toBe('3 lines: keyword order changed, no logic change');
  });
  it('a call site of a renamed function folds with the renames (CD-03)', () => {
    const v = rowsFor('function f() { return 1 }\nfunction h() { return f() }\n', 'function ff() { return 1 }\nfunction h() { return ff() }\n', 'typescript');
    expect(v.filter((x) => x.kind === 'fold').map(text)).toEqual(['2 lines with renamed names, no logic change']);
  });
});
