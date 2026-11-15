// Load an OpenAPI input: parse with positions, detect the version, normalise to 3.1 (OA-01) and
// resolve `$ref`s lazily against an in-memory file map (OA-02). No `fs`: external files come
// from `Input.files` (folder or ZIP input), so this runs in a browser worker and in Node.
import { upgrade } from '@scalar/openapi-parser';
import type { SourcePos } from '../schemas';
import { utf8Length } from './hash';
import { parseDocument, type ParseError, type ParsedDocument } from './parse';

export interface Input {
  name: string;
  content: string;
  /** Other files of a folder or ZIP input, keyed by path relative to the same root as `name`. */
  files?: Record<string, string>;
}

export class OpenApiParseError extends Error {
  constructor(
    readonly file: string,
    readonly errors: ParseError[],
  ) {
    const first = errors[0];
    super(first ? `${file}:${first.line}:${first.column} ${first.message}` : `${file}: could not be parsed`);
    this.name = 'OpenApiParseError';
  }
}

/** A location in a file: the file name and a JSON pointer as a linked list (cheap to extend). */
export interface Chain {
  readonly up: Chain | undefined;
  readonly key: string;
}
export interface Loc {
  readonly file: string;
  readonly ptr: Chain | undefined;
}

export const child = (loc: Loc, key: string): Loc => ({ file: loc.file, ptr: { up: loc.ptr, key } });

export function chainToArray(c: Chain | undefined): string[] {
  const out: string[] = [];
  for (let x = c; x; x = x.up) out.push(x.key);
  return out.reverse();
}
export function arrayToChain(segs: readonly string[]): Chain | undefined {
  let c: Chain | undefined;
  for (const key of segs) c = { up: c, key };
  return c;
}

export interface Resolved {
  value: unknown;
  loc: Loc;
  /** Set when the node was a `$ref`: the canonical id of the target, e.g. `components.schemas.Card`. */
  refId?: string;
  /** Display name of the target, e.g. `Card`. */
  refName?: string;
}

export interface LoadedSpec {
  rootFile: string;
  /** `$ref`s that could not be resolved so far (filled while the comparison derefs), sorted. */
  unresolved(): string[];
  root: Record<string, unknown>;
  format: 'yaml' | 'json';
  size: number;
  specVersion?: string;
  infoVersion?: string;
  deref(value: unknown, loc: Loc): Resolved;
  position(loc: Loc): SourcePos;
  /** `$.paths['/v1/payments'].post…` for a location (array items as `[n]`). */
  jsonPath(loc: Loc): string;
}

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

function dirname(p: string): string {
  const i = p.lastIndexOf('/');
  return i < 0 ? '' : p.slice(0, i + 1);
}
/** `a/./b/../c` → `a/c`, backslashes as `/`. Leading `..` segments are kept (`../x` stays `../x`). */
function normalisePath(p: string): string {
  const out: string[] = [];
  for (const seg of p.replace(/\\/g, '/').split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..' && out.length > 0 && out[out.length - 1] !== '..') out.pop();
    else out.push(seg);
  }
  return out.join('/');
}

// A scheme followed by `//` (https://, file://). `main:openapi.yaml` (a git rev:path name) is not a URL.
const isUrl = (s: string) => /^[a-z][a-z0-9+.-]*:\/\//i.test(s);

function decodePointer(fragment: string): string[] | undefined {
  if (fragment === '' || fragment === '/') return fragment === '' ? [] : [''];
  if (!fragment.startsWith('/')) return undefined;
  return fragment
    .slice(1)
    .split('/')
    .map((s) => {
      let d = s;
      try {
        d = decodeURIComponent(s);
      } catch {
        // keep as written
      }
      return d.replace(/~1/g, '/').replace(/~0/g, '~');
    });
}

function getAt(root: unknown, segs: readonly string[]): unknown {
  let v = root;
  for (const s of segs) {
    if (v === null || typeof v !== 'object') return undefined;
    if (!Object.prototype.hasOwnProperty.call(v, s)) return undefined;
    v = (v as Record<string, unknown>)[s];
  }
  return v;
}

