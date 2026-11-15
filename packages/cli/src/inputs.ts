// CLI inputs: a path, or git `rev:path` (IN-12). Git calls always pass --end-of-options; revisions starting with "-" are refused.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

export interface Input { name: string; content: string; files?: Record<string, string> }

const SPEC = /\.(ya?ml|json)$/i;

export function git(args: string[], cwd = process.cwd()): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

export function parseRevPath(arg: string): { rev: string; path: string } | undefined {
  if (existsSync(arg)) return undefined;
  const m = /^([^:]+):(.+)$/.exec(arg);
  if (!m || /^[a-zA-Z]$/.test(m[1]!)) return undefined; // C:\… on Windows
  if (m[1]!.startsWith('-')) throw new Error(`Refusing git revision "${m[1]}": revisions must not start with "-".`);
  return { rev: m[1]!, path: m[2]! };
}

/** Sibling spec files so relative external $refs resolve without touching the network. */
function siblingsOnDisk(file: string): Record<string, string> {
  const root = dirname(file);
  const out: Record<string, string> = {};
  const walk = (dir: string, depth: number) => {
    if (depth > 4) return;
    for (const e of readdirSync(dir)) {
      if (e.startsWith('.') || e === 'node_modules') continue;
      const p = join(dir, e);
      const st = statSync(p);
      if (st.isDirectory()) walk(p, depth + 1);
      else if (SPEC.test(e) && st.size < 25 * 1024 * 1024) out[relative(root, p).split(sep).join('/')] = readFileSync(p, 'utf8');
    }
  };
  walk(root, 0);
  return out;
}

export function readInput(arg: string): Input {
  const rp = parseRevPath(arg);
  if (!rp) {
    if (!existsSync(arg)) throw new Error(`File not found: ${arg}`);
    const content = readFileSync(arg, 'utf8');
    return { name: arg, content, files: SPEC.test(arg) ? siblingsOnDisk(arg) : {} };
  }
  const content = git(['show', '--end-of-options', `${rp.rev}:${rp.path}`]);
  const dir = rp.path.includes('/') ? rp.path.slice(0, rp.path.lastIndexOf('/')) : '.';
  const files: Record<string, string> = {};
  const listed = git(['ls-tree', '-r', '--name-only', '--end-of-options', rp.rev, '--', dir]).split('\n').filter((f) => SPEC.test(f));
  for (const f of listed.slice(0, 500)) files[dir === '.' ? f : f.slice(dir.length + 1)] = git(['show', '--end-of-options', `${rp.rev}:${f}`]);
  return { name: arg, content, files };
}

export function describeSide(arg: string): string {
  const rp = parseRevPath(arg);
  return rp ? rp.rev : 'working tree';
}
