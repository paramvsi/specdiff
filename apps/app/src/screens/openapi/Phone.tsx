// Phone read-only layouts (X-07): M-01 shared link / summary, M-02 change list, M-03 change detail.
import type { Change, Severity } from '@specdiff/core';
import { diffText } from '@specdiff/core/text';
import { MethodChip, SeverityBadge, useToast } from '@specdiff/ui';
import * as icons from 'lucide-react';
import { useMemo, useState } from 'react';
import { openPalette } from '../../shell/commands';
import { changeLink } from '../../shell/nav';
import { useApp } from '../../state/store';
import { Md, Title } from './Title';
import { copy, groupKey, lineWindow, methodOf, SEV_LABEL } from './util';
import css from './Phone.module.css';

type View = { kind: 'summary' } | { kind: 'list' } | { kind: 'change'; id: string };

export function PhoneOpenApi() {
  const { result, before, after } = useApp();
  const [view, setView] = useState<View>({ kind: 'summary' });
  const [filter, setFilter] = useState<Severity | 'all'>('all');
  if (!result || !('report' in result)) return null;
  const { report } = result;
  const s = report.summary;
  const all = report.changes;

  if (view.kind === 'change') {
    const i = all.findIndex((c) => c.id === view.id);
    return <PhoneChange c={all[i]!} index={i} total={all.length} onBack={() => setView({ kind: 'list' })} onGo={(d) => setView({ kind: 'change', id: all[(i + d + all.length) % all.length]!.id })} />;
  }
  if (view.kind === 'list') {
    const shown = all.filter((c) => filter === 'all' || c.severity === filter);
    const groups = phoneGroups(shown, filter === 'all');
    const docs = filter === 'all' ? shown.filter((c) => c.severity === 'docs') : [];
    // M-02 under All: the changes that need attention one by one; safe and docs-only ones as one row each.
    const safe = filter === 'all' ? shown.filter((c) => c.severity === 'safe') : [];
    const collapsed = (n: number, label: string, detail: string, sev: 'safe' | 'docs', f: Severity) => (
      <section aria-label={label}>
        <p className={css.group}>{label}</p>
        <ul className={css.list}>
          <li>
            <button type="button" className={css.row} aria-label={`${label} · ${detail}`} onClick={() => setFilter(f)}>
              <SeverityBadge severity={sev} compact />
              <span className={css.all}>ALL</span>
              <span className={css.rowText}>{detail}</span>
              <icons.ChevronRight size={16} aria-hidden="true" />
            </button>
          </li>
        </ul>
      </section>
    );
    return (
      <div className={cx(css.page, css.listPage)}>
        <header className={css.bar}>
          <button type="button" className={css.icon} aria-label="Back to summary" onClick={() => setView({ kind: 'summary' })}><icons.ChevronLeft size={20} /></button>
          <h1 className={css.barTitle}>{s.total} change{s.total === 1 ? '' : 's'}</h1>
          <button type="button" className={css.icon} aria-label="Search changes" onClick={openPalette}><icons.Search size={18} /></button>
        </header>
        <div className={css.chips} role="group" aria-label="Filter changes">
          {([['all', `All ${s.total}`], ['breaking', `Breaking ${s.breaking}`], ['possibly', `Possibly ${s.possibly}`], ['safe', `Safe ${s.safe}`], ['docs', `Docs ${s.docs}`]] as const).map(([f, l]) => (
            <button key={f} type="button" className={css.chip} aria-pressed={filter === f} onClick={() => setFilter(f)}>{l}</button>
          ))}
        </div>
        <div className={css.card}>
          {groups.map(([g, cs]) => (
            <section key={g} aria-label={g}>
              <p className={css.group}>{g}</p>
              <ul className={css.list}>
                {cs.map((c) => (
                  <li key={c.id}>
                    <button type="button" className={css.row} onClick={() => setView({ kind: 'change', id: c.id })}>
                      <SeverityBadge severity={c.severity ?? 'docs'} compact />
                      {methodOf(c) ? <MethodChip method={methodOf(c)!} /> : <span className={css.all}>ALL</span>}
                      <span className={cx(css.rowText, css.oneLine)}><Title c={c} short codeClass={css.plain} />{c.sharedSchema ? ` · ${c.sharedSchema.usageCount} endpoints` : ''}</span>
                      <icons.ChevronRight size={16} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {/* M-02: safe and docs-only changes collapse into one row each; the row opens that filter. */}
          {safe.length > 0 && collapsed(safe.length, `${safe.length} safe changes`, 'Additions and relaxed rules', 'safe', 'safe')}
          {docs.length > 0 && collapsed(docs.length, `${docs.length} operation${docs.length === 1 ? '' : 's'}`, 'Descriptions updated', 'docs', 'docs')}
        </div>
      </div>
    );
  }
  const breaking = all.filter((c) => c.severity === 'breaking');
  return (
    <div className={css.page}>
      <p className={css.notice}><icons.Eye size={15} aria-hidden="true" /> Read-only on phones. Open on a larger screen to review or export.</p>
      {/* M-01: the title on the ground, then the version, four severity tiles and the breaking list. */}
      <section className={css.summary} aria-labelledby="m-title">
        <p className={css.kicker}>Shared comparison</p>
        <h1 id="m-title" className={css.title}>{before?.name} → {after?.name}</h1>
        {result.mode === 'openapi' && <span className={css.modeChip}>{specLabel(report.inputs.after.specVersion)}</span>}
      </section>
      {report.versionCheck && (
        <div className={css.version}><span className={css.versionLabel}>Suggested version</span><span className={css.versionValue}>{report.versionCheck.suggested} <span className={css.bump}>{report.versionCheck.bump}</span></span></div>
      )}
      <dl className={css.counts}>
        {(['breaking', 'possibly', 'safe', 'docs'] as const).map((k) => <div key={k} className={css.tile}><dt><SeverityBadge severity={k} className={css.tileBadge} /></dt><dd>{s[k]}<span className="sd-visually-hidden"> {SEV_LABEL[k]}</span></dd></div>)}
      </dl>
      {breaking.length > 0 && (
        <section className={cx(css.card, css.flush)} aria-labelledby="m-breaking">
          <h2 id="m-breaking" className={css.h2}>Breaking changes</h2>
          <ul className={css.list}>
            {breaking.map((c) => (
              <li key={c.id}><button type="button" className={css.row} onClick={() => setView({ kind: 'change', id: c.id })}><SeverityBadge severity="breaking" compact />{methodOf(c) ? <MethodChip method={methodOf(c)!} /> : <span className={css.all}>ALL</span>}<span className={cx(css.rowText, css.oneLine)}><Title c={c} short codeClass={css.plain} /></span><icons.ChevronRight size={16} aria-hidden="true" /></button></li>
            ))}
          </ul>
        </section>
      )}
      <button type="button" className={css.primary} onClick={() => setView({ kind: 'list' })}>{s.total === 1 ? 'See the change' : `See all ${s.total} changes`}</button>
      <p className={css.privacy}><icons.Shield size={13} aria-hidden="true" /> Decoded on this phone. Nothing was uploaded.</p>
    </div>
  );
}

/** "OpenAPI 3.1", "Swagger 2.0" from the spec's version string. */
function specLabel(v: string | undefined): string {
  if (!v) return 'OpenAPI';
  return `${v.startsWith('2') ? 'Swagger' : 'OpenAPI'} ${v.split('.').slice(0, 2).join('.')}`;
}

const SEV_RANK: Record<Severity, number> = { breaking: 0, possibly: 1, safe: 2, docs: 3 };
const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(' ');

/**
 * M-02 groups: shared-schema (components.*) groups first, then one group per path; each group and
 * the rows in it ordered Breaking → Docs. Each change is one row, so a shared-schema change is
 * listed once with its endpoint count. With `collapse`, safe and docs-only changes are left out (they
 * become the "N safe changes" and "N operations · Descriptions updated" rows).
 */
function phoneGroups(changes: Change[], collapse: boolean): Array<[string, Change[]]> {
  const groups = new Map<string, Change[]>();
  for (const c of changes) {
    if (collapse && (c.severity === 'docs' || c.severity === 'safe')) continue;
    const k = groupKey(c, 'path');
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  const rank = (c: Change) => SEV_RANK[c.severity ?? 'docs'];
  const worst = (cs: Change[]) => Math.min(...cs.map(rank));
  return [...groups.entries()]
    .map(([k, cs], i) => ({ k, cs: cs.map((c, j) => [c, j] as const).sort(([a, x], [b, y]) => rank(a) - rank(b) || x - y).map(([c]) => c), i }))
    .sort((a, b) => Number(!a.k.startsWith('components.')) - Number(!b.k.startsWith('components.')) || worst(a.cs) - worst(b.cs) || a.i - b.i)
    .map(({ k, cs }) => [k, cs]);
}

function PhoneChange({ c, index, total, onBack, onGo }: { c: Change; index: number; total: number; onBack: () => void; onGo: (d: number) => void }) {
  const { before, after } = useApp();
  const { toast } = useToast();
  const rows = useMemo(() => {
    const a = lineWindow(before?.content ?? '', c.location.before?.line ?? c.location.after?.line, 3);
    const b = lineWindow(after?.content ?? '', c.location.after?.line ?? c.location.before?.line, 3);
    return { d: diffText(a.lines.join('\n') + '\n', b.lines.join('\n') + '\n', { ignoreWhitespace: false, ignoreCase: false, ignoreLineEndings: true, precision: 'word', filters: [], transforms: [] }), line: c.location.after?.line ?? c.location.before?.line };
  }, [c, before, after]);
  // The window's lines without their shared indentation, so the change fits a phone (M-03).
  const lines = useMemo(() => {
    const all = rows.d.rows.flatMap((r, i) => r.type === 'change' ? [{ k: 'del', s: r.left, i: `${i}a` }, { k: 'add', s: r.right, i: `${i}b` }] : [{ k: r.type === 'same' ? 'same' : r.type, s: r.right ?? r.left, i: `${i}` }]);
    const text = all.map((x) => ({ ...x, t: x.s?.segs.map((g) => g.text).join('') ?? '' }));
    const indent = Math.min(...text.filter((x) => x.t.trim()).map((x) => /^ */.exec(x.t)![0].length));
    return text.map((x) => ({ ...x, t: Number.isFinite(indent) ? x.t.slice(indent) : x.t }));
  }, [rows]);
  return (
    <div className={cx(css.page, css.listPage)}>
      <header className={css.bar}>
        <button type="button" className={css.icon} aria-label="Back to the list" onClick={onBack}><icons.ChevronLeft size={20} /></button>
        <h1 className={css.barTitle}>{index + 1} of {total}</h1>
        <button type="button" className={css.icon} aria-label="Previous change" onClick={() => onGo(-1)}><icons.ChevronUp size={20} /></button>
        <button type="button" className={css.icon} aria-label="Next change" onClick={() => onGo(1)}><icons.ChevronDown size={20} /></button>
      </header>
      {/* M-03: path and title on the ground; the diff in its own card under a "Unified · line N" band. */}
      <section className={css.changeHead} aria-labelledby="m-change">
        <div className={css.meta}>{methodOf(c) && <MethodChip method={methodOf(c)!} />}<code>{c.operation?.path ?? c.sourceBlock}</code><SeverityBadge severity={c.severity ?? 'docs'} /></div>
        <h2 id="m-change" className={css.changeTitle}><Title c={c} codeClass={css.plain} /></h2>
      </section>
      <div className={css.diffCard}>
        <p className={css.diffHead}>Unified · line {rows.line}</p>
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrolls sideways */}
        <div className={css.code} role="region" aria-label="Source around the change" tabIndex={0}>
          {lines.map((x) => (
            <div key={x.i} className={css.line} data-kind={x.k}><span aria-hidden="true">{x.k === 'del' ? '−' : x.k === 'add' ? '+' : ' '}</span><span>{x.t}</span>{x.k !== 'same' && <span className="sd-visually-hidden">{x.k === 'del' ? ' (removed)' : ' (added)'}</span>}</div>
          ))}
        </div>
      </div>
      {c.explanation && (
        <section className={css.card}>
          <h3 className={css.eyebrow}>Why it breaks</h3><p className={css.body}><Md text={`${c.explanation.who} ${c.explanation.see}`} /></p>
          <h3 className={css.eyebrow}>How to avoid it</h3><p className={css.body}><Md text={c.explanation.avoid} /></p>
          <code className={css.small}>rule: {c.ruleId}</code>
        </section>
      )}
      <button type="button" className={css.secondary} onClick={() => { void copy(changeLink(c.id)); toast({ title: 'Link copied' }); }}><icons.Link size={15} aria-hidden="true" /> Copy link to this change</button>
    </div>
  );
}