// Swagger 2.0 sources are converted to 3.1; map 3.1 pointers back to where the thing was written.
const SWAGGER2_ROOT: Record<string, string[]> = {
  schemas: ['definitions'],
  parameters: ['parameters'],
  responses: ['responses'],
  securitySchemes: ['securityDefinitions'],
};
function swagger2Pointer(ptr: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  if (ptr[0] === 'components' && ptr[1] && SWAGGER2_ROOT[ptr[1]]) {
    out.push(...(SWAGGER2_ROOT[ptr[1]] ?? []));
    i = 2;
  }
  for (; i < ptr.length; i++) {
    const s = ptr[i] as string;
    // responses/200/content/<mt>/schema → responses/200/schema
    if (s === 'content' && ptr[i - 2] === 'responses') {
      i++;
      continue;
    }
    // parameters/0/schema/type → parameters/0/type
    if (s === 'schema' && ptr[i - 2] === 'parameters') continue;
    out.push(s);
  }
  return out;
}

export function detectVersion(root: unknown): { kind: 'swagger2' | 'openapi3' | 'unknown'; version?: string } {
  if (!isObj(root)) return { kind: 'unknown' };
  if (typeof root.swagger === 'string' || typeof root.swagger === 'number') return { kind: 'swagger2', version: String(root.swagger) };
  if (typeof root.openapi === 'string') return { kind: 'openapi3', version: root.openapi };
  return { kind: 'unknown' };
}

