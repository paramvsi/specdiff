// Small shared pieces: method chips, code panels, field rows.
import { MethodChip, ViewerBadge, type HttpMethod } from '@specdiff/ui';
import { Copy } from 'lucide-react';
import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import type { BadgeKind } from './change-index';
import { useViewer } from './context';
import { constraints, enumOf, type Field } from './fields';
import { copyText } from './hooks';
import { typeLabel, type Json } from './model';
import css from './Viewer.module.css';

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

const KNOWN = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

export function Method({ method, className }: { method: string; className?: string | undefined }) {
  const m = method.toUpperCase();
  if (KNOWN.has(m)) return <MethodChip method={m as HttpMethod} className={className} />;
  return <span className={cx(css.otherMethod, className)}>{m}</span>;
}

/** Text-only method label for the nav (colour plus the method name). */
export function NavMethod({ method }: { method: string }) {
  const m = method.toLowerCase();
  return <span className={cx(css.navMethod, css[`m_${m}`])}>{m.toUpperCase()}</span>;
}

/** Render `inline code` in plain text without HTML. */
export function InlineText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) => (p.startsWith('`') && p.endsWith('`') && p.length > 2 ? <code key={i} className={css.code}>{p.slice(1, -1)}</code> : p))}
    </>
  );
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const { notify } = useViewer();
  return (
    <button
      type="button"
      className={css.iconBtnDark}
      aria-label={label}
      onClick={() => void copyText(text).then((ok) => notify(ok ? 'Copied' : 'Could not copy', ok ? undefined : 'Your browser blocked the clipboard.'))}
    >
      <Copy aria-hidden="true" size={14} />
    </button>
  );
}

/** Inverse code panel with a title bar and a copy button. */
export function CodePanel({ title, code, label, wrap = false }: { title: string; code: string; label?: string; wrap?: boolean }) {
  return (
    <section className={css.codePanel} aria-label={label ?? title}>
      <div className={css.codePanelHead}>
        <span>{title}</span>
        <CopyButton text={code} label={`Copy ${title.toLowerCase()}`} />
      </div>
      {/* Scrollable region: focusable so keyboard users can scroll it. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <pre className={cx(css.pre, wrap && css.preWrap)} tabIndex={0}>
        {/* Wrapped lines (checklists) hang under their text, after the "- [ ] " marker. */}
        <code>{wrap ? code.split('\n').map((line, i) => <span key={i} className={css.preLine}>{line}</span>) : code}</code>
      </pre>
    </section>
  );
}

/** Dark tab strip (code samples, response viewer). Arrow keys move between tabs. */
export function DarkTabs<V extends string>({ label, tabs, value, onChange, children, extra, trailing }: {
  label: string;
  tabs: ReadonlyArray<{ value: V; label: string }>;
  value: V;
  onChange: (v: V) => void;
  children: ReactNode;
  extra?: ReactNode;
  trailing?: ReactNode;
}) {
  const id = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (i + d + tabs.length) % tabs.length;
    onChange(tabs[n]!.value);
    refs.current[n]?.focus();
  };
  return (
    <>
      <div className={css.darkTabsRow}>
        {extra}
        <div role="tablist" aria-label={label} className={css.darkTabs}>
          {tabs.map((t, i) => (
            <button
              key={t.value}
              ref={(el) => { refs.current[i] = el; }}
              type="button"
              role="tab"
              id={`${id}-${t.value}`}
              aria-selected={t.value === value}
              aria-controls={`${id}-panel`}
              tabIndex={t.value === value ? 0 : -1}
              className={css.darkTab}
              onClick={() => onChange(t.value)}
              onKeyDown={(e) => onKey(e, i)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {trailing ? <span className={css.pushRight}>{trailing}</span> : null}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${value}`}>
        {children}
      </div>
    </>
  );
}

export function FieldRow({ spec, field, badge, note, struck, removedNote, href }: {
  spec: Json;
  field: Pick<Field, 'name' | 'required' | 'description' | 'deprecated'> & { schema: Json };
  badge?: BadgeKind | undefined;
  note?: string | undefined;
  struck?: boolean | undefined;
  removedNote?: string | undefined;
  href?: string | undefined;
}) {
  const cons = constraints(spec, field.schema);
  const enums = enumOf(spec, field.schema);
  const type = typeLabel(spec, field.schema);
  return (
    <li className={css.field}>
      <div className={css.fieldHead}>
        {struck ? <del className={css.fieldName}>{field.name}</del> : <span className={css.fieldName}>{field.name}</span>}
        {href ? <a className={css.fieldType} href={href}>{type}</a> : <span className={css.fieldType}>{type}</span>}
        {struck ? null : field.required ? <span className={css.required}>required</span> : <span className={css.optional}>optional</span>}
        {field.deprecated ? <ViewerBadge kind="deprecated" /> : null}
        {badge ? <ViewerBadge kind={badge} /> : null}
      </div>
      {struck ? (
        <p className={css.removedText}><InlineText text={removedNote ?? ''} /></p>
      ) : (
        <>
          {field.description ? <p className={css.fieldDesc}>{field.description}</p> : null}
          {enums ? (
            <p className={css.fieldMeta}>
              One of{' '}
              {enums.map((e, i) => (
                <span key={e}>{i ? ', ' : ''}<code className={css.code}>{e}</code></span>
              ))}
            </p>
          ) : null}
          {cons.length || note ? (
            <p className={css.fieldMeta}>
              {cons.map((c, i) => (
                <span key={c.label}>
                  {i ? ' · ' : ''}
                  {c.label} {c.code ? <code className={css.code}>{c.value}</code> : c.value}
                </span>
              ))}
              {note ? `${cons.length ? ' · ' : ''}${note}` : null}
            </p>
          ) : null}
        </>
      )}
    </li>
  );
}

export function statusClass(status: string): string | undefined {
  return status.startsWith('2') ? css.status2 : status.startsWith('3') ? css.status3 : status === 'default' ? css.status3 : css.status4;
}
