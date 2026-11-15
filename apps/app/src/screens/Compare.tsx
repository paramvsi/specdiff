// A-01 Compare (IN-01..IN-07, IN-10, X-01), with A-01 drag over, O-05 Load from URL and O-08 File too large.
import type { HistoryEntry, Mode } from '@specdiff/core';
import { detectMode } from '@specdiff/core/detect';
import {
  Button,
  Checkbox,
  Dialog,
  DropZone,
  ParseErrorState,
  SeverityBadge,
  TextField,
  TooLargeState,
  useToast,
} from '@specdiff/ui';
import * as icons from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  formatBytes,
  fromDataTransfer,
  fromFile,
  loadUrl,
  sizeVerdict,
  toRawUrl,
  type LoadError,
  type Source,
} from '../lib/input';
import { samples } from '../lib/samples';
import { openSample } from '../shell/boot';
import { useCommand } from '../shell/commands';
import { listHistory, loadPayload } from '../state/persist';
import { useApp, type Side } from '../state/store';
import css from './Compare.module.css';

const MODES: Array<{ value: Mode | 'auto'; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'openapi', label: 'OpenAPI' },
  { value: 'yaml', label: 'JSON / YAML' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'code', label: 'Code (Beta)' },
  { value: 'text', label: 'Plain text' },
];
const DETECTED: Record<Mode, string> = {
  openapi: 'OpenAPI',
  json: 'JSON',
  yaml: 'YAML',
  markdown: 'Markdown',
  code: 'Code',
  text: 'Plain text',
};

