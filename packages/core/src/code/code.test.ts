import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Language } from 'web-tree-sitter';
import { diffCode, initRuntime, loadLanguage, type CodeDiff, type CodeLang } from './diff';

const req = createRequire(import.meta.url);
const wasm = (pkg: string, file: string) => new Uint8Array(readFileSync(req.resolve(`${pkg}/${file}`)));
const langs = {} as Record<CodeLang, Language>;

beforeAll(async () => {
  await initRuntime(undefined, wasm('web-tree-sitter', 'web-tree-sitter.wasm'));
  langs.typescript = await loadLanguage('typescript', async () => wasm('tree-sitter-typescript', 'tree-sitter-typescript.wasm'));
  langs.python = await loadLanguage('python', async () => wasm('tree-sitter-python', 'tree-sitter-python.wasm'));
  langs.java = await loadLanguage('java', async () => wasm('tree-sitter-java', 'tree-sitter-java.wasm'));
  langs.javascript = await loadLanguage('javascript', async () => wasm('tree-sitter-javascript', 'tree-sitter-javascript.wasm'));
});

const run = (a: string, b: string, l: CodeLang) => diffCode(a, b, l, langs[l]) as CodeDiff;
const by = (d: CodeDiff) => Object.fromEntries(d.items.map((i) => [i.name, i.status]));

describe('diffCode', () => {
  it('collapses formatting-only changes to "no logic change"', () => {
    const d = run('function pay(a: number) { return a + 1 }\n', 'function pay( a: number ) {\n  return a + 1;\n}\n', 'typescript');
    expect(by(d)).toEqual({ pay: 'formatting' });
    expect(d.logicChanged).toBe(false);
  });
  it('detects a logic change in the design sample', () => {
    const d = run("export async function pay(amount: number) {\n  return api.post('/v1/payments', { amount });\n}\n", "export async function pay(amount: number, currency = 'AED') {\n  return api.post('/v1/payments', { amount, currency });\n}\n", 'typescript');
    expect(by(d)).toEqual({ pay: 'changed' });
  });
  it('labels renames and moves', () => {
    const d = run('function a() { return 1 }\nfunction b() { return 2 }\nfunction c() { return 3 }\nfunction d() { return 4 }\n', 'function bee() { return 2 }\nfunction c() { return 3 }\nfunction d() { return 4 }\nfunction a() { return 1 }\n', 'javascript');
    expect(by(d)).toEqual({ a: 'moved', bee: 'renamed', c: 'same', d: 'same' });
    expect(d.items.find((i) => i.name === 'bee')!.from).toBe('b');
  });
  it('hides meaning-preserving edits: number base, trailing commas, keyword order', () => {
    expect(by(run('const f = () => g(16, 2)\n', 'const f = () => g(0x10, 2,)\n', 'typescript'))).toEqual({ f: 'formatting' });
    expect(by(run('def f():\n    return g(a=1, b=2)\n', 'def f():\n    return g(b=2, a=1)\n', 'python'))).toEqual({ f: 'formatting' });
  });
  it('separates comment-only changes', () => {
    expect(by(run('class A {\n  // old\n  int x() { return 1; }\n}\n', 'class A {\n  // new\n  int x() { return 1; }\n}\n', 'java'))).toEqual({ A: 'comments', 'A.x': 'same' });
  });
  it('qualifies methods and reports added/removed', () => {
    const d = run('class S:\n    def a(self):\n        pass\n', 'class S:\n    def a(self):\n        pass\n    def b(self):\n        return 1\n', 'python');
    expect(by(d)).toEqual({ S: 'changed', 'S.a': 'same', 'S.b': 'added' });
  });
  it('detects a consistent local rename inside a function (B-15)', () => {
    const d = run('class P {\n  int f(Req req) {\n    var amount = req.amount();\n    if (amount < 1) { return 0; }\n    return amount * 2;\n  }\n}\n', 'class P {\n  int f(Req req) {\n    var amt = req.amount();\n    if (amt < 1) { return 0; }\n    return amt * 2;\n  }\n}\n', 'java');
    expect(by(d)['P.f']).toBe('renamedLocals');
    expect(d.items.find((i) => i.name === 'P.f')!.renames).toEqual([{ from: 'amount', to: 'amt', uses: 3 }]);
    expect(d.logicChanged).toBe(false);
  });
  it('a rename that collides with an existing name is a logic change', () => {
    const d = run('function f(a, b) { return a + b }\n', 'function f(a, b) { return b + b }\n', 'javascript');
    expect(by(d).f).toBe('changed');
  });
  it('falls back on parse errors with the line', () => {
    expect(diffCode('function a() {}', 'function a( {\n}\n', 'typescript', langs.typescript)).toMatchObject({ fallback: 'parse-error', side: 'after' });
  });
});
