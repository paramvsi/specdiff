// V-05 Search (VW-04) and V-04 Pick my endpoints (VW-10, OA-22).
import { matchHar, parseOperationList, type HarResult } from '@specdiff/core/har';
import { Button, Dialog, DialogClose, Kbd } from '@specdiff/ui';
import { ArrowUpToLine, Search as SearchIcon } from 'lucide-react';
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useViewer } from './context';
import type { Route } from './hooks';
import { search, type Op, type SearchHit } from './model';
import { Method, cx } from './parts';
import css from './Viewer.module.css';

function Highlight({ text, q }: { text: string; q: string }) {
  const needle = q.trim().toLowerCase();
  if (!needle) return <>{text}</>;
  const out: Array<string | { m: string }> = [];
  let i = 0;
  const lower = text.toLowerCase();
  for (let j = lower.indexOf(needle); j >= 0; j = lower.indexOf(needle, i)) {
    if (j > i) out.push(text.slice(i, j));
    out.push({ m: text.slice(j, j + needle.length) });
    i = j + needle.length;
  }
  if (i < text.length) out.push(text.slice(i));
  return <>{out.map((p, k) => (typeof p === 'string' ? p : <mark key={k} className={css.mark}>{p.m}</mark>))}</>;
}

export function targetRoute(target: string): Route {
  const [kind, slug = ''] = target.split('/');
  return kind === 'schema' ? { page: 'schema', slug } : { page: 'op', slug, tab: 'docs' };
}

