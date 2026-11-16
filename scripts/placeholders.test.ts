import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM script without types
import { findPlaceholders } from './check-placeholders.mjs';

describe('M-19 website build check: no design placeholders ship', () => {
  it('finds [Launch date], [date] and any [UPPER CASE] placeholder', () => {
    expect(findPlaceholders('<span>[Launch date]</span> · [Beta date] · [date] · [BETA DATE] · [TODO]')).toEqual(['[Launch date]', '[Beta date]', '[date]', '[BETA DATE]', '[TODO]']);
  });
  it('leaves real text alone: links, arrays, single letters, regex classes, code', () => {
    expect(findPlaceholders('[0] [a, b] [x](https://e.example) [A-Z] [!] <code>[X]</code> [Specdiff] [v1.2]')).toEqual([]);
  });
});
