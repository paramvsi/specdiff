// A-11 History and empty state (OUT-07): kept only in this browser (IndexedDB).
import type { Mode } from '@specdiff/core';
import { Button, Dialog, EmptyHistoryState, ModeBadge, TextField } from '@specdiff/ui';
import * as icons from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { formatBytes } from '../lib/input';
import { openSample } from '../shell/boot';
import { clearHistory, deleteEntry, listHistory, loadPayload, updateEntry, type StoredHistoryEntry as HistoryEntry } from '../state/persist';
import { useApp } from '../state/store';
import css from './History.module.css';

type Filter = 'all' | 'pinned' | 'openapi' | 'structured' | 'markdown' | 'code' | 'text';
const MODE_LABEL: Record<Mode, string> = {
  openapi: 'OpenAPI',
  json: 'JSON',
  yaml: 'YAML',
  markdown: 'Markdown',
  code: 'Code',
  text: 'Text',
};
const inFilter = (e: HistoryEntry, f: Filter) =>
  f === 'all' ||
  (f === 'pinned' && e.pinned) ||
  (f === 'structured' && (e.mode === 'json' || e.mode === 'yaml')) ||
  e.mode === f;

export function opened(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 864e5);
  if (diff === 0)
    return `Today, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

const files = (e: HistoryEntry) => `${e.before.name} → ${e.after.name}`;

/** Mode chip colours (A-11): OpenAPI chartreuse, JSON/YAML blue, Markdown purple, Text and Code grey. Tokens only. */
const MODE_TONE: Partial<Record<Mode, { background: string; color: string }>> = {
  json: { background: 'var(--sd-added-bg)', color: 'var(--sd-added-strong)' },
  yaml: { background: 'var(--sd-added-bg)', color: 'var(--sd-added-strong)' },
  markdown: { background: 'var(--sd-changed-bg)', color: 'var(--sd-changed)' },
  text: { background: 'var(--sd-docs-bg)', color: 'var(--sd-ink)' },
  code: { background: 'var(--sd-docs-bg)', color: 'var(--sd-ink)' },
};

const modeVars = (m: Mode) => {
  const t = MODE_TONE[m];
  return (t ? { '--sd-brand-tint': t.background, '--sd-brand-ink': t.color } : {}) as CSSProperties;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The Result column, per mode: "4 breaking · 28 changes", "17 changes", "6 blocks changed", "9 lines differ". */
export function resultLabel(e: HistoryEntry): string {
  const s = e.summary;
  if (e.mode === 'openapi') return `${s.breaking} breaking · ${plural(s.total, 'change', 'changes')}`;
  // Rows saved before per-mode counts only stored a line count.
  const c = e.count ?? { unit: 'lines' as const, n: s.total };
  if (c.unit === 'changes') return plural(c.n, 'change', 'changes');
  if (c.unit === 'blocks') return `${plural(c.n, 'block', 'blocks')} changed`;
  return `${c.n} line${c.n === 1 ? '' : 's'} differ${c.n === 1 ? 's' : ''}`;
}

function resultText(e: HistoryEntry) {
  const s = e.summary;
  if (e.mode === 'openapi')
    return (
      <>
        <span className={css.dot} data-sev={s.breaking ? 'breaking' : 'safe'} aria-hidden="true" />
        {s.breaking} breaking <span className={css.sep}>· {plural(s.total, 'change', 'changes')}</span>
      </>
    );
  return resultLabel(e);
}

export default function History() {
  const { setScreen, setSource, setMode, compare } = useApp();
  const [rows, setRows] = useState<HistoryEntry[] | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [confirm, setConfirm] = useState(false);

  const refresh = useCallback(
    () =>
      void listHistory()
        .then(setRows)
        .catch(() => setRows([])),
    [],
  );
  useEffect(refresh, [refresh]);

  const all = useMemo(() => rows ?? [], [rows]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter(
      (e) => inFilter(e, filter) && (!needle || files(e).toLowerCase().includes(needle)),
    );
  }, [all, q, filter]);

  if (!rows) return null;
  if (!all.length)
    return (
      <div className={css.page}>
        <h1 className={css.h1}>History</h1>
        <EmptyHistoryState
          className={css.empty}
          onNewComparison={() => setScreen('compare')}
          onTrySample={() => void openSample('openapi')}
        />
      </div>
    );

  const counts = (f: Filter) => all.filter((e) => inFilter(e, f)).length;
  const chips: Array<{ value: Filter; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'pinned', label: 'Pinned' },
    { value: 'openapi', label: 'OpenAPI' },
    { value: 'structured', label: 'JSON / YAML' },
    { value: 'markdown', label: 'Markdown' },
    { value: 'code', label: 'Code' },
    { value: 'text', label: 'Text' },
  ];
  const bytes = all.reduce((n, e) => n + e.before.size + e.after.size, 0);

  const open = async (e: HistoryEntry) => {
    const p = await loadPayload(e.payloadRef);
    if (!p) return;
    await updateEntry(e.id, { openedAt: new Date().toISOString() });
    setSource('before', p.before);
    setSource('after', p.after);
    setMode(p.mode as Mode);
    await compare();
  };
  const pin = async (e: HistoryEntry) => {
    await updateEntry(e.id, { pinned: !e.pinned });
    refresh();
  };
  const remove = async (e: HistoryEntry) => {
    await deleteEntry(e.id);
    refresh();
  };

  const groups = [
    { label: 'Pinned', items: shown.filter((e) => e.pinned) },
    { label: 'Earlier', items: shown.filter((e) => !e.pinned) },
  ].filter((g) => g.items.length);

  return (
    <div className={css.page}>
      <header className={css.head}>
        <div>
          <h1 className={css.h1}>History</h1>
          <p className={css.lead}>
            <icons.Shield size={14} aria-hidden="true" /> Kept only in this browser.{' '}
            {all.length} comparison{all.length === 1 ? '' : 's'}, {formatBytes(bytes)}.
          </p>
        </div>
        <Button variant="secondary" icon={<icons.Trash2 size={15} />} style={{ color: 'var(--sd-breaking)' }} onClick={() => setConfirm(true)}>
          Clear history
        </Button>
      </header>

      <div className={css.tools}>
        <TextField
          label="Search file names"
          hideLabel
          placeholder="Search file names"
          type="search"
          icon={<icons.Search size={15} />}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className={css.search}
        />
        <div className={css.chips} role="group" aria-label="Filter by mode">
          {chips
            .filter((c) => c.value === 'all' || c.value === 'pinned' || counts(c.value) > 0)
            .map((c) => (
              <button
                key={c.value}
                type="button"
                className={css.chip}
                aria-pressed={filter === c.value}
                onClick={() => setFilter(c.value)}
              >
                {c.label} <span className={css.chipCount}>{counts(c.value)}</span>
              </button>
            ))}
        </div>
      </div>

      {shown.length ? (
        <div className={css.tableWrap}>
          <table className={css.table}>
            <thead>
              <tr>
                <th scope="col">Mode</th>
                <th scope="col">Files</th>
                <th scope="col">Result</th>
                <th scope="col">Opened</th>
                <th scope="col">
                  <span className="sd-visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.label}>
                <tr className={css.group}>
                  <th scope="rowgroup" colSpan={5}>
                    {g.label}
                  </th>
                </tr>
                {g.items.map((e) => (
                  <tr key={e.id}>
                    <td>
                      {/* The badge reads --sd-brand-tint / --sd-brand-ink; each mode re-points them at its own tokens. */}
                      <span style={{ display: 'contents', ...modeVars(e.mode) }}>
                        <ModeBadge mode={MODE_LABEL[e.mode]} />
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={css.files}
                        onClick={() => void open(e)}
                        aria-label={`Open ${files(e)}`}
                      >
                        {e.before.name}
                        <icons.ArrowRight size={13} aria-hidden="true" />
                        {e.after.name}
                      </button>
                    </td>
                    <td className={css.result}>{resultText(e)}</td>
                    <td className={css.when}>{opened(e.openedAt)}</td>
                    <td className={css.actions}>
                      <Button
                        variant="secondary"
                        iconOnly
                        icon={e.pinned ? <icons.PinOff size={15} /> : <icons.Pin size={15} />}
                        aria-label={`${e.pinned ? 'Unpin' : 'Pin'} ${files(e)}`}
                        aria-pressed={e.pinned}
                        onClick={() => void pin(e)}
                      />
                      <Button
                        variant="secondary"
                        iconOnly
                        icon={<icons.Trash2 size={15} />}
                        aria-label={`Delete ${files(e)}`}
                        onClick={() => void remove(e)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      ) : (
        <p className={css.none}>No comparisons match these filters.</p>
      )}

      {confirm && (
        <Dialog
          open
          title="Clear history?"
          description={`This deletes all ${all.length} comparisons from this browser. It can’t be undone.`}
          onOpenChange={(o) => {
            if (!o) setConfirm(false);
          }}
          actions={
            <>
              <Button variant="ghost" onClick={() => setConfirm(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={async () => {
                  await clearHistory();
                  setConfirm(false);
                  refresh();
                }}
              >
                Clear history
              </Button>
            </>
          }
        />
      )}
    </div>
  );
}
