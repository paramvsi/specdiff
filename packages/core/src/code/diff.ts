// Code mode (Beta; CD-01..CD-06): structure-aware diff with tree-sitter (WASM).
// Declarations are matched by qualified name; bodies are compared as normalised token streams.
import { Language, Parser, type Node } from 'web-tree-sitter';

export type CodeLang = 'typescript' | 'tsx' | 'javascript' | 'java' | 'python';
export type CodeStatus = 'same' | 'formatting' | 'comments' | 'changed' | 'added' | 'removed' | 'renamed' | 'moved';
export interface CodeItem {
  name: string;
  kind: string;
  status: CodeStatus;
  from?: string; // renamed from
  lines: { before?: [number, number]; after?: [number, number] };
  beforeText?: string;
  afterText?: string;
}
export interface CodeDiff {
  language: CodeLang;
  items: CodeItem[];
  stats: Record<CodeStatus, number>;
  logicChanged: boolean;
}
export type CodeOutcome = CodeDiff | { fallback: 'unsupported' | 'parse-error'; side?: 'before' | 'after'; line?: number };

/** Load the runtime once and a grammar per language (CD-05: the caller decides where the bytes come from). */
let ready: Promise<void> | undefined;
const languages = new Map<CodeLang, Promise<Language>>();
export function initRuntime(locateFile?: (name: string) => string, wasmBinary?: Uint8Array): Promise<void> {
  ready ??= Parser.init({ ...(locateFile ? { locateFile } : {}), ...(wasmBinary ? { wasmBinary } : {}) } as never);
  return ready;
}
export function loadLanguage(lang: CodeLang, source: () => Promise<string | Uint8Array>): Promise<Language> {
  let p = languages.get(lang);
  if (!p) { p = source().then((s) => Language.load(s)); languages.set(lang, p); }
  return p;
}

const DECL: Record<CodeLang, Record<string, string>> = {
  javascript: { function_declaration: 'function', generator_function_declaration: 'function', class_declaration: 'class', method_definition: 'method' },
  typescript: { function_declaration: 'function', class_declaration: 'class', abstract_class_declaration: 'class', method_definition: 'method', interface_declaration: 'interface', type_alias_declaration: 'type', enum_declaration: 'enum' },
  tsx: {},
  java: { class_declaration: 'class', interface_declaration: 'interface', enum_declaration: 'enum', record_declaration: 'record', method_declaration: 'method', constructor_declaration: 'constructor' },
  python: { function_definition: 'function', class_definition: 'class' },
};
DECL.tsx = DECL.typescript;
const CONTAINERS = new Set(['class_body', 'block', 'declaration_list', 'interface_body', 'enum_body', 'export_statement', 'decorated_definition', 'program', 'module']);

interface Decl { name: string; kind: string; node: Node; index: number; tokens: string[]; bodyTokens: string[]; comments: string[] }

function nameOf(n: Node): string | undefined {
  const named = n.childForFieldName('name');
  if (named) return named.text;
  // const foo = () => {}
  if (n.type === 'variable_declarator') return n.childForFieldName('name')?.text;
  return undefined;
}

function isArrowConst(n: Node): Node | undefined {
  if (n.type !== 'lexical_declaration' && n.type !== 'variable_declaration') return undefined;
  const d = n.namedChildren.find((c) => c?.type === 'variable_declarator');
  const v = d?.childForFieldName('value');
  return v && (v.type === 'arrow_function' || v.type === 'function_expression' || v.type === 'function') ? d ?? undefined : undefined;
}

const NUM = /^(0[xX][\da-fA-F_]+|0[oO][0-7_]+|0[bB][01_]+|[\d_]*\.?[\d_]+(?:[eE][+-]?\d+)?)[nNlL]?$/;
function normNumber(t: string): string {
  if (!NUM.test(t)) return t;
  const c = t.replace(/_/g, '').replace(/[nNlL]$/, '');
  const v = /^0[xXoObB]/.test(c) ? Number(c) : Number(c);
  return Number.isFinite(v) ? `#${v}` : t;
}

