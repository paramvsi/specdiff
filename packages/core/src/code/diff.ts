// Code mode (Beta; CD-01..CD-06): structure-aware diff with tree-sitter (WASM).
// Declarations are matched by qualified name; bodies are compared as normalised token streams.
import { Language, Parser, type Node } from 'web-tree-sitter';
import { byCodePoint } from '../order';

export type CodeLang = 'typescript' | 'tsx' | 'javascript' | 'java' | 'python';
export type CodeStatus = 'same' | 'formatting' | 'comments' | 'changed' | 'added' | 'removed' | 'renamed' | 'moved' | 'renamedLocals';
export interface CodeItem {
  name: string;
  kind: string;
  status: CodeStatus;
  from?: string; // renamed from
  /** For renamedLocals: identifiers renamed consistently inside the declaration (B-15). */
  renames?: Array<{ from: string; to: string; uses: number }>;
  /** For renamedLocals: the comments changed too (CD-06). */
  commentsChanged?: true;
  /**
   * For formatting: what kind of meaning-preserving edit was hidden (CD-06). `whitespace` is layout
   * only; the others are token edits that do not change meaning.
   */
  hiddenEdits?: HiddenEdit[];
  lines: { before?: [number, number]; after?: [number, number] };
  beforeText?: string;
  afterText?: string;
  /** For changed: what changed, in words, when it can be told ("currency no longer defaults to USD"). */
  summary?: string;
}
export type HiddenEdit = 'whitespace' | 'number-literal' | 'trailing-comma' | 'semicolon' | 'keyword-argument-order';
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

interface Decl { name: string; /** Matching identity: the name, or name#n among same-named declarations. */ key: string; simple: string; kind: string; node: Node; index: number; tokens: string[]; raw: string[]; bodyTokens: string[]; comments: string[] }

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

