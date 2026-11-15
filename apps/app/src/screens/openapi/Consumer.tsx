// A-05 SDK impact (OA-20, Beta) and A-05 Changes that affect me (OA-22).
import { parseDocument, type Change } from '@specdiff/core';
import { parseOperationList } from '@specdiff/core/har';
import { BetaLabel, Button, Dialog, MethodChip, SegmentedControl, SeverityBadge } from '@specdiff/ui';
import * as icons from 'lucide-react';
import { useMemo, useState } from 'react';
import { create } from 'zustand';
import { focusChange } from '../../shell/nav';
import { useApp } from '../../state/store';
import { affectsRows, fromHar, operationsOf, sdkCall, type AffectsMe, type Lang } from './consumer-logic';
import { Title } from './Title';
import css from './Consumer.module.css';

export const useConsumer = create<{ view: 'endpoints' | 'sdk'; lang: Lang; filter: AffectsMe | null; editing: boolean; set: (p: Partial<{ view: 'endpoints' | 'sdk'; lang: Lang; filter: AffectsMe | null; editing: boolean }>) => void }>((set) => ({ view: 'endpoints', lang: 'ts', filter: null, editing: false, set: (p) => set(p) }));

export function ConsumerControls() {
  const { view, set } = useConsumer();
  return (
    <div className={css.controls}>
      <Button variant="secondary" icon={<icons.Filter size={15} />} onClick={() => set({ editing: true })}>Affects me</Button>
      <SegmentedControl label="Show changes as" size="sm" value={view} onValueChange={(v) => set({ view: v })} options={[{ value: 'endpoints', label: 'Endpoints' }, { value: 'sdk', label: 'SDK calls' }]} />
      <BetaLabel />
    </div>
  );
}

export function SdkView({ changes }: { changes: Change[] }) {
  const { lang, set } = useConsumer();
  const config = useApp((s) => s.settings.config);
  // Breaking first, then possibly, then safe (A05-SdkImpact).
  const order = ['breaking', 'possibly', 'safe'];
  const rows = changes.filter((c) => c.severity !== 'docs').sort((a, b) => order.indexOf(a.severity ?? 'safe') - order.indexOf(b.severity ?? 'safe'));
  return (
    <section className={css.card} aria-labelledby="sdk-h">
      <header className={css.head}>
        <div><h2 id="sdk-h" className={css.h2}>As your SDK users see it</h2><p className={css.muted}>Names follow operationId, tags and schema names in the spec.</p></div>
        <SegmentedControl label="Language" value={lang} onValueChange={(l) => set({ lang: l })} options={[{ value: 'ts', label: 'TypeScript' }, { value: 'python', label: 'Python' }, { value: 'java', label: 'Java' }, { value: 'go', label: 'Go' }]} />
      </header>
      <ul className={css.rows}>
        {rows.map((c) => (
          <li key={c.id}>
            <button type="button" className={css.row} onClick={() => focusChange(c.id)}>
              <SeverityBadge severity={c.severity ?? 'docs'} />
              <code className={css.call}>{sdkCall(c, lang)}</code>
              <span className={css.what}>{c.operation ? `${c.operation.method} ${c.operation.path}` : c.sourceBlock} · <Title c={c} short /></span>
            </button>
          </li>
        ))}
      </ul>
      {(config.preset ?? 'wire') === 'wire' && <p className={css.foot}><icons.TriangleAlert size={14} aria-hidden="true" /> Renamed operationIds, schemas and enums only count as breaking under the SDK preset. Switch it on the Summary.</p>}
    </section>
  );
}

export function AffectsMeView({ changes }: { changes: Change[] }) {
  const { filter, set } = useConsumer();
  if (!filter) return null;
  const rows = affectsRows(changes, filter.keys, filter.calls);
  const hasCalls = Object.keys(filter.calls).length > 0;
  return (
    <>
      <div className={css.banner} role="status">
        <icons.Filter size={16} aria-hidden="true" />
        <strong>Only changes to the {filter.keys.length} endpoint{filter.keys.length === 1 ? '' : 's'} in {filter.source}</strong>
        <span className={css.muted}>{rows.length} of {changes.length} shown</span>
        <span className={css.spacer} />
        <Button variant="secondary" onClick={() => set({ editing: true })}>Edit</Button>
        <Button variant="secondary" icon={<icons.X size={15} />} onClick={() => set({ filter: null })}>Clear filter</Button>
      </div>
      <section className={css.card} aria-label="Changes that affect you">
        <table className={css.table}>
          <thead><tr><th scope="col"><span className="sd-visually-hidden">Severity</span></th><th scope="col">Method</th><th scope="col">Path</th><th scope="col">Change</th><th scope="col" className={css.num}>Your calls</th></tr></thead>
          <tbody>
            {rows.map(({ change: c, endpoint, calls }) => {
              const [m, p] = [endpoint.slice(0, endpoint.indexOf(' ')), endpoint.slice(endpoint.indexOf(' ') + 1)];
              return (
                <tr key={c.id}>
                  <td><SeverityBadge severity={c.severity ?? 'docs'} compact /></td>
                  <td>{['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(m) ? <MethodChip method={m as 'GET'} /> : <span className={css.muted}>{m}</span>}</td>
                  <td><code>{p}</code></td>
                  <td><button type="button" className={css.link} onClick={() => focusChange(c.id)}><Title c={c} short /></button></td>
                  <td className={css.num}>{calls?.toLocaleString('en') ?? (hasCalls ? '0' : '—')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filter.failing.map((f) => <p key={f.change.id} className={css.foot}>Your {filter.source.endsWith('.har') ? 'HAR' : 'list'} also has <strong>{f.reason}</strong>. They will be rejected after the upgrade.</p>)}
      </section>
    </>
  );
}

export function AffectsMeDialog() {
  const { editing, set } = useConsumer();
  const { result, before } = useApp();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const changes = result && 'report' in result ? result.report.changes : [];
  const spec = useMemo(() => (before ? parseDocument(before.content, before.name).value : undefined), [before]);
  if (!editing) return null;
  const close = () => set({ editing: false });
  const apply = () => {
    const keys = parseOperationList(text, operationsOf(spec).ops);
    if (!keys.length) { setError('None of those match an operation in the spec. Use operationIds or lines like GET /v1/payments.'); return; }
    set({ filter: { source: 'your list', keys, calls: {}, failing: [] }, editing: false });
  };
  const har = async (f: File) => {
    try { set({ filter: fromHar(f.name, JSON.parse(await f.text()), spec, changes), editing: false }); }
    catch (e) { setError(e instanceof SyntaxError ? 'That file is not valid JSON.' : (e as Error).message); }
  };
  return (
    <Dialog open title="Changes that affect me" description="Paste the operations you call, or drop a HAR file recorded from your app. It stays in this browser." onOpenChange={(o) => { if (!o) close(); }}
      actions={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="brand" disabled={!text.trim()} onClick={apply}>Filter</Button></>}>
      <label className={css.field}>
        <span>operationIds or METHOD /path, one per line</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={'createPayment\nGET /v1/payments/{id}'} />
      </label>
      <label className={css.har}>
        <icons.FileUp size={16} aria-hidden="true" /> Or choose a HAR file
        <input type="file" accept=".har,application/json" onChange={(e) => { const f = e.target.files?.[0]; if (f) void har(f); }} />
      </label>
      {error && <p role="alert" className={css.error}>{error}</p>}
    </Dialog>
  );
}