export function Compare() {
  const {
    before,
    after,
    mode,
    setMode,
    setSource,
    setText,
    swap,
    compare,
    settings,
    updateConfig,
    error,
    result,
  } = useApp();
  const { toast } = useToast();
  const [dragging, setDragging] = useState<Side | null>(null);
  const [urlFor, setUrlFor] = useState<Side | null>(null);
  const [tooLarge, setTooLarge] = useState<Source | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const fileSide = useRef<Side>('before');

  const accept = useCallback(
    (side: Side, s: Source) => {
      if (sizeVerdict(s.size) === 'text-only') {
        setTooLarge(s);
        setSource(side, s);
        return;
      }
      if (sizeVerdict(s.size) === 'warn')
        toast({
          title: `${s.name} is ${formatBytes(s.size)}`,
          description: 'Large files take a few seconds. The page stays responsive.',
          tone: 'info',
        });
      setSource(side, s);
    },
    [setSource, toast],
  );

  const onDrop = async (side: Side, e: React.DragEvent) => {
    e.preventDefault();
    setDragging(null);
    try {
      const s = await fromDataTransfer(e.dataTransfer);
      if (s) accept(side, s);
    } catch (err) {
      toast({
        title: "Couldn't read that",
        description: (err as LoadError).message ?? String(err),
        tone: 'error',
      });
    }
  };
  const pick = (side: Side) => {
    fileSide.current = side;
    fileInput.current?.click();
  };
  useCommand(
    'open-file',
    useCallback(() => pick('before'), []),
  );
  useCommand(
    'load-url',
    useCallback(() => setUrlFor('before'), []),
  );
  useCommand('swap', swap);

  const detected = before
    ? detectMode(before.name, before.content).mode
    : after
      ? detectMode(after.name, after.content).mode
      : null;
  const parseError = result && 'kind' in result ? result : null;
  const ignoreWs = settings.config.text?.ignoreWhitespace ?? false;
  const hideDocs = settings.config.openapi?.hideDocsOnly ?? false;

  return (
    <div className={css.page}>
      <header className={css.head}>
        <div>
          <h1 className={css.h1}>Compare two files</h1>
          <p className={css.lead}>
            OpenAPI, JSON, YAML, Markdown, code or plain text. Everything stays in your browser.
          </p>
        </div>
        <div className={css.samples} role="group" aria-label="Try a sample">
          <span className={css.samplesLabel}>Try a sample:</span>
          {samples().map((s) => (
            <button
              key={s.id}
              type="button"
              className={css.sample}
              onClick={() => void openSample(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <p role="alert" className={css.error}>
          {error}
        </p>
      )}
      {parseError && (
        <ParseErrorState
          title={`Couldn't parse ${(parseError.side === 'before' ? before : after)?.name ?? parseError.side}: line ${parseError.line}`}
          errorLine={parseError.line}
          column={parseError.column}
          hint={`${parseError.message}. ${parseError.hint}`}
          lines={parseError.excerpt.map((text, i) => ({
            number: Math.max(1, parseError.line - 2) + i,
            text,
          }))}
        />
      )}

      <div className={css.editors}>
        {(['before', 'after'] as const).map((side) => {
          const src = side === 'before' ? before : after;
          const id = `editor-${side}`;
          return (
            <section key={side} className={css.side} aria-labelledby={`${id}-label`}>
              <label id={`${id}-label`} htmlFor={id} className={css.label}>
                {side === 'before' ? 'Before' : 'After'}
                {src?.name && src.name !== (side === 'before' ? 'Before' : 'After') && (
                  <span className={css.name}>{src.name}</span>
                )}
              </label>
              <div
                className={css.dropTarget}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(side);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(null);
                }}
                onDrop={(e) => void onDrop(side, e)}
              >
                <textarea
                  id={id}
                  className={css.textarea}
                  placeholder="Paste here, or drop a file"
                  spellCheck={false}
                  value={
                    src && src.content.length < 2_000_000
                      ? src.content
                      : src
                        ? `${src.name} · ${formatBytes(src.size)} (too large to show here)`
                        : ''
                  }
                  readOnly={!!src && src.content.length >= 2_000_000}
                  onChange={(e) => setText(side, e.target.value)}
                />
                {dragging === side && (
                  <DropZone
                    dragging
                    title="Drop to compare"
                    detail="A file, a folder or a ZIP. Multi-file specs resolve their $refs inside it."
                    className={css.overlay}
                  />
                )}
              </div>
              <div className={css.sideActions}>
                <Button
                  variant="secondary"
                  icon={<icons.Upload size={15} />}
                  onClick={() => pick(side)}
                >
                  Open file
                </Button>
                <Button variant="secondary" onClick={() => setUrlFor(side)}>
                  From URL
                </Button>
              </div>
            </section>
          );
        })}
        <button
          type="button"
          className={css.swap}
          onClick={swap}
          aria-label="Swap before and after"
          aria-keyshortcuts="Shift+S"
        >
          <icons.ArrowLeftRight size={16} aria-hidden="true" />
        </button>
      </div>

      <input
        ref={fileInput}
        type="file"
        hidden
        accept=".yaml,.yml,.json,.md,.markdown,.txt,.log,.zip,.ts,.tsx,.js,.jsx,.java,.py,text/*"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) {
            try {
              accept(fileSide.current, await fromFile(f));
            } catch (err) {
              toast({
                title: "Couldn't read that file",
                description: String((err as LoadError).message ?? err),
                tone: 'error',
              });
            }
          }
        }}
      />

      <div className={css.options}>
        <span className={css.detected}>
          Detected <span className={css.detectedValue}>{detected ? DETECTED[detected] : ''}</span>
        </span>
        <label className={css.compareAs}>
          Compare as
          <select
            className={css.select}
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode | 'auto')}
          >
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <Checkbox
          label="Ignore whitespace"
          checked={ignoreWs}
          onCheckedChange={(v) =>
            updateConfig((c) => ({ ...c, text: { ...c.text, ignoreWhitespace: v } }))
          }
        />
        <Checkbox
          label="Hide docs-only changes"
          checked={hideDocs}
          onCheckedChange={(v) =>
            updateConfig((c) => ({ ...c, openapi: { ...c.openapi, hideDocsOnly: v } }))
          }
        />
        <Button
          variant="brand"
          className={css.go}
          disabled={!before?.content || !after?.content}
          onClick={() => void compare()}
        >
          Compare <icons.ArrowRight size={16} aria-hidden="true" />
        </Button>
      </div>

      <p className={css.privacy}>
        <icons.Lock size={13} aria-hidden="true" /> Files are parsed in your browser. Nothing is
        uploaded, and sharing links carry the content themselves.
      </p>

      <Recent />

      {urlFor && (
        <UrlDialog
          side={urlFor}
          onClose={() => setUrlFor(null)}
          onLoad={(s) => {
            accept(urlFor, s);
            setUrlFor(null);
          }}
        />
      )}
      {tooLarge && (
        <Dialog
          open
          title={`${tooLarge.name} is ${formatBytes(tooLarge.size)}`}
          onOpenChange={(o) => {
            if (!o) setTooLarge(null);
          }}
        >
          <TooLargeState
            fileName={tooLarge.name}
            size={formatBytes(tooLarge.size)}
            limit="25 MB"
            onCompareAsText={() => {
              setMode('text');
              setTooLarge(null);
            }}
            onChooseAnother={() => {
              setTooLarge(null);
              pick('after');
            }}
          />
        </Dialog>
      )}
    </div>
  );
}