/** Leaf tokens in order, comments separated; meaning-preserving edits normalised (CD-06) unless `raw`. */
function tokens(n: Node, lang: CodeLang, out: string[], comments: string[], raw = false): void {
  if (/comment/.test(n.type)) { comments.push(n.text.trim()); return; }
  if (raw) {
    if (n.childCount === 0) out.push(n.text);
    else for (const c of n.children) if (c) tokens(c, lang, out, comments, true);
    return;
  }
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

function collect(root: Node, lang: CodeLang): { decls: Decl[]; module: { tokens: string[]; raw: string[]; comments: string[]; text: string; lines: [number, number] } } {
  const decls: Decl[] = [];
  const kinds = DECL[lang];
  const moduleTokens: string[] = [], moduleRaw: string[] = [], moduleComments: string[] = [], moduleText: string[] = [];
  const walk = (n: Node, prefix: string, top: boolean) => {
    for (const c of n.namedChildren) {
      if (!c) continue;
      const arrow = isArrowConst(c);
      const kind = kinds[c.type] ?? (arrow ? 'function' : undefined);
      if (kind) {
        const name = nameOf(arrow ?? c);
        if (name) {
          const full = prefix ? `${prefix}.${name}` : name;
          const t: string[] = [], cm: string[] = [], raw: string[] = [];
          tokens(c, lang, t, cm);
          tokens(c, lang, raw, [], true);
          const toks = dropOptional(t, lang);
          const nameTok = name;
          decls.push({ name: full, key: full, simple: name, kind, node: c, index: decls.length, tokens: toks, raw, bodyTokens: toks.map((x) => (x === nameTok ? '\u0000name' : x)), comments: cm });
          const body = c.childForFieldName('body');
          if (body) walk(body, full, false);
          continue;
        }
      }
      if (CONTAINERS.has(c.type)) { walk(c, prefix, top); continue; }
      if (top) { tokens(c, lang, moduleTokens, moduleComments); tokens(c, lang, moduleRaw, [], true); moduleText.push(c.text); }
    }
  };
  walk(root, '', true);
  return { decls, module: { tokens: dropOptional(moduleTokens, lang), raw: moduleRaw, comments: moduleComments, text: moduleText.join('\n'), lines: [root.startPosition.row + 1, root.endPosition.row + 1] } };
}

const eq = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
/**
 * Matching keys (CD-02). A name that appears once on each side keys by itself. Same-named declarations
 * (Java/TS overloads, a Python redefinition) pair first with an identical twin on the other side, then
 * in order of appearance, so an unchanged file never reports an overload as changed.
 */
function assignKeys(a: Decl[], b: Decl[]): void {
  const groups = (ds: Decl[]) => { const m = new Map<string, Decl[]>(); for (const d of ds) (m.get(d.name) ?? m.set(d.name, []).get(d.name)!).push(d); return m; };
  const ga = groups(a), gb = groups(b);
  for (const d of [...a, ...b]) d.key = d.name;
  for (const [name, as] of ga) {
    const bs = gb.get(name) ?? [];
    if (as.length < 2 && bs.length < 2) continue;
    as.forEach((d, i) => { d.key = `${name}#${i}`; });
    const free = new Set(bs);
    for (const d of as) { const twin = bs.find((x) => free.has(x) && eq(x.tokens, d.tokens)); if (twin) { twin.key = d.key; free.delete(twin); } }
    const unpaired = as.filter((d) => !bs.some((x) => x.key === d.key && !free.has(x)));
    for (const x of bs) if (free.has(x)) { const d = unpaired.shift(); x.key = d ? d.key : `${name}#b${bs.indexOf(x)}`; free.delete(x); }
  }
  for (const [name, bs] of gb) if (!ga.has(name) && bs.length > 1) bs.forEach((d, i) => { d.key = `${name}#b${i}`; });
}

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
  assignKeys(A.decls, B.decls);
  const items: CodeItem[] = [];
  const byName = new Map(B.decls.map((d) => [d.key, d]));
  const matched = new Set<string>();
  const removed: Decl[] = [];
  // Order of shared names, to tell moves from shifts.
  const shared = A.decls.filter((d) => byName.has(d.key)).map((d) => d.key);
  const sharedAfter = B.decls.filter((d) => A.decls.some((x) => x.key === d.key)).map((d) => d.key);
  const stayed = lcs(shared, sharedAfter);

  // Declaration renames first (a removed declaration whose body equals an added one's), so a
  // parent's tokens can discount them: renaming method `g` → `gee` is one rename, not also a
  // "local rename" on the class that contains it (CD-03).
  const unmatchedB = B.decls.filter((d) => !A.decls.some((x) => x.key === d.key));
  const twins = new Map<Decl, Decl>();
  for (const r of A.decls) {
    if (byName.has(r.key)) continue;
    const twin = unmatchedB.find((x) => x.kind === r.kind && eq(x.bodyTokens, r.bodyTokens));
    if (twin) { unmatchedB.splice(unmatchedB.indexOf(twin), 1); twins.set(r, twin); }
  }
  // Every declaration rename (old → new simple name). Uses of the old name elsewhere, at the same place in
  // the token stream, are call sites that follow the rename (CD-03): `g()` → `gee()`, `self.g()` → `self.gee()`.
  const sub = new Map<string, string>();
  for (const [r, t] of twins) if (r.simple !== t.simple) sub.set(r.simple, t.simple);
  const declNames = new Set([...A.decls, ...B.decls].map((d) => d.simple));

  for (const a of A.decls) {
    const b = byName.get(a.key);
    if (!b) { removed.push(a); continue; }
    matched.add(b.key);
    // Apply the declaration renames where the other side has the new name, then compare.
    const subst = (toks: string[], other: string[]) => (sub.size ? toks.map((x, i) => (sub.get(x) === other[i] ? other[i]! : x)) : toks);
    const aTokens = subst(a.tokens, b.tokens);
    let status: CodeStatus;
    const renames = eq(aTokens, b.tokens) ? undefined : consistentRenames(aTokens, b.tokens, declNames);
    const commentsDiffer = a.comments.join('\n') !== b.comments.join('\n');
    let hidden: HiddenEdit[] | undefined;
    if (renames) status = 'renamedLocals';
    else if (!eq(aTokens, b.tokens)) status = 'changed';
    else if (commentsDiffer) status = 'comments';
    else if (!eq(subst(a.raw, b.raw), b.raw)) { status = 'formatting'; hidden = hiddenEdits(subst(a.raw, b.raw), b.raw, lang); }
    else if (renameText(a.node.text, sub) !== b.node.text) { status = 'formatting'; hidden = ['whitespace']; }
    else status = stayed.has(a.key) ? 'same' : 'moved';
    if (status === 'same' || status === 'formatting' || status === 'comments') if (!stayed.has(a.key)) status = status === 'same' ? 'moved' : status;
    const summary = status === 'changed' ? describeChange(a.node.text, b.node.text) : undefined;
    items.push({ name: a.name, kind: a.kind, status, ...(summary ? { summary } : {}), ...(renames ? { renames } : {}), ...(renames && commentsDiffer ? { commentsChanged: true as const } : {}), ...(hidden ? { hiddenEdits: hidden } : {}), lines: { before: lines(a.node), after: lines(b.node) }, beforeText: a.node.text, afterText: b.node.text });
  }
  const added = B.decls.filter((d) => !matched.has(d.key));
  for (const r of removed) {
    const twin = twins.get(r);
    if (twin) {
      added.splice(added.indexOf(twin), 1);
      items.push({ name: twin.name, kind: r.kind, status: 'renamed', from: r.name, lines: { before: lines(r.node), after: lines(twin.node) }, beforeText: r.node.text, afterText: twin.node.text });
    } else items.push({ name: r.name, kind: r.kind, status: 'removed', lines: { before: lines(r.node) }, beforeText: r.node.text });
  }
  for (const a of added) items.push({ name: a.name, kind: a.kind, status: 'added', lines: { after: lines(a.node) }, afterText: a.node.text });

  // Everything outside declarations (imports, top-level statements).
  if (!eq(A.module.tokens, B.module.tokens) || A.module.text !== B.module.text) {
    const status: CodeStatus = !eq(A.module.tokens, B.module.tokens) ? 'changed' : A.module.comments.join() !== B.module.comments.join() ? 'comments' : 'formatting';
    items.push({ name: '(top level)', kind: 'module', status, ...(status === 'formatting' ? { hiddenEdits: hiddenEdits(A.module.raw, B.module.raw, lang) } : {}), lines: {}, beforeText: A.module.text, afterText: B.module.text });
  }
  // Nested declarations change their parents' text too; a parent whose only change is in children stays "changed" — fine.
  items.sort((x, y) => (x.lines.after?.[0] ?? x.lines.before?.[0] ?? 1e9) - (y.lines.after?.[0] ?? y.lines.before?.[0] ?? 1e9) || byCodePoint(x.name, y.name));
  const stats = { same: 0, formatting: 0, comments: 0, changed: 0, added: 0, removed: 0, renamed: 0, moved: 0, renamedLocals: 0 } as Record<CodeStatus, number>;
  for (const i of items) stats[i.status]++;
  ta.delete(); tb.delete(); parser.delete();
  return { language: lang, items, stats, logicChanged: stats.changed + stats.added + stats.removed > 0 };
}

