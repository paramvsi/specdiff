// CD-03 / CD-06 audit defects.
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
  langs.java = await loadLanguage('java', async () => wasm('tree-sitter-java', 'tree-sitter-java.wasm'));
  langs.typescript = await loadLanguage('typescript', async () => wasm('tree-sitter-typescript', 'tree-sitter-typescript.wasm'));
  langs.python = await loadLanguage('python', async () => wasm('tree-sitter-python', 'tree-sitter-python.wasm'));
});

const run = (a: string, b: string, l: CodeLang) => diffCode(a, b, l, langs[l]) as CodeDiff;
const by = (d: CodeDiff) => Object.fromEntries(d.items.map((i) => [i.name, i.status]));

describe('CD-03 method rename', () => {
  it('is one rename, not also a false local rename on the class', () => {
    const d = run('class A {\n  int g() { return 1; }\n}\n', 'class A {\n  int gee() { return 1; }\n}\n', 'java');
    expect(by(d)).toEqual({ A: 'same', 'A.gee': 'renamed' });
    expect(d.items.find((i) => i.name === 'A')!.renames).toBeUndefined();
  });
  it('a call to the renamed method inside the class is explained by the rename', () => {
    const d = run('class A {\n  int g() { return 1; }\n  int h() { return g(); }\n}\n', 'class A {\n  int gee() { return 1; }\n  int h() { return gee(); }\n}\n', 'java');
    expect(by(d).A).toBe('same');
    expect(by(d)['A.gee']).toBe('renamed');
  });
});

describe('CD-06 hidden edits', () => {
  it('keeps a comment-only change when the same class also has a method rename', () => {
    const d = run('class A {\n  // old\n  int g() { return 1; }\n}\n', 'class A {\n  // new\n  int gee() { return 1; }\n}\n', 'java');
    expect(by(d)).toEqual({ A: 'comments', 'A.gee': 'renamed' });
  });
  it('flags a comment change next to a local rename', () => {
    const d = run('function f(a: number) {\n  // old\n  return a;\n}\n', 'function f(b: number) {\n  // new\n  return b;\n}\n', 'typescript');
    expect(d.items[0]).toMatchObject({ status: 'renamedLocals', commentsChanged: true });
  });
  it('tells whitespace-only reformatting from meaning-preserving edits', () => {
    const items = (a: string, b: string, l: CodeLang) => run(a, b, l).items.map((i) => [i.status, i.hiddenEdits]);
    expect(items('function f() { return 1 }\n', 'function f() {\n  return 1\n}\n', 'typescript')).toEqual([['formatting', ['whitespace']]]);
    expect(items('const f = () => g(16, 2)\n', 'const f = () => g(0x10, 2,)\n', 'typescript')).toEqual([['formatting', ['number-literal', 'trailing-comma']]]);
    expect(items('function f() { return 1 }\n', 'function f() { return 1; }\n', 'typescript')).toEqual([['formatting', ['semicolon']]]);
    expect(items('def f():\n    return g(a=1, b=2)\n', 'def f():\n    return g(b=2, a=1)\n', 'python')).toEqual([['formatting', ['keyword-argument-order']]]);
  });
});
