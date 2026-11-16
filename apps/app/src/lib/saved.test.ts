import { expect, it } from 'vitest';
import { checkedLabel } from './saved';

it('A-13 says when a source was last fetched, in words, singular at 1', () => {
  const now = Date.parse('2026-11-16T12:00:00Z');
  const ago = (m: number) => new Date(now - m * 60000).toISOString();
  expect([undefined, ago(1), ago(5), ago(61), ago(150), ago(1500), ago(4000)].map((t) => checkedLabel(t, now))).toEqual([
    'Not checked yet', 'Checked just now', 'Checked 5 minutes ago', 'Checked 1 hour ago', 'Checked 2 hours ago', 'Checked yesterday', 'Checked 2 days ago',
  ]);
});