const LIT = String.raw`"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|-?\d+(?:\.\d+)?[lLfFdD]?|true|false|True|False`;
const ASSIGN = /([A-Za-z_$][\w$]*)\s*(?<![=!<>])=(?!=)\s*(.*?);?\s*$/;
const DEFAULT = new RegExp(String.raw`(?:\?\?|\|\||\bor\b|:)\s*(${LIT})\s*$`);
const unquote = (lit: string) => lit.replace(/^(["'])([\s\S]*)\1$/, '$2');

/** The default literal each variable falls back to (`x = a ?? 10`, `x = c ? a : "USD"`, `x = a or "eu"`). */
function defaults(text: string): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const line of text.split(/\r?\n/)) {
    const m = ASSIGN.exec(line.trim());
    if (!m) continue;
    const rhs = m[2]!;
    const d = DEFAULT.exec(rhs);
    // `:` only counts as a default after a `?` (a ternary), not in a map literal or a label.
    const ok = d && (!d[0].trimStart().startsWith(':') || rhs.slice(0, d.index).includes('?'));
    if (!out.has(m[1]!)) out.set(m[1]!, ok ? unquote(d[1]!) : null);
  }
  return out;
}

/**
 * A-09: a logic change in words, when it is a variable's default that went away, appeared or changed;
 * otherwise undefined. Deterministic: the first such variable in source order.
 */
export function describeChange(before: string, after: string): string | undefined {
  const a = defaults(before), b = defaults(after);
  for (const [name, was] of a) {
    if (!b.has(name)) continue;
    const now = b.get(name)!;
    if (was === now) continue;
    if (was !== null && now === null) return `${name} no longer defaults to ${was}`;
    if (was === null && now !== null) return `${name} now defaults to ${now}`;
    if (was !== null && now !== null) return `${name} default changed from ${was} to ${now}`;
  }
  return undefined;
}

/** Whole-word replacement of renamed declaration names in source text. */
function renameText(text: string, sub: Map<string, string>): string {
  if (!sub.size) return text;
  return text.replace(/[A-Za-z_$][\w$]*/g, (w) => sub.get(w) ?? w);
}

/** Which meaning-preserving edits explain two token streams that normalise to the same thing (CD-06). */
function hiddenEdits(a: string[], b: string[], lang: CodeLang): HiddenEdit[] {
  if (eq(a, b)) return ['whitespace'];
  const out: HiddenEdit[] = [];
  const nums = (t: string[]) => t.filter((x) => /^[\d.]/.test(x) && NUM.test(x)).sort().join(' ');
  const trailing = (t: string[]) => t.filter((x, i) => x === ',' && [')', ']', '}'].includes(t[i + 1] ?? '')).length;
  const semis = (t: string[]) => t.filter((x) => x === ';').length;
  if (nums(a) !== nums(b)) out.push('number-literal');
  if (trailing(a) !== trailing(b)) out.push('trailing-comma');
  if (lang !== 'java' && lang !== 'python' && semis(a) !== semis(b)) out.push('semicolon');
  if (lang === 'python' && !out.length) out.push('keyword-argument-order');
  return out.length ? out : ['whitespace'];
}

const KEYWORDS = new Set(['if', 'else', 'for', 'while', 'do', 'return', 'function', 'class', 'const', 'let', 'var', 'new', 'this', 'super', 'true', 'false', 'null', 'undefined', 'def', 'self', 'None', 'True', 'False', 'import', 'from', 'public', 'private', 'protected', 'static', 'final', 'void', 'int', 'long', 'boolean', 'String', 'throw', 'throws', 'try', 'catch', 'async', 'await', 'export', 'default', 'in', 'of', 'is', 'not', 'and', 'or', 'lambda', 'pass', 'yield']);
const IDENT = /^[A-Za-z_$][\w$]*$/;

/** Token streams equal except for a consistent, one-to-one renaming of identifiers (e.g. amount → amt).
 *  Member names (after `.`, `->`, `::`) are not locals: a change there is a logic change. */
function consistentRenames(a: string[], b: string[], declNames: ReadonlySet<string>): CodeItem['renames'] | undefined {
  if (a.length !== b.length) return undefined;
  const member = (t: string[], i: number) => ['.', '->', '::', '?.'].includes(t[i - 1] ?? '');
  const fwd = new Map<string, string>(), back = new Map<string, string>(), uses = new Map<string, number>();
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!, y = b[i]!;
    if (x === y) continue;
    if (member(a, i) || member(b, i)) return undefined;
    if (!IDENT.test(x) || !IDENT.test(y) || KEYWORDS.has(x) || KEYWORDS.has(y)) return undefined;
    // Calling a different declared function is a logic change, not a renamed local.
    if ((declNames.has(x) || declNames.has(y)) && (a[i + 1] === '(' || b[i + 1] === '(')) return undefined;
    if ((fwd.get(x) ?? y) !== y || (back.get(y) ?? x) !== x) return undefined;
    fwd.set(x, y); back.set(y, x);
    uses.set(x, (uses.get(x) ?? 0) + 1);
  }
  if (!fwd.size) return undefined;
  // A renamed local must not also appear unchanged as a local elsewhere (that would change meaning).
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i] || member(a, i)) continue;
    if (fwd.has(a[i]!) || back.has(b[i]!)) return undefined;
  }
  return [...fwd].map(([from, to]) => ({ from, to, uses: uses.get(from)! })).sort((p, q) => byCodePoint(p.from, q.from));
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