/** Leaf tokens in order, comments separated; meaning-preserving edits normalised (CD-06). */
function tokens(n: Node, lang: CodeLang, out: string[], comments: string[]): void {
  if (/comment/.test(n.type)) { comments.push(n.text.trim()); return; }
  // Python: keyword arguments can be reordered without changing meaning.
  if (lang === 'python' && n.type === 'argument_list' && n.namedChildren.length > 1 && n.namedChildren.every((c) => c?.type === 'keyword_argument')) {
    out.push('(');
    const parts = n.namedChildren.map((c) => { const t: string[] = []; tokens(c!, lang, t, comments); return t.join(' '); }).sort();
    out.push(parts.join(' , '), ')');
    return;
  }
  if (n.childCount === 0) {
    out.push(n.type === 'number' || n.type === 'integer' || n.type === 'float' || /literal$/.test(n.type) && NUM.test(n.text) ? normNumber(n.text) : n.text);
    return;
  }
  for (const c of n.children) if (c) tokens(c, lang, out, comments);
}

/** Optional trailing commas (any language) and semicolons (JS/TS, which insert them automatically). */
function dropOptional(t: string[], lang: CodeLang): string[] {
  const js = lang !== 'java' && lang !== 'python';
  return t.filter((tok, i) => !(tok === ',' && [')', ']', '}'].includes(t[i + 1] ?? '')) && !(js && tok === ';'));
}

function collect(root: Node, lang: CodeLang): { decls: Decl[]; module: { tokens: string[]; comments: string[]; text: string; lines: [number, number] } } {
  const decls: Decl[] = [];
  const kinds = DECL[lang];
  const moduleTokens: string[] = [], moduleComments: string[] = [], moduleText: string[] = [];
  const walk = (n: Node, prefix: string, top: boolean) => {
    for (const c of n.namedChildren) {
      if (!c) continue;
      const arrow = isArrowConst(c);
      const kind = kinds[c.type] ?? (arrow ? 'function' : undefined);
      if (kind) {
        const name = nameOf(arrow ?? c);
        if (name) {
          const full = prefix ? `${prefix}.${name}` : name;
          const t: string[] = [], cm: string[] = [];
          tokens(c, lang, t, cm);
          const toks = dropOptional(t, lang);
          const nameTok = name;
          decls.push({ name: full, kind, node: c, index: decls.length, tokens: toks, bodyTokens: toks.map((x) => (x === nameTok ? '\u0000name' : x)), comments: cm });
          const body = c.childForFieldName('body');
          if (body) walk(body, full, false);
          continue;
        }
      }
      if (CONTAINERS.has(c.type)) { walk(c, prefix, top); continue; }
      if (top) { tokens(c, lang, moduleTokens, moduleComments); moduleText.push(c.text); }
    }
  };
  walk(root, '', true);
  return { decls, module: { tokens: dropOptional(moduleTokens, lang), comments: moduleComments, text: moduleText.join('\n'), lines: [root.startPosition.row + 1, root.endPosition.row + 1] } };
}

const eq = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const lines = (n: Node): [number, number] => [n.startPosition.row + 1, n.endPosition.row + 1];

