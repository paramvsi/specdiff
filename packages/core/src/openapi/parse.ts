// Parse YAML or JSON with source positions (OA-01, X-13).
// JSON goes through a small hand-written parser (fast on 10 MB files); YAML goes through the
// `yaml` library's AST. Both record where every key and array item starts, so any change can be
// pinned to a line and column, and a JSON spec reports positions the same way as YAML.
import { LineCounter, parseDocument as yamlParseDocument, isAlias, isMap, isScalar, isSeq } from 'yaml';
import type { Node as YamlNode, Document as YamlDocument } from 'yaml';

export interface ParseError {
  line: number;
  column: number;
  message: string;
  /** Plain-English advice on how to fix it. */
  hint: string;
}

export interface ParsedDocument {
  file: string;
  format: 'yaml' | 'json';
  /** The plain JS value; `undefined` when `errors` is not empty. */
  value: unknown;
  errors: ParseError[];
  /** Line and column (1-based) where the key or item at `pointer` starts; nearest ancestor if missing. */
  positionOf(pointer: readonly string[]): { line: number; column: number; exact: boolean };
}

// Per container: offset of each key (objects) or item (arrays).
type Offsets = Map<string, number>;

class PositionIndex {
  readonly offsets = new WeakMap<object, Offsets>();
  private lineStarts: number[] | undefined;
  constructor(private readonly text: string) {}

  set(container: object, key: string, offset: number): void {
    let m = this.offsets.get(container);
    if (!m) {
      m = new Map();
      this.offsets.set(container, m);
    }
    m.set(key, offset);
  }

  lineCol(offset: number): { line: number; column: number } {
    if (!this.lineStarts) {
      const starts = [0];
      const t = this.text;
      for (let i = 0; i < t.length; i++) if (t.charCodeAt(i) === 10) starts.push(i + 1);
      this.lineStarts = starts;
    }
    const s = this.lineStarts;
    let lo = 0;
    let hi = s.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((s[mid] ?? 0) <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: offset - (s[lo] ?? 0) + 1 };
  }
}

function positionLookup(root: unknown, index: PositionIndex, rootOffset: number) {
  return (pointer: readonly string[]) => {
    let node: unknown = root;
    let offset = rootOffset;
    let exact = true;
    for (const seg of pointer) {
      if (node === null || typeof node !== 'object') {
        exact = false;
        break;
      }
      const off = index.offsets.get(node)?.get(seg);
      if (off === undefined) {
        exact = false;
        break;
      }
      offset = off;
      node = (node as Record<string, unknown>)[seg];
    }
    return { ...index.lineCol(offset), exact };
  };
}

function setOwn(obj: Record<string, unknown>, key: string, value: unknown): void {
  // Never let a `__proto__` key change the prototype.
  if (key === '__proto__') Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
  else obj[key] = value;
}

// ---------------------------------------------------------------- JSON

class JsonError extends Error {
  constructor(
    message: string,
    readonly offset: number,
    readonly hint: string,
  ) {
    super(message);
  }
}

const COMMENT_HINT = 'JSON has no comments: remove the // or /* */ comment, or save the spec as YAML and use #.';
const JSON_HINT = 'Check for a missing or trailing comma, an unquoted key, or a missing closing bracket.';

