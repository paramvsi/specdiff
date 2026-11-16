// Specdiff's own changelog (W-06, WEB-06), built from the Changesets CHANGELOG.md files of the
// published packages: real releases only, no placeholders (M-19). The packages are versioned together
// (.changeset/config.json "fixed"), so one release lists every package's entries once.
export interface Release {
  version: string;
  /** ISO date, or undefined when it is not known yet (no date is shown then). */
  date?: string | undefined;
  latest?: boolean;
  sections: Array<{ title: string; items: string[] }>;
}

/**
 * Release dates. Changesets writes none, so they live here; add a line when a version is published.
 * 0.1.0: published to npm on 2026-11-15 (docs/RELEASING.md).
 */
const DATES: Record<string, string> = { '0.1.0': '2026-11-15' };

const TITLES: Record<string, string> = { 'Major Changes': 'Breaking changes', 'Minor Changes': 'Added', 'Patch Changes': 'Fixed' };
const ORDER = ['Breaking changes', 'Added', 'Fixed'];

/** Parse one CHANGELOG.md: `## <version>`, `### <Major|Minor|Patch> Changes`, `- item` (continuation lines indented). */
export function parseChangelog(md: string): Map<string, Map<string, string[]>> {
  const out = new Map<string, Map<string, string[]>>();
  let version: Map<string, string[]> | undefined;
  let section: string[] | undefined;
  for (const line of md.split(/\r?\n/)) {
    const v = /^## (\S+)/.exec(line);
    if (v) { version = new Map(); out.set(v[1]!, version); section = undefined; continue; }
    const s = /^### (.+)$/.exec(line);
    if (s && version) { const t = TITLES[s[1]!.trim()] ?? s[1]!.trim(); section = version.get(t) ?? []; version.set(t, section); continue; }
    const item = /^- (.+)$/.exec(line);
    if (item && section) section.push(item[1]!.trim());
    else if (section?.length && /^\s{2,}\S/.test(line) && !/^\s+- /.test(line)) section[section.length - 1] += ` ${line.trim()}`;
  }
  return out;
}

/** Merge several packages' changelogs into releases, newest first. Dependency bumps are left out. */
export function mergeReleases(files: string[]): Release[] {
  const all = new Map<string, Map<string, Set<string>>>();
  for (const md of files) {
    for (const [version, sections] of parseChangelog(md)) {
      const v = all.get(version) ?? new Map<string, Set<string>>();
      all.set(version, v);
      for (const [title, items] of sections) {
        const kept = items.filter((i) => !/^Updated dependencies/.test(i));
        if (!kept.length) continue;
        const set = v.get(title) ?? new Set<string>();
        for (const i of kept) set.add(i);
        v.set(title, set);
      }
    }
  }
  const semver = (s: string) => s.split(/[.-]/).map((x) => (/^\d+$/.test(x) ? Number(x) : 0));
  const newest = (a: string, b: string) => { const x = semver(a), y = semver(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return (y[i] ?? 0) - (x[i] ?? 0); return 0; };
  return [...all.keys()]
    .filter((v) => [...all.get(v)!.values()].some((s) => s.size))
    .sort(newest)
    .map((version, i) => ({
      version,
      date: DATES[version],
      ...(i === 0 ? { latest: true } : {}),
      sections: [...all.get(version)!.entries()]
        .filter(([, s]) => s.size)
        .sort(([a], [b]) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99))
        .map(([title, s]) => ({ title, items: [...s] })),
    }));
}

// Read at build time by Vite, so the page has no file access at run time.
const files = Object.values(import.meta.glob<string>('../../../../packages/*/CHANGELOG.md', { query: '?raw', import: 'default', eager: true }));

export const releases: Release[] = mergeReleases(files);

/** True when the release has a real ISO date. */
export const hasDate = (r: Release): r is Release & { date: string } => !!r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date);
