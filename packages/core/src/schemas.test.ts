import { describe, expect, it } from 'vitest';
import { Config } from './schemas';

describe('Config text filters', () => {
  it('refuses a filter whose pattern is not a valid regular expression', () => {
    const r = Config.safeParse({ text: { filters: [{ name: 'Broken', pattern: '([a-z', replace: '‹x›' }] } });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path.join('.')).toBe('text.filters.0.pattern');
    expect(r.error?.issues[0]?.message).toMatch(/regular expression/i);
  });
  it('accepts a valid pattern', () => {
    expect(Config.safeParse({ text: { filters: [{ name: 'Ids', pattern: 'req_[a-z0-9]{8,}', replace: '‹id›' }] } }).success).toBe(true);
  });
});
