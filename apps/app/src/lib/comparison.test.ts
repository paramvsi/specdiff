import { describe, expect, it } from 'vitest';
import { isComparisonName, readComparisonFile } from './comparison';

describe('comparison files (OUT-06)', () => {
  const payload = {
    left: { name: 'a.json', content: '{"a":1}' },
    right: { name: 'b.json', content: '{"a":2}' },
    mode: 'json',
    view: { changeId: 'c-0001', tab: 'workspace' },
  };
  it('reads a valid .specdiff.json payload', () => {
    expect(readComparisonFile(JSON.stringify(payload))).toEqual(payload);
    expect(isComparisonName('comparison.specdiff.json')).toBe(true);
    expect(isComparisonName('config.json')).toBe(false);
  });
  it('rejects JSON that is not a comparison', () => {
    expect(readComparisonFile('{"region":"x"}')).toBeNull();
    expect(readComparisonFile('not json')).toBeNull();
    expect(readComparisonFile(JSON.stringify({ ...payload, mode: 'pdf' }))).toBeNull();
  });
});
