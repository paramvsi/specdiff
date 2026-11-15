// OUT-06: a comparison file (.specdiff.json, from "Download comparison") holds the same payload as a share link.
import { SharePayload } from '@specdiff/core';

/** A file that looks like a comparison file by name. */
export const isComparisonName = (name: string) => /\.specdiff\.json$/i.test(name);

/** Parse and validate a comparison file. Null when it isn't one (then it is just a JSON file to compare). */
export function readComparisonFile(content: string): SharePayload | null {
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    return null;
  }
  const r = SharePayload.safeParse(json);
  return r.success ? r.data : null;
}
