// `specdiff history <file> --out versions.json` (PK-04): a Viewer version set (docs/07 §8) from git tags, else commits.
import { parse } from 'yaml';
import { git } from './inputs';

export interface VersionSet { versions: Array<{ label: string; source: string; date?: string; spec: object }>; current: string; compareWith?: string }

export function buildHistory(file: string, max = 20): VersionSet {
  if (file.startsWith('-')) throw new Error('File must not start with "-".');
  const versions: VersionSet['versions'] = [];
  const read = (rev: string) => { try { return parse(git(['show', '--end-of-options', `${rev}:${file}`])) as object; } catch { return undefined; } };
  const tags = git(['tag', '--sort=creatordate', '--format=%(refname:short)|%(creatordate:iso-strict)']).split('\n').filter(Boolean);
  for (const line of tags) {
    const [tag, date] = line.split('|') as [string, string];
    if (tag.startsWith('-')) continue;
    const spec = read(tag);
    if (spec) versions.push({ label: (spec as { info?: { version?: string } }).info?.version ?? tag, source: tag, date, spec });
  }
  if (!versions.length) {
    const log = git(['log', `--max-count=${max}`, '--format=%H|%cI', '--', file]).split('\n').filter(Boolean).reverse();
    for (const line of log) {
      const [sha, date] = line.split('|') as [string, string];
      const spec = read(sha);
      if (spec) versions.push({ label: (spec as { info?: { version?: string } }).info?.version ?? sha.slice(0, 7), source: sha.slice(0, 7), date, spec });
    }
  }
  // Keep one entry per label (the latest), in order.
  const seen = new Map<string, number>();
  versions.forEach((v, i) => seen.set(v.label, i));
  const unique = versions.filter((v, i) => seen.get(v.label) === i).slice(-max);
  if (!unique.length) throw new Error(`No versions of ${file} found in git history.`);
  return { versions: unique, current: unique.at(-1)!.label, ...(unique.length > 1 ? { compareWith: unique.at(-2)!.label } : {}) };
}
