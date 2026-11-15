// An unquoted `version: 1.10` reads as the number 1.1 in YAML and JSON. Version labels must match what
// the author wrote (1.9 → 1.10 is a bump, not 1.1), so put the written literal back (VW-03, OA-09).
type WithInfo = { info?: { version?: unknown } };

export function keepWrittenVersion<T>(spec: T, text: string): T {
  const info = (spec as WithInfo)?.info;
  if (!info || typeof info.version !== 'number') return spec;
  // The first `version:` after the `info` key; specs put info near the top, before any schema
  // property that might also be called version.
  const from = text.search(/["']?info["']?\s*:/);
  const m = from < 0 ? null : /["']?version["']?\s*:\s*([0-9][^\s#,}\]]*)/.exec(text.slice(from));
  if (m && Number(m[1]) === info.version) info.version = m[1];
  return spec;
}
