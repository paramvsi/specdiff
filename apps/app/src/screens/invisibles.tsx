// Invisible characters in a changed segment are shown as named markers, so a line that is
// "changed" always shows what changed (a byte-order mark, a zero-width space, a no-break space),
// and bidi controls cannot reorder what a reviewer reads (Trojan Source, CVE-2021-42574).
// ZWJ is left alone: it joins emoji sequences.
import type { ReactNode } from 'react';
import css from './invisibles.module.css';

const NAMES: Record<string, [string, string]> = {
  '﻿': ['BOM', 'byte-order mark'],
  '​': ['ZWSP', 'zero-width space'],
  '‌': ['ZWNJ', 'zero-width non-joiner'],
  '⁠': ['WJ', 'word joiner'],
  '­': ['SHY', 'soft hyphen'],
  ' ': ['NBSP', 'no-break space'],
  '‪': ['LRE', 'left-to-right embedding'],
  '‫': ['RLE', 'right-to-left embedding'],
  '‬': ['PDF', 'pop directional formatting'],
  '‭': ['LRO', 'left-to-right override'],
  '‮': ['RLO', 'right-to-left override'],
  '⁦': ['LRI', 'left-to-right isolate'],
  '⁧': ['RLI', 'right-to-left isolate'],
  '⁨': ['FSI', 'first strong isolate'],
  '⁩': ['PDI', 'pop directional isolate'],
};
const SPLIT = new RegExp(`([${Object.keys(NAMES).join('')}])`);

export function showInvisibles(text: string): ReactNode {
  const parts = text.split(SPLIT);
  if (parts.length === 1) return text;
  return parts.map((p, i) => {
    const n = NAMES[p];
    if (!n) return p;
    const code = `U+${p.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
    return <abbr key={i} className={css.invisible} title={`${code} ${n[1]}`}>{n[0]}</abbr>;
  });
}
