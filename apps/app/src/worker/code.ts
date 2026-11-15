// Code mode in the worker (CD-01..CD-05). Runtime and grammars load on first use, one language at a time.
import type { CodeLang, CodeOutcome } from '@specdiff/core/code';
import runtimeUrl from 'web-tree-sitter/web-tree-sitter.wasm?url';

const GRAMMARS: Record<CodeLang, () => Promise<{ default: string }>> = {
  typescript: () => import('tree-sitter-typescript/tree-sitter-typescript.wasm?url'),
  tsx: () => import('tree-sitter-typescript/tree-sitter-tsx.wasm?url'),
  javascript: () => import('tree-sitter-javascript/tree-sitter-javascript.wasm?url'),
  java: () => import('tree-sitter-java/tree-sitter-java.wasm?url'),
  python: () => import('tree-sitter-python/tree-sitter-python.wasm?url'),
};

export async function compareCode(beforeName: string, afterName: string, before: string, after: string): Promise<{ language?: CodeLang; outcome: CodeOutcome }> {
  const core = await import('@specdiff/core/code');
  const language = core.languageFor(afterName) ?? core.languageFor(beforeName);
  if (!language) return { outcome: { fallback: 'unsupported' } };
  await core.initRuntime(() => runtimeUrl);
  const lang = await core.loadLanguage(language, async () => (await GRAMMARS[language]()).default);
  return { language, outcome: core.diffCode(before, after, language, lang) };
}