function parseJson(text: string, index: PositionIndex): unknown {
  let i = 0;
  const n = text.length;
  const ws = () => {
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 32 || c === 10 || c === 13 || c === 9) i++;
      else break;
    }
  };
  const fail = (msg: string, hint = JSON_HINT): never => {
    // Stopped on a comment (JSONC habits from tsconfig and editor settings): say so.
    const atComment = text.startsWith('//', i) || text.startsWith('/*', i);
    throw new JsonError(msg, Math.min(i, n), atComment ? COMMENT_HINT : hint);
  };
  const str = (): string => {
    const start = ++i; // after the opening quote
    let escaped = false;
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 34) break;
      if (c === 92) {
        escaped = true;
        i += 2;
        continue;
      }
      if (c < 32) fail('Control character inside a string', 'Strings cannot span lines in JSON; use \\n.');
      i++;
    }
    if (i >= n) fail('Unterminated string', 'A string is missing its closing quote.');
    const raw = text.slice(start, i);
    i++;
    if (!escaped) return raw;
    try {
      return JSON.parse(`"${raw}"`) as string;
    } catch {
      return fail('Invalid escape sequence in a string', 'Use \\" for quotes and \\\\ for backslashes.');
    }
  };
  const value = (): unknown => {
    ws();
    if (i >= n) fail('Unexpected end of input', 'The file ends too early: something is not closed.');
    const c = text.charCodeAt(i);
    if (c === 123) {
      // {
      i++;
      const obj: Record<string, unknown> = {};
      ws();
      if (text.charCodeAt(i) === 125) {
        i++;
        return obj;
      }
      for (;;) {
        ws();
        if (text.charCodeAt(i) !== 34) fail('Expected a quoted key', 'Keys in JSON must be in double quotes, and no trailing comma.');
        const keyStart = i;
        const key = str();
        // As in YAML: a repeated key is an error, not a silent last-one-wins (often a copy-pasted path).
        if (Object.hasOwn(obj, key)) {
          i = keyStart;
          fail(`Map keys must be unique: ${JSON.stringify(key)} appears twice in this object`, 'Remove or rename one of them; JSON readers keep only the last.');
        }
        ws();
        if (text.charCodeAt(i) !== 58) fail('Expected a colon after the key');
        i++;
        const v = value();
        setOwn(obj, key, v);
        index.set(obj, key, keyStart);
        ws();
        const d = text.charCodeAt(i);
        if (d === 44) {
          i++;
          continue;
        }
        if (d === 125) {
          i++;
          return obj;
        }
        fail('Expected a comma or a closing brace');
      }
    }
    if (c === 91) {
      // [
      i++;
      const arr: unknown[] = [];
      ws();
      if (text.charCodeAt(i) === 93) {
        i++;
        return arr;
      }
      for (;;) {
        ws();
        index.set(arr, String(arr.length), i);
        arr.push(value());
        ws();
        const d = text.charCodeAt(i);
        if (d === 44) {
          i++;
          continue;
        }
        if (d === 93) {
          i++;
          return arr;
        }
        fail('Expected a comma or a closing bracket');
      }
    }
    if (c === 34) return str();
    if (text.startsWith('true', i)) {
      i += 4;
      return true;
    }
    if (text.startsWith('false', i)) {
      i += 5;
      return false;
    }
    if (text.startsWith('null', i)) {
      i += 4;
      return null;
    }
    const start = i;
    while (i < n) {
      const d = text.charCodeAt(i);
      // digits, + - . e E
      if ((d >= 48 && d <= 57) || d === 43 || d === 45 || d === 46 || d === 101 || d === 69) i++;
      else break;
    }
    const num = text.slice(start, i);
    if (num === '' || !/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(num)) {
      i = start;
      fail('Unexpected character', 'Strings need double quotes; check for a stray character or comment.');
    }
    return Number(num);
  };
  const v = value();
  ws();
  if (i < n) fail('Unexpected content after the end of the document', 'There is extra text after the last closing bracket.');
  return v;
}

// ---------------------------------------------------------------- YAML

const YAML_HINTS: Record<string, string> = {
  DUPLICATE_KEY: 'This key appears twice in the same object. Remove or rename one of them.',
  BAD_INDENT: 'Check the indentation: items at the same level must line up, using spaces only.',
  TAB_AS_INDENT: 'YAML does not allow tabs for indentation. Use spaces.',
  MISSING_CHAR: 'Something is not closed: look for a missing quote, bracket or colon.',
  MULTILINE_IMPLICIT_KEY: 'A key seems to span two lines. Check for a missing colon or put the value in quotes.',
  BLOCK_AS_IMPLICIT_KEY: 'A key seems to span two lines. Check for a missing colon or put the value in quotes.',
  UNEXPECTED_TOKEN: 'There is a character YAML did not expect here. Strings with : # or { may need quotes.',
  BAD_ALIAS: 'An alias (*name) points to an anchor (&name) that does not exist.',
  BAD_SCALAR_START: 'A value starts with a reserved character such as @ or `. Put it in quotes.',
};
const YAML_HINT_DEFAULT = 'Check the indentation and quoting around this line.';

