// JSON/YAML parsing with source positions and duplicate-key reporting (JS-04).
import { isMap, isScalar, isSeq, LineCounter, parseDocument, type Node } from 'yaml';
import { inexactNumber } from './numbers';

export interface Pos { line: number; column: number }
export interface Parsed {
  value: unknown;
  /** JSONPath → position of the value's node. */
  positions: Map<string, Pos>;
  duplicates: Array<{ path: string; key: string; line: number; column: number }>;
  /** M-2: JSONPath → canonical source text of each number a JS number cannot hold exactly. Absent when there are none. */
  exactNumbers?: Map<string, string>;
}
export interface ParseError { line: number; column: number; message: string; hint: string }

export function jsonPathKey(parent: string, key: string | number): string {
  if (typeof key === 'number') return `${parent}[${key}]`;
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `${parent}.${key}` : `${parent}['${key.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}']`;
}

function hintFor(code: string, message: string): string {
  if (code === 'MISSING_CHAR' || /end with a|flow (map|sequence|collection)|missing/i.test(message)) return 'A bracket, brace or quote is not closed. Look for a missing ] } or " near here.';
  if (code === 'BAD_INDENT' || /indent/i.test(message)) return 'Check the indentation on this line: it must line up with its siblings, using spaces, not tabs.';
  if (code === 'TAB_AS_INDENT') return 'YAML does not allow tabs for indentation. Replace them with spaces.';
  if (/call stack/i.test(message)) return 'The file is valid as far as it goes, but it nests more levels than Specdiff can follow in a browser.';
  if (/multiple documents/i.test(message)) return 'This file holds more than one YAML document (separated by ---). Compare one document at a time.';
  if (code === 'DUPLICATE_KEY') return 'The same key appears twice in one object.';
  if (/JSON|unexpected/i.test(message)) return 'This is not valid JSON or YAML here. Look for a stray comma or a missing colon.';
  return 'Fix the syntax on this line and compare again.';
}

/**
 * JSON with comments (JSONC: tsconfig, VS Code settings). YAML, which reads the file, has no `//` or `/* *\/` comments
 * and would fold them into keys. Comments outside strings become spaces (lines and columns stay put); the result is
 * used only if it is then plain JSON (trailing commas allowed), so YAML that merely contains `//` is left alone.
 */
function withoutJsonComments(text: string): string {
  if (!/^\s*[{[]/.test(text) || !/\/[/*]/.test(text)) return text;
  let found = false;
  // One native pass: strings are kept whole (so `//` in a URL is not a comment); comments become spaces, newlines kept.
  const out = text.replace(/"(?:[^"\\\n]|\\.)*"|\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/g, (m) => {
    if (m[0] === '"') return m;
    found = true;
    return m.replace(/[^\r\n]/g, ' ');
  });
  if (!found) return text; // `//` only inside strings (URLs): nothing to strip, skip the check parse
  try { JSON.parse(out.replace(/,(\s*[}\]])/g, '$1')); return out; } catch { return text; }
}

export function parseWithPositions(content: string): Parsed | { error: ParseError } {
  content = withoutJsonComments(content);
  const lc = new LineCounter();
  const doc = parseDocument(content, { lineCounter: lc, uniqueKeys: false, prettyErrors: false, strict: false, merge: true });
  const err = doc.errors[0];
  if (err) {
    const p = lc.linePos(err.pos[0]);
    const first = err.message.split('\n')[0]!;
    return { error: { line: p.line, column: p.col, message: /call stack/i.test(first) ? 'The file is nested too deeply to compare.' : first, hint: hintFor(err.code, err.message) } };
  }
  const positions = new Map<string, Pos>();
  const duplicates: Parsed['duplicates'] = [];
  const exactNumbers = new Map<string, string>();
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
    } else if (isScalar(n) && typeof n.value === 'number' && n.range) {
      const exact = inexactNumber(content.slice(n.range[0], n.range[1]), n.value);
      if (exact) exactNumbers.set(path, exact);
    }
  };
  walk(doc.contents, '$');
  try {
    return { value: doc.toJS({ maxAliasCount: 1000 }), positions, duplicates, ...(exactNumbers.size ? { exactNumbers } : {}) };
  } catch (e) {
    // yaml refuses alias bombs ("Excessive alias count"): report it like any other parse error.
    return { error: { line: 1, column: 1, message: e instanceof Error ? e.message : String(e), hint: 'The YAML aliases expand to far more data than the file holds. Remove the repeated aliases.' } };
  }
}
