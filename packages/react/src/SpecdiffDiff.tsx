// <SpecdiffDiff before after /> (PK-03): a minimal side-by-side text diff from core's aligned rows.
// Change is never shown by colour alone: every changed line carries + or − (and ~ for edits).
import { diffText, type Row, type Side } from '@specdiff/core/text';
import { useMemo } from 'react';
import css from './SpecdiffDiff.module.css';

export interface SpecdiffDiffProps {
  before: string;
  after: string;
  /** Accessible name of the table. */
  label?: string | undefined;
  className?: string | undefined;
}

const OPTS = { ignoreWhitespace: false, ignoreCase: false, ignoreLineEndings: true, precision: 'word' as const, filters: [], transforms: [] };
const MARK: Record<Row['type'], [string, string]> = { same: [' ', ' '], add: [' ', '+'], del: ['−', ' '], change: ['~', '~'] };

function Cell({ side, mark, kind }: { side: Side | undefined; mark: string; kind: 'del' | 'add' }) {
  if (!side) return <><td className={css.num} /><td className={css.empty} /></>;
  return (
    <>
      <td className={css.num}>{side.n}</td>
      <td className={mark.trim() ? css[kind] : undefined}>
        <span className={css.mark} aria-hidden="true">{mark}</span>
        {mark.trim() ? <span className={css.sr}>{kind === 'add' ? 'added: ' : 'removed: '}</span> : null}
        {side.segs.map((s, i) => (s.kind === 'same' ? <span key={i}>{s.text}</span> : s.kind === 'add' ? <ins key={i}>{s.text}</ins> : <del key={i}>{s.text}</del>))}
      </td>
    </>
  );
}

export function SpecdiffDiff({ before, after, label = 'Differences', className }: SpecdiffDiffProps) {
  const d = useMemo(() => diffText(before, after, OPTS), [before, after]);
  if (d.identical) return <p className={className}>The two inputs are identical.</p>;
  return (
    <div className={[css.wrap, className].filter(Boolean).join(' ')}>
      <p className={css.stats}>+{d.stats.added} added · −{d.stats.removed} removed · ~{d.stats.changed} changed</p>
      <table className={css.table} aria-label={label}>
        <thead className={css.sr}>
          <tr><th>Before line</th><th>Before</th><th>After line</th><th>After</th></tr>
        </thead>
        <tbody>
          {d.rows.map((r, i) => (
            <tr key={i}>
              <Cell side={r.left} mark={MARK[r.type][0]} kind="del" />
              <Cell side={r.right} mark={MARK[r.type][1]} kind="add" />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