export function diffCode(before: string, after: string, lang: CodeLang, language: Language): CodeOutcome {
  const parser = new Parser();
  parser.setLanguage(language);
  const ta = parser.parse(before), tb = parser.parse(after);
  if (!ta || !tb) return { fallback: 'parse-error' };
  for (const [side, t] of [['before', ta], ['after', tb]] as const) {
    if (t.rootNode.hasError) {
      const err = findError(t.rootNode);
      return { fallback: 'parse-error', side, ...(err ? { line: err.startPosition.row + 1 } : {}) };
    }
  }
  const A = collect(ta.rootNode, lang), B = collect(tb.rootNode, lang);
  const items: CodeItem[] = [];
  const byName = new Map(B.decls.map((d) => [d.name, d]));
  const matched = new Set<string>();
  const removed: Decl[] = [];
  // Order of shared names, to tell moves from shifts.
  const shared = A.decls.filter((d) => byName.has(d.name)).map((d) => d.name);
  const sharedAfter = B.decls.filter((d) => A.decls.some((x) => x.name === d.name)).map((d) => d.name);
  const stayed = lcs(shared, sharedAfter);

  for (const a of A.decls) {
    const b = byName.get(a.name);
    if (!b) { removed.push(a); continue; }
    matched.add(b.name);
    let status: CodeStatus;
    if (!eq(a.tokens, b.tokens)) status = 'changed';
    else if (a.comments.join('\n') !== b.comments.join('\n')) status = 'comments';
    else if (a.node.text !== b.node.text) status = 'formatting';
    else status = stayed.has(a.name) ? 'same' : 'moved';
    if (status === 'same' || status === 'formatting' || status === 'comments') if (!stayed.has(a.name)) status = status === 'same' ? 'moved' : status;
    items.push({ name: a.name, kind: a.kind, status, lines: { before: lines(a.node), after: lines(b.node) }, beforeText: a.node.text, afterText: b.node.text });
  }
  const added = B.decls.filter((d) => !matched.has(d.name));
  for (const r of removed) {
    const twin = added.find((x) => x.kind === r.kind && eq(x.bodyTokens, r.bodyTokens));
    if (twin) {
      added.splice(added.indexOf(twin), 1);
      items.push({ name: twin.name, kind: r.kind, status: 'renamed', from: r.name, lines: { before: lines(r.node), after: lines(twin.node) }, beforeText: r.node.text, afterText: twin.node.text });
    } else items.push({ name: r.name, kind: r.kind, status: 'removed', lines: { before: lines(r.node) }, beforeText: r.node.text });
  }
  for (const a of added) items.push({ name: a.name, kind: a.kind, status: 'added', lines: { after: lines(a.node) }, afterText: a.node.text });

  // Everything outside declarations (imports, top-level statements).
  if (!eq(A.module.tokens, B.module.tokens) || A.module.text !== B.module.text) {
    const status: CodeStatus = !eq(A.module.tokens, B.module.tokens) ? 'changed' : A.module.comments.join() !== B.module.comments.join() ? 'comments' : 'formatting';
    items.push({ name: '(top level)', kind: 'module', status, lines: {}, beforeText: A.module.text, afterText: B.module.text });
  }
  // Nested declarations change their parents' text too; a parent whose only change is in children stays "changed" — fine.
  items.sort((x, y) => (x.lines.after?.[0] ?? x.lines.before?.[0] ?? 1e9) - (y.lines.after?.[0] ?? y.lines.before?.[0] ?? 1e9) || x.name.localeCompare(y.name));
  const stats = { same: 0, formatting: 0, comments: 0, changed: 0, added: 0, removed: 0, renamed: 0, moved: 0 } as Record<CodeStatus, number>;
  for (const i of items) stats[i.status]++;
  ta.delete(); tb.delete(); parser.delete();
  return { language: lang, items, stats, logicChanged: stats.changed + stats.added + stats.removed > 0 };
}

function findError(n: Node): Node | undefined {
  if (n.type === 'ERROR' || n.isMissing) return n;
  for (const c of n.children) { if (c?.hasError) { const e = findError(c); if (e) return e; } }
  return undefined;
}

function lcs(xs: string[], ys: string[]): Set<string> {
  const pos = new Map(ys.map((k, i) => [k, i]));
  const seq = xs.map((k) => pos.get(k)!);
  const tails: number[] = [], prev: number[] = [], idx: number[] = [];
  seq.forEach((v, i) => { let lo = 0, hi = tails.length; while (lo < hi) { const m = (lo + hi) >> 1; if (tails[m]! < v) lo = m + 1; else hi = m; } tails[lo] = v; idx[lo] = i; prev[i] = lo > 0 ? idx[lo - 1]! : -1; });
  const keep = new Set<string>();
  for (let i = idx[tails.length - 1] ?? -1; i >= 0; i = prev[i]!) keep.add(xs[i]!);
  return keep;
}

export function languageFor(name: string): CodeLang | undefined {
  const ext = name.toLowerCase().replace(/\s*\([^)]*\)$/, '').split('.').pop() ?? '';
  return ({ ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', java: 'java', py: 'python' } as Record<string, CodeLang>)[ext];
}
