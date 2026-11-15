import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { showInvisibles } from './invisibles';

const html = (s: string) => renderToStaticMarkup(<>{showInvisibles(s)}</>);

describe('showInvisibles', () => {
  it('leaves ordinary text alone', () => {
    expect(showInvisibles('price 10')).toBe('price 10');
  });
  it('names a byte-order mark, zero-width space and no-break space', () => {
    expect(html('﻿a​b c')).toMatch(/>BOM<.*a.*>ZWSP<.*b.*>NBSP<.*c/);
  });
  it('replaces bidi controls so they cannot reorder the line (Trojan Source)', () => {
    const out = html('if (x) {‮ } else {');
    expect(out).not.toContain('‮');
    expect(out).toContain('>RLO<');
    expect(out).toContain('title="U+202E right-to-left override"');
  });
  it('keeps the zero-width joiner inside emoji', () => {
    expect(showInvisibles('👨‍👩')).toBe('👨‍👩');
  });
});
