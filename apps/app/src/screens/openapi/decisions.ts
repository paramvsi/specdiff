// OA-21: the app writes and reads `.specdiff/decisions.json` (docs/07 §4), the file the CLI honours.
// Browsers save downloads without folders or a leading dot, so the file is offered as `decisions.json`
// and the UI says to put it in `.specdiff/`.
import { DecisionsFile, type Change } from '@specdiff/core';

export const DECISIONS_NAME = 'decisions.json';

/** Stable text: fingerprints sorted, two-space indent, trailing newline (rule 8, deterministic output). */
export function decisionsJson(file: DecisionsFile): string {
  const decisions = Object.fromEntries(Object.keys(file.decisions).sort().map((k) => [k, file.decisions[k]!]));
  return JSON.stringify({ version: 1, decisions }, null, 2) + '\n';
}

export type ReadDecisions =
  | { file: DecisionsFile; matched: number; stale: string[] }
  | { error: string };

/** Validate a decisions file against `DecisionsFile` and say which fingerprints no longer match a change. */
export function readDecisions(text: string, changes: Change[]): ReadDecisions {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { error: 'That file is not valid JSON.' }; }
  const r = DecisionsFile.safeParse(raw);
  if (!r.success) return { error: `That is not a decisions file: ${r.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || '(root)'} ${i.message}`).join('; ')}.` };
  const present = new Set(changes.map((c) => c.fingerprint));
  const fps = Object.keys(r.data.decisions).sort();
  const stale = fps.filter((fp) => !present.has(fp));
  return { file: r.data, matched: fps.length - stale.length, stale };
}
