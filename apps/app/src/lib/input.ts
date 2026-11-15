// Input sources (IN-01..IN-04, IN-10). Everything stays in the browser.
import type { PatchSide } from '@specdiff/core/text/patch';
import { unzipSync, strFromU8 } from 'fflate';

export interface Source {
  name: string;
  content: string;
  size: number;
  files?: Record<string, string>;
  /** IN-06: where the content came from, so one side can be reloaded. */
  origin?: { kind: 'file' | 'url' | 'paste'; url?: string };
  /** TX-12: this side was rebuilt from a patch; real line numbers and hunk starts. */
  patch?: PatchSide;
}

export const WARN_BYTES = 10 * 1024 * 1024; // IN-10: warn above 10 MB
export const TEXT_ONLY_BYTES = 25 * 1024 * 1024; // above 25 MB: offer text-only

export type SizeVerdict = 'ok' | 'warn' | 'text-only';
export function sizeVerdict(bytes: number): SizeVerdict {
  return bytes > TEXT_ONLY_BYTES ? 'text-only' : bytes > WARN_BYTES ? 'warn' : 'ok';
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** github.com/<o>/<r>/blob/<ref>/<path> → raw.githubusercontent.com/<o>/<r>/<ref>/<path>; gist too. */
export function toRawUrl(input: string): string {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return input.trim();
  }
  if (u.hostname === 'github.com') {
    const m = /^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/.exec(u.pathname);
    if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`;
  }
  // GitLab: …/-/blob/<ref>/<path> → …/-/raw/<ref>/<path> (groups and subgroups keep their path).
  if (u.hostname === 'gitlab.com' && u.pathname.includes('/-/blob/')) return `${u.origin}${u.pathname.replace('/-/blob/', '/-/raw/')}`;
  // Bitbucket: /<workspace>/<repo>/src/<ref>/<path> → …/raw/<ref>/<path>.
  if (u.hostname === 'bitbucket.org') {
    const m = /^\/([^/]+)\/([^/]+)\/src\/(.+)$/.exec(u.pathname);
    if (m) return `https://bitbucket.org/${m[1]}/${m[2]}/raw/${m[3]}`;
  }
  if (u.hostname === 'gist.github.com') {
    const m = /^\/([^/]+)\/([0-9a-f]+)\/?$/.exec(u.pathname);
    if (m) return `https://gist.githubusercontent.com/${m[1]}/${m[2]}/raw`;
  }
  return u.toString();
}

export type LoadError = {
  kind: 'invalid' | 'cors' | 'http' | 'network';
  message: string;
  status?: number;
};