export function SearchDialog({ open, initial, onClose }: { open: boolean; initial: string; onClose: () => void }) {
  const v = useViewer();
  const [q, setQ] = useState(initial);
  const [active, setActive] = useState(0);
  const id = useId();
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) { setWasOpen(open); if (open) { setQ(initial); setActive(0); } }
  const hits = useMemo(() => search(v.cur.model, v.cur.spec, q, 50), [v.cur, q]);
  const pick = (h: SearchHit) => { onClose(); v.go(targetRoute(h.target)); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && hits[active]) { e.preventDefault(); pick(hits[active]); }
  };
  const opOf = (h: SearchHit): Op | undefined => (h.target.startsWith('op/') ? v.opBySlug.get(h.target.slice(3)) : undefined);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }} title="Search" className={css.searchDialog}>
      <div className={css.searchBox}>
        <SearchIcon aria-hidden="true" size={18} />
        <input
          className={css.searchInput}
          role="combobox"
          aria-expanded={hits.length > 0}
          aria-controls={`${id}-list`}
          aria-activedescendant={hits[active] ? `${id}-${active}` : undefined}
          aria-label="Search endpoints, fields and descriptions"
          placeholder="Search endpoints, fields and descriptions"
          value={q}
          onChange={(e) => { setQ(e.target.value); setActive(0); }}
          onKeyDown={onKey}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
        />
        <Kbd>esc</Kbd>
      </div>
      <p className={css.searchCount} role="status">{q.trim() ? `${hits.length} ${hits.length === 1 ? 'result' : 'results'} in endpoints, fields and descriptions` : 'Type to search'}</p>
      <ul id={`${id}-list`} role="listbox" aria-label="Results" className={css.results}>
        {hits.map((h, i) => {
          const op = opOf(h);
          return (
            // Keyboard selection happens on the combobox (aria-activedescendant); click is a pointer shortcut.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <li key={`${h.kind}:${h.label}:${h.target}:${i}`} id={`${id}-${i}`} role="option" aria-selected={i === active} className={cx(css.result, i === active && css.resultActive)} onClick={() => pick(h)} onMouseMove={() => setActive(i)}>
              {op ? <Method method={op.method} /> : <span className={css.schemaPill}>Schema</span>}
              <span className={css.resultText}>
                <span className={css.resultMain}>
                  <strong>{op ? op.summary ?? op.operationId ?? op.key : h.kind === 'schema' ? 'Schema' : h.label.split('.')[0]}</strong>{' '}
                  <span className={css.mono}>{op ? op.path : h.kind === 'schema' ? <Highlight text={h.label} q={q} /> : h.label.split('.')[0]}</span>
                </span>
                <span className={css.small}>
                  {h.kind === 'operation' ? <Highlight text={h.detail || 'Endpoint'} q={q} /> : h.kind === 'schema' ? h.detail : (
                    <>{h.kind === 'field' ? 'Field' : h.kind === 'parameter' ? 'Parameter' : 'Response'} · <Highlight text={h.kind === 'field' ? h.label.split('.').slice(1).join('.') : h.label} q={q} /></>
                  )}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className={css.searchFoot}><Kbd>↑</Kbd> <Kbd>↓</Kbd> move <Kbd>↵</Kbd> open <span className={css.searchScope}>Searches {/^\d/.test(v.cur.label) ? `v${v.cur.label}` : v.cur.label}</span></p>
    </Dialog>
  );
}

export const endpointsKey = (title: string) => `specdiff:viewer:endpoints:${title}`;

export function MyEndpointsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const v = useViewer();
  const ops = useMemo(() => {
    const m = new Map<string, Op>();
    for (const o of [...v.cur.model.ops, ...(v.prev?.model.ops ?? [])]) if (!m.has(o.key)) m.set(o.key, o);
    return [...m.values()];
  }, [v.cur, v.prev]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [har, setHar] = useState<{ name: string; result: HarResult } | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [paste, setPaste] = useState<string | undefined>();
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const [wasOpen, setWasOpen] = useState(false);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) { setChecked(new Set(v.myEndpoints ?? [])); setHar(undefined); setError(undefined); setPaste(undefined); }
  }
  const calls = new Map(har?.result.matches.map((m) => [m.operationKey, m.calls]) ?? []);
  const servers = [...new Set([...v.cur.model.servers, ...(v.prev?.model.servers ?? [])].map((s) => s.url))];

  const readHar = async (file: File) => {
    setError(undefined);
    try {
      const json = JSON.parse(await file.text()) as unknown;
      const result = matchHar(json, ops.map((o) => ({ method: o.method, path: o.path, ...(o.operationId ? { operationId: o.operationId } : {}) })), servers);
      setHar({ name: file.name, result });
      setChecked(new Set(result.matches.map((m) => m.operationKey)));
    } catch (e) {
      setError(e instanceof SyntaxError ? 'This file is not JSON, so it is not a HAR file.' : e instanceof Error ? e.message : String(e));
    }
  };
  const matchedRequests = har?.result.matches.reduce((n, m) => n + m.calls, 0) ?? 0;
  const fmt = (n: number) => n.toLocaleString('en-US');

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Which endpoints does your app use?"
      description="Only changes to these will show. Nothing leaves this browser."
      className={css.endpointsDialog}
      actions={
        <>
          <span className={css.selectedCount} role="status">{checked.size} of {ops.length} selected</span>
          <DialogClose asChild><Button>Cancel</Button></DialogClose>
          <Button variant="brand" disabled={!checked.size} onClick={() => { v.setMyEndpoints(new Set(checked)); onOpenChange(false); }}>Show my changes</Button>
        </>
      }
    >
      <div
        className={cx(css.dropZone, drag && css.dropZoneOn)}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void readHar(f); }}
      >
        <span className={css.dropIcon} aria-hidden="true"><ArrowUpToLine size={16} /></span>
        <div className={css.dropText}>
          {har ? (
            <>
              <strong className={css.mono}>{har.name}</strong>
              <span className={css.small}>{fmt(matchedRequests)} {matchedRequests === 1 ? 'request' : 'requests'} matched {har.result.matches.length} {har.result.matches.length === 1 ? 'endpoint' : 'endpoints'}. {fmt(har.result.ignoredOrigin)} to other hosts ignored.</span>
            </>
          ) : (
            <>
              <strong>Drop a HAR file</strong>
              <span className={css.small}>Export one from your browser’s network panel. It is read here and not stored.</span>
            </>
          )}
        </div>
        <Button onClick={() => fileRef.current?.click()}>{har ? 'Replace' : 'Choose file'}</Button>
        <input ref={fileRef} type="file" accept=".har,application/json" className={css.hiddenInput} aria-label="Choose a HAR file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void readHar(f); e.target.value = ''; }} />
      </div>
      {error ? <p className={css.errorSmall} role="alert"><span aria-hidden="true">! </span>{error}</p> : null}
      <div className={css.cardHead}>
        <span className={css.formLabel} id={`${id}-eps`}>Endpoints</span>
        <button type="button" className={css.linkButton} onClick={() => setPaste(paste === undefined ? '' : undefined)}>{paste === undefined ? 'Paste operationIds instead' : 'Pick from the list'}</button>
      </div>
      {paste !== undefined ? (
        <div className={css.formField}>
          <label htmlFor={`${id}-paste`} className={css.formLabel}>operationIds or “METHOD /path”, one per line</label>
          <textarea id={`${id}-paste`} className={css.textarea} rows={5} value={paste} onChange={(e) => setPaste(e.target.value)} />
          <div className={css.row}><Button onClick={() => { setChecked(new Set(parseOperationList(paste, ops))); setPaste(undefined); }}>Use these</Button></div>
        </div>
      ) : (
        <ul className={css.epList} aria-labelledby={`${id}-eps`}>
          {ops.map((o) => {
            const on = checked.has(o.key);
            const n = calls.get(o.key);
            return (
              <li key={o.key} className={css.epRow}>
                <label className={css.epLabel}>
                  <input type="checkbox" className={css.nativeCheck} checked={on} onChange={() => setChecked((s) => { const x = new Set(s); if (on) x.delete(o.key); else x.add(o.key); return x; })} />
                  <Method method={o.method} />
                  <span className={css.mono}>{o.path}</span>
                </label>
                <span className={css.calls}>{har ? (n ? `${fmt(n)} ${n === 1 ? 'call' : 'calls'}` : 'No calls') : ''}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
