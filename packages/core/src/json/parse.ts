// JSON/YAML parsing with source positions and duplicate-key reporting (JS-04).
import { isMap, isScalar, isSeq, LineCounter, parseDocument, type Node } from 'yaml';

export interface Pos { line: number; column: number }
export interface Parsed {
  value: unknown;
  /** JSONPath → position of the value's node. */
  positions: Map<string, Pos>;
  duplicates: Array<{ path: string; key: string; line: number; column: number }>;
}
export interface ParseError { line: number; column: number; message: string; hint: string }

export function jsonPathKey(parent: string, key: string | number): string {
  if (typeof key === 'number') return `${parent}[${key}]`;
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `${parent}.${key}` : `${parent}['${key.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}']`;
}

function hintFor(code: string, message: string): string {
  if (code === 'BAD_INDENT' || /indent/i.test(message)) return 'Check the indentation on this line: it must line up with its siblings, using spaces, not tabs.';
  if (code === 'MISSING_CHAR' || /flow/i.test(message)) return 'A bracket, brace or quote is not closed. Look for a missing ] } or " near here.';
  if (code === 'TAB_AS_INDENT') return 'YAML does not allow tabs for indentation. Replace them with spaces.';
  if (code === 'DUPLICATE_KEY') return 'The same key appears twice in one object.';
  if (/JSON|unexpected/i.test(message)) return 'This is not valid JSON or YAML here. Look for a stray comma or a missing colon.';
  return 'Fix the syntax on this line and compare again.';
}

export function parseWithPositions(content: string): Parsed | { error: ParseError } {
  const lc = new LineCounter();
  const doc = parseDocument(content, { lineCounter: lc, uniqueKeys: false, prettyErrors: false, strict: false });
  const err = doc.errors[0];
  if (err) {
    const p = lc.linePos(err.pos[0]);
    return { error: { line: p.line, column: p.col, message: err.message.split('\n')[0]!, hint: hintFor(err.code, err.message) } };
  }
  const positions = new Map<string, Pos>();
  const duplicates: Parsed['duplicates'] = [];
  const at = (n: Node | null | undefined): Pos | undefined => {
    const off = n?.range?.[0];
    if (off === undefined) return undefined;
    const p = lc.linePos(off);
    return { line: p.line, column: p.col };
  };
  const walk = (n: unknown, path: string) => {
    const pos = at(n as Node);
    if (pos) positions.set(path, pos);
    if (isMap(n)) {
      const seen = new Set<string>();
      for (const item of n.items) {
        const key = isScalar(item.key) ? String(item.key.value) : String(item.key);
        const kp = jsonPathKey(path, key);
        if (seen.has(key)) { const p = at(item.key as Node) ?? { line: 0, column: 0 }; duplicates.push({ path, key, ...p }); }
        seen.add(key);
        // Position the key line for a property (that's where people look).
        const kpos = at(item.key as Node);
        walk(item.value, kp);
        if (kpos) positions.set(kp, kpos);
      }
    } else if (isSeq(n)) {
      n.items.forEach((it, i) => walk(it, jsonPathKey(path, i)));
    }
  };
  walk(doc.contents, '$');
  return { value: doc.toJS({ maxAliasCount: 1000 }), positions, duplicates };
}