function UrlDialog({
  side,
  onClose,
  onLoad,
}: {
  side: Side;
  onClose: () => void;
  onLoad: (s: Source) => void;
}) {
  const [url, setUrl] = useState('');
  const [into, setInto] = useState<Side>(side);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const raw = toRawUrl(url);
  const github = /^https:\/\/(gist\.)?github\.com\//.test(url.trim()) && raw !== url.trim();
  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      onLoad(await loadUrl(url));
    } catch (e) {
      const le = e as LoadError;
      setErr(
        le.kind === 'cors'
          ? `${le.message} Download the file and drop it in instead.`
          : (le.message ?? String(e)),
      );
    } finally {
      setBusy(false);
    }
  };
  void into;
  return (
    <Dialog
      open
      title="Load from URL"
      description="Paste a link to a raw file or a GitHub file page."
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brand" disabled={!url.trim() || busy} onClick={() => void submit()}>
            {busy ? 'Loading…' : 'Load file'}
          </Button>
        </>
      }
    >
      <form
        className={css.urlForm}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <TextField
          label="File URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/acme/payments-api/blob/main/openapi.yaml"
         
          inputMode="url"
        />
        {github && (
          <p className={css.hint}>
            GitHub link detected. We’ll fetch <code>{raw.replace(/^https:\/\//, '')}</code>.
          </p>
        )}
        <fieldset className={css.into}>
          <legend>Load into</legend>
          {(['before', 'after'] as const).map((s) => (
            <label key={s}>
              <input type="radio" name="into" checked={into === s} onChange={() => setInto(s)} />{' '}
              {s === 'before' ? 'Before' : 'After'}
            </label>
          ))}
        </fieldset>
        {err && (
          <p role="alert" className={css.error}>
            {err}
          </p>
        )}
        <p className={css.note}>
          Your browser fetches the file directly. If the server doesn’t allow cross-origin requests,
          download the file and drop it in instead. The file goes from that server to this tab only.
        </p>
      </form>
    </Dialog>
  );
}

const ago = (iso: string) => {
  const d = Math.floor((Date.now() - Date.parse(iso)) / 864e5);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
};

function Recent() {
  const [rows, setRows] = useState<HistoryEntry[]>([]);
  const { setSource, compare } = useApp();
  useEffect(() => {
    void listHistory()
      .then((r) => setRows(r.slice(0, 3)))
      .catch(() => {});
  }, []);
  if (!rows.length) return null;
  const open = async (e: HistoryEntry) => {
    const p = await loadPayload(e.payloadRef);
    if (!p) return;
    setSource('before', p.before);
    setSource('after', p.after);
    await compare();
  };
  return (
    <section aria-labelledby="recent" className={css.recent}>
      <h2 id="recent" className={css.h2}>
        Recent comparisons
      </h2>
      <ul className={css.recentList}>
        {rows.map((e) => {
          const sev = e.summary.breaking
            ? 'breaking'
            : e.summary.possibly
              ? 'possibly'
              : e.summary.safe
                ? 'safe'
                : 'docs';
          return (
            <li key={e.id}>
              <button type="button" className={css.recentCard} onClick={() => void open(e)}>
                <span className={css.recentName}>
                  {e.before.name === e.after.name
                    ? e.after.name
                    : `${e.before.name.replace(/\.[^.]+$/, '')} → ${e.after.name}`}
                </span>
                <span className={css.recentMeta}>
                  {e.mode === 'openapi' ? (
                    <SeverityBadge severity={sev} />
                  ) : (
                    <span className={css.changes}>{e.summary.total} changes</span>
                  )}{' '}
                  {ago(e.openedAt)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
