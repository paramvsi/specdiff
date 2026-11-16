import { afterEach, expect, it } from 'vitest';
import { isoDate, parseDate } from './schema';

const tz = process.env.TZ;
afterEach(() => { process.env.TZ = tz; });

it('X-13 / OA-17: x-sunset dates read the same on every machine (UTC, not the local zone)', () => {
  const inputs = ['2026-12-01', '2026-12-01 00:00', '2026-12-01T00:00:00Z', 'Tue, 01 Dec 2026 00:00:00 GMT', '2026-12-01T05:30:00+05:30'];
  for (const zone of ['UTC', 'Asia/Kolkata', 'America/Los_Angeles']) {
    process.env.TZ = zone;
    expect(inputs.map((v) => { const d = parseDate(v); return d && isoDate(d); }), zone).toEqual(['2026-12-01', '2026-12-01', '2026-12-01', '2026-12-01', '2026-12-01']);
  }
});

it('OA-17: an ambiguous x-sunset (12/1/2026: December or January?) is not a date', () => {
  expect(parseDate('12/1/2026')).toBeUndefined();
  expect(parseDate('next year')).toBeUndefined();
});
