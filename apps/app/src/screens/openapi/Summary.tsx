// A-04 OpenAPI summary (OA-08, OA-14, OA-19, OA-21, X-11).
import { Config, rules, type Change } from '@specdiff/core';
import { MethodChip, SegmentedControl, SeverityBadge } from '@specdiff/ui';
import * as icons from 'lucide-react';
import { useApp } from '../../state/store';
import { useNav, focusChange } from '../../shell/nav';
import { decisionOf, headline, methodOf, SEV_LABEL } from './util';
import css from './Summary.module.css';

export function Summary() {
  const { result, decisions, settings, updateConfig, compare, setScreen } = useApp();
  if (!result || !('report' in result)) return null;
  const { report } = result;
  const s = report.summary;
  const breakingReviewed = report.changes.filter((c) => c.severity === 'breaking' && decisionOf(decisions, c)).length;
  const config = Config.parse(settings.config);
  const enabled = rules.filter((x) => x.reportedAs === 'change' && config.rules[x.id]?.enabled !== false && !(x.id === 'extension-changed' && config.ignore.extensions));
  const breaking = report.changes.filter((c) => c.severity === 'breaking');
  const possibly = report.changes.filter((c) => c.severity === 'possibly');
  const shared = groupShared(report.changes);
  const areas = Object.entries(s.byArea).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...areas.map(([, n]) => n));
  const vc = report.versionCheck;

  return (
    <div className={css.page}>
      <div className={css.stats}>
        <Stat sev="breaking" n={s.breaking} caption={`${breakingReviewed} of ${s.breaking} reviewed`} />
        <Stat sev="possibly" n={s.possibly} caption="Need a decision" />
        <Stat sev="safe" n={s.safe} caption="Additions and relaxed rules" />
        <Stat sev="docs" n={s.docs} caption="Hidden from the changelog" />
        {vc && (
          <section className={css.version} aria-label="Suggested version">
            <p className={css.versionLabel}>Suggested version</p>
            <p className={css.versionValue}>{vc.suggested} <span className={css.bump}>{vc.bump}</span></p>
            <p className={css.versionMsg} data-verdict={vc.verdict}>{vc.verdict !== 'ok' && <icons.TriangleAlert size={14} aria-hidden="true" />} {vc.message}</p>
          </section>
        )}
      </div>

      <div className={css.grid}>
        <div className={css.main}>
          <section className={css.card} aria-labelledby="breaking-h">
            <header className={css.cardHead}>
              <h2 id="breaking-h" className={css.h2}>Breaking changes</h2>
              {s.breaking - breakingReviewed > 0 && <span className={css.toReview}><span aria-hidden="true" className={css.bang}>!</span> {s.breaking - breakingReviewed} to review</span>}
            </header>
            {breaking.length ? breaking.map((c) => <BreakingRow key={c.id} c={c} />) : <p className={css.empty}>No breaking changes. Nice.</p>}
          </section>
          {possibly.length > 0 && (
            <section className={css.card} aria-labelledby="possibly-h">
              <h2 id="possibly-h" className={css.h2}>Possibly breaking</h2>
              <ul className={css.plist}>
                {possibly.map((c) => (
                  <li key={c.id}>
                    <button type="button" className={css.prow} onClick={() => focusChange(c.id)}>
                      <span className={css.dot} data-sev="possibly" aria-hidden="true" />
                      {methodOf(c) ? <MethodChip method={methodOf(c)!} /> : <span className={css.schemaChip}>schema</span>}
                      <span className={css.ptitle}><Title c={c} /></span>
                      <code className={css.rule}>{c.ruleId}</code>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className={css.side}>
          <section className={css.card} aria-labelledby="where-h">
            <h2 id="where-h" className={css.h3}>Where the {s.total} changes are</h2>
            <dl className={css.areas}>
              {areas.map(([area, n]) => (
                <div key={area} className={css.area}>
                  <dt>{area}</dt>
                  <dd><span className={css.track} aria-hidden="true"><span className={css.fill} style={{ width: `${(n / max) * 100}%` }} /></span><span className={css.n}>{n}</span></dd>
                </div>
              ))}
            </dl>
          </section>
          {shared.length > 0 && (
            <section className={css.card} aria-labelledby="shared-h">
              <h2 id="shared-h" className={css.h3}><icons.Layers size={16} aria-hidden="true" /> Shared schema changes</h2>
              <p className={css.muted}>Each change is listed once, at the schema you edited.</p>
              <ul className={css.shared}>
                {shared.map((g) => (
                  <li key={g.name}>
                    <button type="button" className={css.sharedRow} onClick={() => focusChange(g.first.id)}>
                      <span><code className={css.schema}>{g.name}</code><span className={css.sharedWhat}>{g.what}</span></span>
                      <span className={css.muted}>{g.count} endpoint{g.count === 1 ? '' : 's'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className={css.card} aria-labelledby="checks-h">
            <h2 id="checks-h" className={css.h3}>Checks</h2>
            <p className={css.label}>Strictness</p>
            <SegmentedControl label="Strictness" value={config.preset} onValueChange={(p) => { updateConfig((c) => ({ ...c, preset: p })); void compare(); }} options={[{ value: 'wire', label: 'Wire' }, { value: 'sdk', label: 'SDK' }]} />
            <p className={css.muted}>Wire checks what breaks HTTP requests and responses. SDK also flags renamed operationIds, schemas and enums.</p>
            <dl className={css.facts}>
              <div><dt>Rules on</dt><dd>{enabled.length} of {rules.filter((x) => x.reportedAs === 'change').length}</dd></div>
              <div><dt>Ignored paths</dt><dd>{config.ignore.paths.length ? config.ignore.paths.join(', ') : 'none'}</dd></div>
            </dl>
            <button type="button" className={css.link} onClick={() => setScreen('settings')}>Edit rules</button>
          </section>
        </aside>
      </div>
      <p className={css.privacy}><icons.Shield size={13} aria-hidden="true" /> Compared in this browser. Nothing was uploaded.</p>
    </div>
  );
}

function Stat({ sev, n, caption }: { sev: Change['severity'] & string; n: number; caption: string }) {
  return (
    <section className={css.stat} aria-label={`${SEV_LABEL[sev]}: ${n}`}>
      <SeverityBadge severity={sev} />
      <p className={css.statN}>{n}</p>
      <p className={css.statCaption}>{caption}</p>
    </section>
  );
}

export function Title({ c }: { c: Change }) {
  const h = headline(c);
  return <>{h.before}{h.code && <code className={css.code}>{h.code}</code>}{h.after}</>;
}

function BreakingRow({ c }: { c: Change }) {
  const { decisions } = useApp();
  const d = decisionOf(decisions, c);
  const set = useNav((s) => s.set);
  return (
    <article className={css.brow} aria-labelledby={`b-${c.id}`}>
      <div className={css.browHead}>
        <span className={css.op}>{methodOf(c) ? <MethodChip method={methodOf(c)!} /> : null}<code>{c.operation?.path ?? c.sourceBlock}</code></span>
        <span className={css.decision} data-d={d ?? 'open'}>
          {d === 'accepted' ? <><icons.Check size={14} aria-hidden="true" /> Accepted</> : d === 'rejected' ? <><icons.X size={14} aria-hidden="true" /> Rejected</> : <><icons.Square size={14} aria-hidden="true" /> To review</>}
        </span>
      </div>
      <div className={css.browTitleRow}>
        <h3 id={`b-${c.id}`} className={css.browTitle}><Title c={c} /></h3>
        <button type="button" className={css.link} onClick={() => { focusChange(c.id); set({ tab: 'workspace' }); }}>Open in workspace</button>
      </div>
      {c.explanation && <p className={css.explain}>{c.explanation.who} {c.explanation.see} {c.explanation.avoid}</p>}
      {c.sharedSchema && <p className={css.muted}>Comes from the shared schema {c.sharedSchema.name}, which {c.sharedSchema.usageCount} endpoint{c.sharedSchema.usageCount === 1 ? '' : 's'} use.</p>}
      <code className={css.rule}>rule: {c.ruleId}</code>
    </article>
  );
}

function groupShared(changes: Change[]) {
  const by = new Map<string, { name: string; count: number; first: Change; what: string }>();
  for (const c of changes) {
    if (!c.sharedSchema || c.severity === 'docs') continue;
    const g = by.get(c.sharedSchema.name);
    if (!g || (c.severity === 'breaking' && g.first.severity !== 'breaking')) by.set(c.sharedSchema.name, { name: c.sharedSchema.name, count: c.sharedSchema.usageCount, first: c, what: headlineShort(c) });
  }
  return [...by.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
const headlineShort = (c: Change) => {
  const t = c.path.split(' › ').at(-1) ?? '';
  return c.kind === 'removed' ? `${t} removed` : c.kind === 'added' ? `${t} added` : c.ruleId?.includes('enum') ? `${String(c.after ?? 'value')} added` : `${t} changed`;
};