export async function loadUrl(url: string, signal?: AbortSignal): Promise<Source> {
  const raw = toRawUrl(url);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw { kind: 'invalid', message: 'That is not a valid URL.' } satisfies LoadError;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
    throw {
      kind: 'invalid',
      message: 'Only http and https links can be loaded.',
    } satisfies LoadError;
  let res: Response;
  try {
    res = await fetch(parsed, {
      signal: signal ?? null,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    // A browser hides the reason; a TypeError from fetch on a reachable host is almost always CORS.
    throw {
      kind: 'cors',
      message: `The server at ${parsed.host} didn't allow this page to read the file (CORS).`,
    } satisfies LoadError;
  }
  if (!res.ok)
    throw {
      kind: 'http',
      status: res.status,
      message: `The server answered ${res.status} ${res.statusText}.`.replace(/ \.$/, '.'),
    } satisfies LoadError;
  const content = await res.text();
  const name = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() ?? parsed.host);
  return { name, content, size: new Blob([content]).size, origin: { kind: 'url', url } };
}

const SPEC_FILE = /\.(ya?ml|json)$/i;
const ROOT_HINT = /(^|\/)(openapi|swagger|api|spec)[^/]*\.(ya?ml|json)$/i;

/** Pick the entry file of a multi-file spec: a file that declares openapi/swagger, preferring conventional names and the shallowest path. */
export function pickEntry(files: Record<string, string>): string | undefined {
  const specs = Object.keys(files).filter(
    (p) =>
      SPEC_FILE.test(p) && /^[\s{]*["']?(openapi|swagger)["']?\s*:/m.test(files[p]!.slice(0, 4096)),
  );
  const pool = specs.length ? specs : Object.keys(files).filter((p) => SPEC_FILE.test(p));
  return pool.sort(
    (a, b) =>
      Number(ROOT_HINT.test(b)) - Number(ROOT_HINT.test(a)) ||
      a.split('/').length - b.split('/').length ||
      a.localeCompare(b),
  )[0];
}

/** A ZIP may unpack to at most this much in total, and this many files (zip bombs reuse data across entries). */
export const ZIP_MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const ZIP_MAX_FILES = 10_000;

export function fromZip(name: string, bytes: Uint8Array): Source {
  let total = 0;
  let count = 0;
  const entries = unzipSync(bytes, {
    // fflate inflates each entry into a buffer of its declared size, so declared sizes bound the work.
    filter: (f) => {
      if (f.name.endsWith('/') || f.name.startsWith('__MACOSX/') || f.originalSize >= TEXT_ONLY_BYTES) return false;
      total += f.originalSize;
      if (++count > ZIP_MAX_FILES || total > ZIP_MAX_TOTAL_BYTES)
        throw { kind: 'invalid', message: `${name}.zip unpacks to too much: more than ${ZIP_MAX_TOTAL_BYTES / 1024 / 1024} MB or ${ZIP_MAX_FILES.toLocaleString('en')} files.` } satisfies LoadError;
      return true;
    },
  });
  const files: Record<string, string> = {};
  for (const [p, data] of Object.entries(entries)) files[p] = strFromU8(data);
  return fromFiles(name, files);
}

export function fromFiles(name: string, files: Record<string, string>): Source {
  const entry = pickEntry(files);
  if (!entry)
    throw {
      kind: 'invalid',
      message: `No YAML or JSON file found in ${name}.`,
    } satisfies LoadError;
  const content = files[entry]!;
  const size = Object.values(files).reduce((n, c) => n + c.length, 0);
  return { name: `${name}/${entry}`, content, size, files, origin: { kind: 'file' } };
}

/** Read whatever was dropped or picked: one file, a ZIP, or a folder (webkitGetAsEntry). */
export async function fromDataTransfer(dt: DataTransfer): Promise<Source | undefined> {
  const item = [...dt.items].find((i) => i.kind === 'file');
  const entry = item?.webkitGetAsEntry?.();
  if (entry?.isDirectory) {
    const files: Record<string, string> = {};
    await walk(entry as FileSystemDirectoryEntry, '', files);
    return fromFiles(entry.name, files);
  }
  const file = dt.files[0];
  return file ? fromFile(file) : undefined;
}

export async function fromFile(file: File): Promise<Source> {
  const s: Source = /\.zip$/i.test(file.name)
    ? fromZip(file.name.replace(/\.zip$/i, ''), new Uint8Array(await file.arrayBuffer()))
    : { name: file.name, content: await file.text(), size: file.size, origin: { kind: 'file' } };
  picked.set(s, file);
  return s;
}

// IN-06: the File each source was read from. A browser may refuse to re-read a file that changed on disk.
const picked = new WeakMap<Source, File>();

export function canReload(s: Source | null | undefined): boolean {
  return s?.origin?.kind === 'file' || (s?.origin?.kind === 'url' && !!s.origin.url);
}

/**
 * Re-read one side from where it came (IN-06). URL: fetch again. File: read the same File again; when the browser
 * can't (the file changed or the source came from history), returns 'pick' so the screen asks for the file again.
 */
export async function reloadSource(s: Source): Promise<Source | 'pick'> {
  if (s.origin?.kind === 'url' && s.origin.url) return loadUrl(s.origin.url);
  if (s.origin?.kind === 'file') {
    const f = picked.get(s);
    if (!f) return 'pick';
    try {
      return await fromFile(f);
    } catch {
      return 'pick';
    }
  }
  throw { kind: 'invalid', message: 'Pasted text has nowhere to reload from.' } satisfies LoadError;
}

async function walk(
  dir: FileSystemDirectoryEntry,
  prefix: string,
  out: Record<string, string>,
): Promise<void> {
  const reader = dir.createReader();
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
    if (!batch.length) return;
    for (const e of batch) {
      const path = prefix + e.name;
      if (e.isDirectory) {
        if (!e.name.startsWith('.') && e.name !== 'node_modules')
          await walk(e as FileSystemDirectoryEntry, path + '/', out);
      } else if (SPEC_FILE.test(e.name))
        out[path] = await new Promise<File>((res, rej) =>
          (e as FileSystemFileEntry).file(res, rej),
        ).then((f) => f.text());
    }
  }
}