export function loadSpec(input: Input, opts: { autoUpgrade: boolean; onStage?: (stage: 'parse' | 'normalise') => void }): LoadedSpec {
  const rootFile = input.name;
  const parsed = new Map<string, ParsedDocument>();
  opts.onStage?.('parse');
  const main = parseDocument(input.content, rootFile);
  if (main.errors.length > 0) throw new OpenApiParseError(rootFile, main.errors);
  parsed.set(rootFile, main);
  const raw = main.value;
  if (!isObj(raw)) throw new OpenApiParseError(rootFile, [{ line: 1, column: 1, message: 'The document is not an object', hint: 'An OpenAPI document starts with keys such as openapi, info and paths.' }]);
  const det = detectVersion(raw);
  if (det.kind === 'unknown')
    throw new OpenApiParseError(rootFile, [{ line: 1, column: 1, message: 'No `openapi` or `swagger` version field', hint: 'Add `openapi: 3.1.0` (or `swagger: "2.0"`) at the top of the file.' }]);
  opts.onStage?.('normalise');
  let root: Record<string, unknown> = raw;
  const isSwagger2 = det.kind === 'swagger2';
  const is30 = det.kind === 'openapi3' && /^3\.0(\.|$)/.test(det.version ?? '');
  if (isSwagger2 || (is30 && opts.autoUpgrade)) {
    // upgrade() mutates its input; keep the parsed tree intact for positions.
    root = upgrade(structuredClone(raw) as Record<string, unknown>).specification as unknown as Record<string, unknown>;
  }

  const fileValue = (file: string): unknown => {
    if (file === rootFile) return root;
    let doc = parsed.get(file);
    if (!doc) {
      const content = input.files?.[file];
      if (content === undefined) return undefined;
      doc = parseDocument(content, file);
      parsed.set(file, doc);
    }
    return doc.value;
  };

  // IN-04 / OA-02: `name` and the `files` keys may use different roots. The app names a dropped
  // folder's entry `pay/openapi.yaml` with keys relative to the folder (`openapi.yaml`,
  // `schemas/card.yaml`); the CLI names it as typed (`specs/v1/openapi.yaml`, `../v1/openapi.yaml`)
  // with keys relative to the spec's own folder. Find the prefix that maps the entry name onto
  // its key, then look a path up as written, with that prefix removed, and relative to each
  // ancestor folder of the entry.
  const keyByNorm = new Map<string, string>();
  for (const k of Object.keys(input.files ?? {}).sort()) if (!isUrl(k) && !keyByNorm.has(normalisePath(k))) keyByNorm.set(normalisePath(k), k);
  const rootNorm = normalisePath(rootFile);
  let entryKey: string | undefined;
  for (const n of keyByNorm.keys()) {
    const fits = rootNorm === n || rootNorm.endsWith(`/${n}`) || rootNorm.endsWith(`:${n}`);
    if (fits && (entryKey === undefined || n.length > entryKey.length)) entryKey = n;
  }
  const prefixes: string[] = [];
  if (entryKey !== undefined) prefixes.push(rootNorm.slice(0, rootNorm.length - entryKey.length));
  for (let d = dirname(rootNorm); d; d = dirname(d.slice(0, -1))) if (!prefixes.includes(d)) prefixes.push(d);
  const lookup = (path: string): string | undefined => {
    const n = normalisePath(path);
    const tries = [n];
    for (const p of prefixes) if (p && n.startsWith(p)) tries.push(n.slice(p.length));
    for (const t of tries) {
      if (t === rootNorm || (entryKey !== undefined && t === entryKey)) return rootFile;
      const k = keyByNorm.get(t);
      if (k !== undefined) return k;
    }
    return undefined;
  };

  const unresolved = new Set<string>();

  const resolveRef = (ref: string, fromFile: string): { value: unknown; loc: Loc } | undefined => {
    const hash = ref.indexOf('#');
    const filePart = hash < 0 ? ref : ref.slice(0, hash);
    const fragment = hash < 0 ? '' : ref.slice(hash + 1);
    // Remote URLs are never fetched here. A caller that was allowed to fetch them (the CLI's
    // --allow-external-refs) passes their content in `files`, keyed by absolute URL.
    let file = fromFile;
    if (filePart !== '' && (isUrl(filePart) || isUrl(fromFile))) {
      let abs: string;
      try { abs = new URL(filePart, isUrl(fromFile) ? fromFile : undefined).toString(); } catch { return undefined; }
      if (input.files?.[abs] === undefined) return undefined;
      file = abs;
    } else if (filePart !== '') {
      const found = lookup(dirname(fromFile) + filePart);
      if (found === undefined) return undefined;
      file = found;
    }
    const segs = decodePointer(fragment);
    if (!segs) return undefined;
    const value = getAt(fileValue(file), segs);
    if (value === undefined) return undefined;
    return { value, loc: { file, ptr: arrayToChain(segs) } };
  };

  const deref = (value: unknown, loc: Loc): Resolved => {
    let v = value;
    let l = loc;
    let refId: string | undefined;
    let refName: string | undefined;
    let siblings: Record<string, unknown> | undefined;
    const visited = new Set<string>();
    while (isObj(v) && typeof v.$ref === 'string') {
      const key = `${l.file}|${v.$ref}`;
      if (visited.has(key) || visited.size > 64) break; // a $ref chain that loops on itself
      visited.add(key);
      const target = resolveRef(v.$ref, l.file);
      if (!target) {
        // Unresolved: compared as the $ref string. The report says so (Report.warnings).
        unresolved.add(`${v.$ref} (from ${l.file})`);
        break;
      }
      const { $ref: _ref, ...rest } = v;
      void _ref;
      if (Object.keys(rest).length > 0) siblings = { ...rest, ...siblings };
      v = target.value;
      l = target.loc;
      const segs = chainToArray(l.ptr);
      refId = (l.file === rootFile ? '' : `${l.file}#`) + segs.join('.');
      refName = segs[segs.length - 1] ?? l.file;
    }
    // OpenAPI 3.1 allows keywords next to $ref (usually description); apply them over the target.
    if (siblings && isObj(v)) v = { ...v, ...siblings };
    const out: Resolved = { value: v, loc: l };
    if (refId !== undefined) out.refId = refId;
    if (refName !== undefined) out.refName = refName;
    return out;
  };

  const position = (loc: Loc): SourcePos => {
    const doc = parsed.get(loc.file);
    if (!doc) return { file: loc.file, line: 1, column: 1 };
    let segs = chainToArray(loc.ptr);
    if (loc.file === rootFile && isSwagger2) segs = swagger2Pointer(segs);
    const p = doc.positionOf(segs);
    return { file: loc.file, line: p.line, column: p.column };
  };

  const jsonPath = (loc: Loc): string => {
    let v = fileValue(loc.file);
    let s = loc.file === rootFile ? '$' : `${loc.file}#$`;
    for (const seg of chainToArray(loc.ptr)) {
      if (Array.isArray(v) && /^\d+$/.test(seg)) s += `[${seg}]`;
      else if (/^[A-Za-z_$][\w$]*$/.test(seg)) s += `.${seg}`;
      else s += `['${seg.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}']`;
      v = v !== null && typeof v === 'object' ? (v as Record<string, unknown>)[seg] : undefined;
    }
    return s;
  };

  const info = isObj(root.info) ? root.info : undefined;
  const out: LoadedSpec = { rootFile, unresolved: () => [...unresolved].sort(), root, format: main.format, size: utf8Length(input.content), deref, position, jsonPath };
  if (det.version !== undefined) out.specVersion = det.version;
  const iv = info?.version;
  if (typeof iv === 'string' || typeof iv === 'number') out.infoVersion = String(iv);
  return out;
}
