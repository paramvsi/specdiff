// V-03 Schema (VW-03, VW-08): fields, types, constraints, removed fields struck through, "used in".
import { ViewerBadge } from '@specdiff/ui';
import { useViewer } from './context';
import { fieldsOf } from './fields';
import { deref, refName, type SchemaEntry } from './model';
import { CodePanel, FieldRow, Method } from './parts';
import { exampleFor } from './samples';
import css from './Viewer.module.css';

export function SchemaPage({ entry }: { entry: SchemaEntry }) {
  const v = useViewer();
  const { spec } = v.cur;
  const s = deref(spec, entry.schema) ?? {};
  const fields = fieldsOf(spec, entry.schema);
  const removed = v.index.removed.get(`schema:${entry.name}`) ?? [];
  const badge = v.prev && !v.prev.model.schemas.some((x) => x.name === entry.name) ? 'new' : v.index.schemas.get(entry.name);
  const enums: unknown[] | undefined = Array.isArray(s.enum) ? s.enum : undefined;
  return (
    <div className={css.page}>
      <p className={css.eyebrow}>
        <span className={css.schemaPill}>Schema</span>
        {badge ? <ViewerBadge kind={badge} /> : null}
      </p>
      <h1 className={`${css.h1} ${css.mono}`}>{entry.name}</h1>
      {s.description ? <p className={css.lead}>{s.description}</p> : null}
      {enums ? (
        <p className={css.fieldMeta}>
          One of{' '}
          {enums.map((e, i) => <span key={String(e)}>{i ? ', ' : ''}<code className={css.code}>{typeof e === 'string' ? e : JSON.stringify(e)}</code></span>)}
        </p>
      ) : null}
      {fields.length || removed.length ? (
        <ul className={css.fieldList}>
          {fields.map((f) => {
            const sub = refName(f.schema) ?? refName(deref(spec, f.schema)?.items);
            return (
              <FieldRow
                key={f.name}
                spec={spec}
                field={f}
                badge={v.index.fields.get(`schema:${entry.name}.${f.name}`)}
                href={sub && v.schemaByName.has(sub) ? v.href({ page: 'schema', slug: v.schemaByName.get(sub)!.slug }) : undefined}
              />
            );
          })}
          {removed.map((r) => (
            <FieldRow
              key={`rm-${r.name}`}
              spec={spec}
              field={{ name: r.name, schema: r.change.before ?? {}, required: false, deprecated: false }}
              badge="breaking"
              struck
              removedNote={`Removed in ${v.cur.label}.${r.change.explanation?.avoid ? ` ${r.change.explanation.avoid}` : ''}`}
            />
          ))}
        </ul>
      ) : null}
      <section aria-labelledby="sd-used-in">
        <h2 id="sd-used-in" className={css.h2}>Used in</h2>
        {entry.usedIn.length ? (
          <ul className={css.usedList}>
            {entry.usedIn.map((k) => {
              const op = v.cur.model.ops.find((o) => o.key === k);
              if (!op) return null;
              return (
                <li key={k} className={css.usedRow}>
                  <Method method={op.method} />
                  <a className={css.usedLink} href={v.href({ page: 'op', slug: op.slug, tab: 'docs' })}>{op.path}</a>
                  {op.summary ? <span className={css.muted}>{op.summary}</span> : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={css.muted}>No endpoint uses this schema directly.</p>
        )}
      </section>
    </div>
  );
}

export function SchemaAside({ entry }: { entry: SchemaEntry }) {
  const { cur } = useViewer();
  const ex = exampleFor(cur.spec, entry.schema);
  if (ex === null || ex === undefined) return null;
  return (
    <div className={css.aside}>
      <CodePanel title="Example" code={JSON.stringify(ex, null, 2)} />
    </div>
  );
}
