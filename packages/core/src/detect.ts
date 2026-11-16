// Mode detection (IN-07): extension first, then content sniffing.
import type { Mode } from './schemas';

const CODE: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  java: 'java', py: 'python', go: 'go', rb: 'ruby', rs: 'rust', kt: 'kotlin', cs: 'csharp',
  c: 'c', h: 'c', cpp: 'cpp', swift: 'swift', php: 'php', sh: 'shell', sql: 'sql', css: 'css', html: 'html',
};

export interface Detected { mode: Mode; language?: string; specVersion?: string }

export function detectMode(name: string, content: string): Detected {
  // "client.ts (new)" or "README.md (PR)": ignore a trailing note in brackets.
  const ext = name.toLowerCase().replace(/\s*\([^)]*\)$/, '').split('.').pop() ?? '';
  const head = content.slice(0, 4096);
  // Markdown and code files are what their extension says, even when they quote a spec (a README's yaml block).
  if (ext === 'md' || ext === 'markdown' || ext === 'mdx') return { mode: 'markdown' };
  if (CODE[ext]) return { mode: 'code', language: CODE[ext] };
  const oa = /^[\s{]*["']?(openapi|swagger)["']?\s*:\s*["']?(\d+\.\d+(?:\.\d+)?)/m.exec(head);
  if (oa) return { mode: 'openapi', specVersion: oa[2]! };
  if (ext === 'json') return { mode: 'json' };
  if (ext === 'yaml' || ext === 'yml') return { mode: 'yaml' };
  const t = head.trimStart();
  if (/^[{[]/.test(t)) { try { JSON.parse(content); return { mode: 'json' }; } catch { /* not json */ } }
  if (/^#{1,6} \S/m.test(head) && /(\n\s*[-*] |\[.+\]\(.+\)|```)/.test(head)) return { mode: 'markdown' };
  if (/^[\w"'-]+:\s/m.test(t.split('\n')[0] ?? '') && !/[;{}]\s*$/m.test(head)) return { mode: 'yaml' };
  return { mode: 'text' };
}

/** Both sides decide the mode: OpenAPI only if both are specs; otherwise the more specific shared mode. */
export function detectPair(a: Detected, b: Detected): Detected {
  if (a.mode === b.mode) return a.language === b.language ? a : { mode: a.mode };
  const structural = new Set<Mode>(['openapi', 'json', 'yaml']);
  // One spec and one plain JSON/YAML file: compare structurally as YAML (JSON is valid YAML).
  if (structural.has(a.mode) && structural.has(b.mode)) return { mode: 'yaml' };
  return { mode: 'text' };
}
