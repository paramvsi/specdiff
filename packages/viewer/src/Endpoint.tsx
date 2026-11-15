// V-02 Endpoint (VW-02, VW-06, VW-08, VW-09, VW-14) and the deprecated state (OA-17).
import type { Change } from '@specdiff/core';
import { SeverityBadge, Tabs, ViewerBadge } from '@specdiff/ui';
import { ChevronRight, Clock } from 'lucide-react';
import { useMemo } from 'react';
import { changeTitle, opKeysOf } from './change-index';
import { useViewer, type Loaded } from './context';
import { PARAM_SECTIONS, fieldsOf, mediaOf } from './fields';
import { useReports } from './hooks';
import { deref, refName, type Op } from './model';
import { FieldRow, InlineText, Method, cx, statusClass } from './parts';
import css from './Viewer.module.css';

function sunsetText(s: string): string {
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Per-endpoint history across loaded versions, newest first (VW-09). */
export function useOpHistory(op: Op): { entries: Array<{ v: Loaded; changes: Change[]; added: boolean }>; pending: boolean } {
  const { loaded, store } = useViewer();
  const pairs = useMemo(() => loaded.slice(1).map((v, i) => [loaded[i]!.label, v.label] as [string, string]), [loaded]);
  const states = useReports(store, pairs);
  const entries: Array<{ v: Loaded; changes: Change[]; added: boolean }> = [];
  loaded.forEach((v, i) => {
    const exists = v.model.ops.some((o) => o.key === op.key);
    if (!exists) return;
    const before = i > 0 ? loaded[i - 1] : undefined;
    const added = !before || !before.model.ops.some((o) => o.key === op.key);
    const st = i > 0 ? states[i - 1] : undefined;
    const changes = st?.status === 'ready' ? st.report.changes.filter((c) => opKeysOf(c).includes(op.key) && c.ruleId !== 'endpoint-added') : [];
    if (added || changes.length) entries.push({ v, changes, added });
  });
  return { entries: entries.reverse(), pending: states.some((s) => s?.status === 'loading') };
}

export function Endpoint({ op, tab }: { op: Op; tab: 'docs' | 'history' }) {
  const v = useViewer();
  const { spec } = v.cur;
  const badge = v.index.ops.get(op.key);
  const history = useOpHistory(op);
  const opChanges = (v.index.opChanges.get(op.key) ?? []).filter((c) => c.severity !== 'docs');
  const replacement = (deref(spec, spec.paths?.[op.path])?.[op.method] ?? {})['x-replacement'] as string | undefined;

  const docs = (
    <div className={css.stack}>
      {opChanges.length && v.prev ? (
        <section className={css.card} aria-labelledby="sd-changed-since">
          <h2 id="sd-changed-since" className={css.h4}>Changed since {v.prev.label}</h2>
          <ul className={css.changeList}>
            {opChanges.slice(0, 8).map((c) => (
              <li key={c.id}>
                {c.severity ? <SeverityBadge severity={c.severity} /> : null}
                <span><InlineText text={c.changelogLine ?? changeTitle(c)} /></span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {PARAM_SECTIONS.map(([where, title]) => {
        const ps = op.params.filter((p) => p.in === where);
        if (!ps.length) return null;
        return (
          <section key={where} aria-labelledby={`sd-p-${where}`}>
            <h2 id={`sd-p-${where}`} className={css.h2}>{title}</h2>
            <ul className={css.fieldList}>
              {ps.map((p) => {
                const key = `param:${op.key}:${p.in}:${p.name}`;
                return <FieldRow key={key} spec={spec} field={{ ...p }} badge={v.index.fields.get(key)} note={becameRequiredNote(v.index.fieldChanges.get(key), v.cur.label)} />;
              })}
            </ul>
          </section>
        );
      })}
      <RequestBody op={op} />
      <Responses op={op} />
    </div>
  );

  return (
    <div className={css.page}>
      <p className={css.opHeader}>
        <Method method={op.method} />
        <span className={cx(css.opHeaderPath, op.deprecated && css.struck)}>{op.path}</span>
        {badge ? <ViewerBadge kind={badge} /> : op.deprecated ? <ViewerBadge kind="deprecated" /> : null}
      </p>
      <h1 className={css.h1}>{op.summary ?? op.operationId ?? op.key}</h1>
      {op.description && !op.deprecated ? <p className={css.lead}>{op.description}</p> : null}
      {op.deprecated ? (
        <div className={css.deprecated} role="note">
          <Clock aria-hidden="true" size={16} />
          <div>
            <strong>Deprecated.{op.sunset ? ` Stops working on ${sunsetText(op.sunset)}.` : ''}</strong>
            {/* The title already says "Deprecated.": don't repeat it when the description opens with it. */}
            {op.description?.replace(/^\s*Deprecated\.?\s*/i, '') ? <p className={css.noMargin}>{op.description.replace(/^\s*Deprecated\.?\s*/i, '')}</p> : null}
            {replacement ? <p className={css.noMargin}>Use <code className={css.code}>{replacement}</code> instead.{op.sunset ? <> The sunset date comes from <code className={css.code}>x-sunset</code>.</> : null}</p> : null}
          </div>
        </div>
      ) : null}
      {v.isPhone ? (
        docs
      ) : (
        <Tabs
          label="Endpoint"
          value={tab}
          onValueChange={(t) => v.go({ page: 'op', slug: op.slug, tab: t === 'history' ? 'history' : 'docs' })}
          items={[
            { value: 'docs', label: 'Docs', content: docs },
            { value: 'history', label: `History ${history.entries.length}`, content: <History history={history} /> },
          ]}
        />
      )}
    </div>
  );
}

function becameRequiredNote(changes: Change[] | undefined, label: string): string | undefined {
  return changes?.some((c) => c.ruleId?.includes('became-required')) ? `was optional before ${label}` : undefined;
}

function RequestBody({ op }: { op: Op }) {
  const v = useViewer();
  const { spec } = v.cur;
  const media = op.requestBody && mediaOf(op.requestBody.content);
  if (!media) return null;
  const fields = fieldsOf(spec, media[1].schema);
  const removed = v.index.removed.get(`body:${op.key}`) ?? [];
  const ref = refName(media[1].schema);
  return (
    <section aria-labelledby="sd-body">
      <h2 id="sd-body" className={css.h2}>Request body</h2>
      <p className={css.mediaType}>{media[0]}{ref ? <> · <a className={css.link} href={v.href({ page: 'schema', slug: v.schemaByName.get(ref)?.slug ?? '' })}>{ref}</a></> : null}{op.requestBody?.required ? '' : ' · optional'}</p>
      <ul className={css.fieldList}>
        {fields.map((f) => {
          const key = `body:${op.key}:${f.name}`;
          const sub = refName(f.schema) ?? refName(deref(spec, f.schema)?.items);
          return <FieldRow key={f.name} spec={spec} field={f} badge={v.index.fields.get(key)} note={becameRequiredNote(v.index.fieldChanges.get(key), v.cur.label)} href={sub && v.schemaByName.has(sub) ? v.href({ page: 'schema', slug: v.schemaByName.get(sub)!.slug }) : undefined} />;
        })}
        {removed.map((r) => (
          <FieldRow key={`rm-${r.name}`} spec={spec} field={{ name: r.name, schema: r.change.before ?? {}, required: false, deprecated: false }} badge="breaking" struck removedNote={`Removed in ${v.cur.label}. ${r.change.explanation?.avoid ?? ''}`} />
        ))}
      </ul>
    </section>
  );
}

function Responses({ op }: { op: Op }) {
  const v = useViewer();
  const { spec } = v.cur;
  if (!op.responses.length) return null;
  return (
    <section aria-labelledby="sd-responses">
      <h2 id="sd-responses" className={css.h2}>Responses</h2>
      <ul className={css.responseList}>
        {op.responses.map((r) => {
          const media = mediaOf(r.content);
          const fields = media ? fieldsOf(spec, media[1].schema) : [];
          const ref = media ? refName(media[1].schema) : undefined;
          const headers = Object.entries(r.headers);
          const expandable = fields.length > 0 || headers.length > 0;
          const head = (
            <>
              <span className={cx(css.status, statusClass(r.status))}>{r.status}</span>
              <span className={css.responseDesc}>{r.description ?? ''}</span>
            </>
          );
          return (
            <li key={r.status}>
              {expandable ? (
                <details className={css.response}>
                  <summary className={css.responseHead}>
                    {head}
                    <ChevronRight aria-hidden="true" size={16} className={css.chev} />
                  </summary>
                  <div className={css.responseBody}>
                    {media ? <p className={css.mediaType}>{media[0]}{ref && v.schemaByName.has(ref) ? <> · <a className={css.link} href={v.href({ page: 'schema', slug: v.schemaByName.get(ref)!.slug })}>{ref}</a></> : null}</p> : null}
                    {headers.length ? (
                      <ul className={css.fieldList}>
                        {headers.map(([name, h]) => (
                          <FieldRow key={`h-${name}`} spec={spec} field={{ name, schema: deref(spec, h)?.schema ?? {}, required: !!deref(spec, h)?.required, description: deref(spec, h)?.description, deprecated: false }} />
                        ))}
                      </ul>
                    ) : null}
                    <ul className={css.fieldList}>
                      {fields.map((f) => {
                        const sub = refName(f.schema) ?? refName(deref(spec, f.schema)?.items);
                        return <FieldRow key={f.name} spec={spec} field={f} href={sub && v.schemaByName.has(sub) ? v.href({ page: 'schema', slug: v.schemaByName.get(sub)!.slug }) : undefined} />;
                      })}
                    </ul>
                  </div>
                </details>
              ) : (
                <div className={css.responseHead}>{head}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function History({ history }: { history: ReturnType<typeof useOpHistory> }) {
  const v = useViewer();
  if (!v.compareAvailable && v.loaded.length > 1) return <p className={css.muted}>{v.compareNote ?? 'History needs the comparison engine.'}</p>;
  return (
    <div>
      <p className={css.muted}>Every change to this endpoint across the versions you loaded, newest first.</p>
      {history.pending ? <p className={css.muted} role="status">Comparing versions…</p> : null}
      <ol className={css.timelineV}>
        {history.entries.map((e) => (
          <li key={e.v.label} className={css.timelineItem}>
            <span className={cx(css.dot, e.v.label === v.cur.label && css.dotOn)} aria-hidden="true" />
            <div>
              <p className={css.timelineHead}><span className={css.versionLabel}>{e.v.label}</span>{e.v.version.date ? <span className={css.muted}> {e.v.version.date}</span> : null}</p>
              <ul className={css.changeList}>
                {e.added ? <li><SeverityBadge severity="safe" /><span>Endpoint added</span></li> : null}
                {e.changes.map((c) => (
                  <li key={c.id}>{c.severity ? <SeverityBadge severity={c.severity} /> : null}<span><InlineText text={c.changelogLine ?? changeTitle(c)} /></span></li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