function convertYaml(doc: YamlDocument.Parsed, index: PositionIndex, nodeCount: { n: number; limit: number }): unknown {
  const seen = new Map<YamlNode, unknown>();
  // Expanded size of each collection, so aliases count as the nodes they stand for.
  const sizes = new Map<YamlNode, number>();
  const tooBig = () => new Error('Too many YAML aliases: the expanded document is far larger than the file.');
  const visit = (node: unknown): unknown => {
    if (++nodeCount.n > nodeCount.limit) throw tooBig();
    if (node === null || node === undefined) return null;
    if (isAlias(node)) {
      const target = node.resolve(doc);
      if (!target) return null;
      if (seen.has(target)) {
        nodeCount.n += sizes.get(target) ?? 1;
        if (nodeCount.n > nodeCount.limit) throw tooBig();
        return seen.get(target);
      }
      return visit(target);
    }
    const before = nodeCount.n;
    if (isScalar(node)) return node.value;
    if (isMap(node)) {
      const obj: Record<string, unknown> = {};
      seen.set(node, obj);
      for (const pair of node.items) {
        const keyNode = pair.key;
        const key = isScalar(keyNode) ? String(keyNode.value) : String(visit(keyNode));
        if (key === '<<' && pair.value && (isAlias(pair.value) || isMap(pair.value))) {
          const merged = visit(pair.value);
          if (merged && typeof merged === 'object') {
            for (const [k, v] of Object.entries(merged)) if (!(k in obj)) setOwn(obj, k, v);
          }
          continue;
        }
        setOwn(obj, key, visit(pair.value));
        const start = (keyNode as YamlNode | null)?.range?.[0] ?? 0;
        index.set(obj, key, start);
      }
      sizes.set(node, nodeCount.n - before);
      return obj;
    }
    if (isSeq(node)) {
      const arr: unknown[] = [];
      seen.set(node, arr);
      for (const item of node.items) {
        const start = (item as YamlNode | null)?.range?.[0];
        if (start !== undefined) index.set(arr, String(arr.length), start);
        arr.push(visit(item));
      }
      sizes.set(node, nodeCount.n - before);
      return arr;
    }
    return null;
  };
  return visit(doc.contents);
}

export function looksLikeJson(content: string): boolean {
  for (let i = 0; i < content.length; i++) {
    const c = content.charCodeAt(i);
    if (c === 32 || c === 10 || c === 13 || c === 9 || c === 0xfeff) continue;
    return c === 123 || c === 91;
  }
  return false;
}

function parseYaml(text: string, index: PositionIndex): { value: unknown; errors: ParseError[]; rootOffset: number } {
  const errors: ParseError[] = [];
  const doc = yamlParseDocument(text, { lineCounter: new LineCounter(), uniqueKeys: true, prettyErrors: false, keepSourceTokens: false });
  for (const e of doc.errors) {
    const pos = index.lineCol(e.pos[0]);
    errors.push({ ...pos, message: e.message.split('\n')[0] ?? e.message, hint: YAML_HINTS[e.code] ?? YAML_HINT_DEFAULT });
  }
  if (errors.length > 0) return { value: undefined, errors, rootOffset: 0 };
  try {
    // Alias expansion guard: a real document has far fewer nodes than characters.
    const value = convertYaml(doc, index, { n: 0, limit: Math.max(200_000, text.length / 2) });
    return { value, errors, rootOffset: (doc.contents as YamlNode | null)?.range?.[0] ?? 0 };
  } catch (e) {
    errors.push({ line: 1, column: 1, message: e instanceof Error ? e.message : String(e), hint: 'Remove deeply nested YAML aliases (*name).' });
    return { value: undefined, errors, rootOffset: 0 };
  }
}

/** Parse a YAML or JSON document, keeping source positions. Never throws. */
export function parseDocument(content: string, file = 'input'): ParsedDocument {
  const text = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  let index = new PositionIndex(text);
  let format: 'json' | 'yaml' = 'yaml';
  let result: { value: unknown; errors: ParseError[]; rootOffset: number };
  if (looksLikeJson(text)) {
    format = 'json';
    try {
      result = { value: parseJson(text, index), errors: [], rootOffset: 0 };
    } catch (e) {
      const err = e instanceof JsonError ? e : new JsonError(String(e), 0, JSON_HINT);
      const jsonErrors = [{ ...index.lineCol(err.offset), message: err.message, hint: err.hint }];
      // A YAML flow mapping also starts with "{": accept it when it is valid YAML, unless the
      // file says it is JSON (then a trailing comma is an error worth showing). Not after a comment:
      // YAML has no // or /* */ and would fold the comment into the next key.
      result = { value: undefined, errors: jsonErrors, rootOffset: 0 };
      if (!/\.json$/i.test(file) && err.hint !== COMMENT_HINT) {
        const yamlIndex = new PositionIndex(text);
        const y = parseYaml(text, yamlIndex);
        if (y.errors.length === 0) {
          result = y;
          index = yamlIndex;
          format = 'yaml';
        }
      }
    }
  } else result = parseYaml(text, index);
  const { value, errors, rootOffset } = result;
  return { file, format, value, errors, positionOf: positionLookup(value, index, rootOffset) };
}
