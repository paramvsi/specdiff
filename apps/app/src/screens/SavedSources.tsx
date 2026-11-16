// A-13 Saved sources (IN-11). Re-fetched when the app opens (lib/saved.ts) and when this screen opens, compared
// with the snapshot saved in this browser. No background work, no server: the browser fetches each URL directly.
import type { SavedSource } from '@specdiff/core';
import { detectMode } from '@specdiff/core/detect';
import { Button, Dialog, EmptyState, ModeBadge, TextField } from '@specdiff/ui';
import * as icons from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadUrl } from '../lib/input';
import { checkedLabel, checkSource as check, explainFetch as explain, lastTwo, openedChecks, type SavedRow } from '../lib/saved';
import { deleteSaved, getSnapshot, listSaved, pushSnapshot, putSaved, sha256 } from '../state/persist';
import { useCommand } from '../shell/commands';
import { useApp } from '../state/store';
import css from './SavedSources.module.css';

type Row = SavedRow;

const MODE: Record<SavedSource['mode'], string> = {
  openapi: 'OpenAPI',
  json: 'JSON',
  yaml: 'YAML',
  markdown: 'Markdown',
  code: 'Code',
  text: 'Text',
};

export default function SavedSources() {
  const { setSource, setMode, compare, setScreen } = useApp();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [adding, setAdding] = useState(false);
  // A-13: Add source lives in the top bar.
  useCommand('add-source', useCallback(() => setAdding(true), []));
  const started = useRef(false);

  const checkOne = useCallback(async (s: SavedSource) => {
    setRows((r) => r?.map((x) => (x.source.id === s.id ? { ...x, status: 'checking' } : x)) ?? r);
    const row = await check(s);
    openedChecks.delete(s.id);
    setRows((r) => r?.map((x) => (x.source.id === s.id ? row : x)) ?? [row]);
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void listSaved().then((list) => {
      // Sources the app already checked when it opened keep that result (a refetch would find no change).
      setRows(list.map((source) => openedChecks.get(source.id) ?? { source, status: 'checking' as const }));
      list.forEach((s) => {
        if (!openedChecks.has(s.id)) void checkOne(s);
      });
    });
  }, [checkOne]);

  const compareWithLast = async (s: SavedSource) => {
    const two = await lastTwo(s);
    if (!two) return;
    const { prev, cur } = two;
    const src = (name: string, content: string) => ({
      name,
      content,
      size: new Blob([content]).size,
    });
    setSource('before', src(`${s.name} (last visit)`, prev.content));
    setSource('after', src(s.name, cur.content));
    setMode(s.mode);
    await compare();
  };
  const open = async (s: SavedSource) => {
    const cur = await getSnapshot(s.id, 'current');
    if (!cur) return;
    setSource('before', { name: s.name, content: cur.content, size: new Blob([cur.content]).size });
    setScreen('compare');
  };
  const remove = async (s: SavedSource) => {
    await deleteSaved(s.id);
    setRows((r) => r?.filter((x) => x.source.id !== s.id) ?? r);
  };

  // A-13 "Changed · 2 breaking": OpenAPI sources that changed are compared (last visit → now) for the count.
  const [breaking, setBreaking] = useState<Record<string, number>>({});
  useEffect(() => {
    for (const r of rows ?? []) {
      const s = r.source;
      if (r.status !== 'changed' || s.mode !== 'openapi' || s.id in breaking) continue;
      void (async () => {
        const two = await lastTwo(s);
        if (!two) return;
        try {
          const { compareOpenApi } = await import('@specdiff/core');
          const file = new URL(s.url).pathname.split('/').pop() || 'openapi.yaml';
          const report = compareOpenApi({ name: file, content: two.prev.content }, { name: file, content: two.cur.content });
          setBreaking((b) => ({ ...b, [s.id]: report.summary.breaking }));
        } catch {
          setBreaking((b) => ({ ...b, [s.id]: -1 }));
        }
      })();
    }
  }, [rows, breaking]);

  if (!rows) return null;
  const changed = rows.filter((r) => r.status === 'changed');

  return (
    <div className={css.page}>
      <header className={css.head}>
        <div>
          <h1 className={css.h1}>Saved sources</h1>
          <p className={css.lead}>
            Specdiff re-fetches these URLs when you open the app and compares them with the copy
            saved in this browser. Nothing runs in the background or on a server.
          </p>
        </div>
      </header>

      {changed.length > 0 && (
        <div className={css.banner} role="status">
          <icons.RefreshCw size={16} aria-hidden="true" className={css.bannerIcon} />
          <span className={css.bannerText}>
            {changed.length} of your saved sources changed since your last visit
          </span>
          <Button variant="brand" onClick={() => void compareWithLast(changed[0]!.source)}>
            Review it
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          className={css.empty}
          icon={<icons.Bookmark size={20} />}
          title="No saved sources yet"
          actions={
            <Button variant="brand" icon={<icons.Plus size={15} />} onClick={() => setAdding(true)}>
              Add source
            </Button>
          }
        >
          Save a spec URL and Specdiff checks it for changes each time you open the app.
        </EmptyState>
      ) : (
        <ul className={css.list}>
          {rows.map(({ source: s, status, message }) => (
            <li key={s.id} className={css.row}>
              <div className={css.name}>
                <span className={css.title}>
                  {s.name} <ModeBadge mode={MODE[s.mode]} />
                </span>
                <span className={css.url}>{s.url}</span>
              </div>
              <div className={css.status} data-status={status}>
                {status === 'checking' && 'Checking…'}
                {status === 'changed' && (
                  <>
                    <span aria-hidden="true" className={css.dot} /> Changed
                    {(breaking[s.id] ?? -1) >= 0 && ` · ${breaking[s.id]} breaking`}
                  </>
                )}
                {status === 'same' && 'No changes'}
                {status === 'new' && 'Saved. Changes show from your next visit.'}
                {status === 'error' && (
                  <span className={css.error}>
                    <span className={css.errorTitle}>
                      <icons.TriangleAlert size={14} aria-hidden="true" />
                      {s.lastError === 'cors' ? 'Couldn’t fetch (CORS)' : 'Couldn’t fetch'}
                    </span>
                    <span className={css.errorText}>{message}</span>
                  </span>
                )}
              </div>
              <div className={css.when}>{checkedLabel(s.lastFetchedAt)}</div>
              <div className={css.actions}>
                {status === 'changed' ? (
                  <Button variant="brand" onClick={() => void compareWithLast(s)}>
                    See what changed
                  </Button>
                ) : status === 'error' ? (
                  <Button
                    variant="secondary"
                    icon={<icons.RefreshCw size={15} />}
                    onClick={() => void checkOne(s)}
                  >
                    Retry
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    disabled={status === 'checking'}
                    onClick={() => void open(s)}
                  >
                    Open
                  </Button>
                )}
                <Button
                  variant="secondary"
                  iconOnly
                  icon={<icons.Trash2 size={15} />}
                  aria-label={`Remove ${s.name}`}
                  onClick={() => void remove(s)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <AddDialog
          onClose={() => setAdding(false)}
          onAdded={(row) => {
            setRows((r) => [...(r ?? []), row]);
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

function AddDialog({ onClose, onAdded }: { onClose: () => void; onAdded: (r: Row) => void }) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    if (!url.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const src = await loadUrl(url);
      const hash = await sha256(src.content);
      const now = new Date().toISOString();
      const s: SavedSource = {
        id: crypto.randomUUID(),
        name: name.trim() || src.name,
        url: url.trim(),
        mode: detectMode(src.name, src.content).mode,
        lastFetchedAt: now,
        lastSnapshotHash: hash,
      };
      await pushSnapshot(s.id, { content: src.content, hash, fetchedAt: now });
      await putSaved(s);
      onAdded({ source: s, status: 'new' });
    } catch (e) {
      setErr(explain(e).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      title="Add a saved source"
      description="Specdiff fetches it now and again each time you open the app."
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brand" disabled={!url.trim() || busy} onClick={() => void submit()}>
            {busy ? 'Fetching…' : 'Add source'}
          </Button>
        </>
      }
    >
      <form
        className={css.form}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <TextField
          label="URL"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/acme/payments-api/blob/main/openapi.yaml"
        />
        <TextField
          label="Name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Our payments API"
        />
        {err && (
          <p role="alert" className={css.formError}>
            {err}
          </p>
        )}
        <p className={css.note}>
          Your browser fetches the file directly. The server must allow cross-origin requests
          (CORS); GitHub file links work.
        </p>
      </form>
    </Dialog>
  );
}
