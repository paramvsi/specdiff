// A-01 Compare (IN-01..IN-07, IN-10, X-01), with A-01 drag over, O-05 Load from URL and O-08 File too large;
// A03-Patch (TX-12) opens from here, and each side can be reloaded from where it came (IN-06).
import type { HistoryEntry, Mode } from '@specdiff/core';
import { detectMode } from '@specdiff/core/detect';
import { looksLikePatch } from '@specdiff/core/text/patch';
import {
  Button,
  Checkbox,
  Dialog,
  ParseErrorState,
  SegmentedControl,
  SeverityBadge,
  TextField,
  useToast,
} from '@specdiff/ui';
import * as icons from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
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
import { isComparisonName, readComparisonFile } from '../lib/comparison';
import { samples } from '../lib/samples';
import { openPayload, openSample } from '../shell/boot';
import { usePatch } from '../shell/chrome';
import { useCommand } from '../shell/commands';
import { listHistory, loadPayload } from '../state/persist';
import { useApp, type Side } from '../state/store';
import { useQueuedToasts } from '../state/toasts';
import css from './Compare.module.css';
import { ReloadButton } from './text/ReloadButton';

const PatchPanel = lazy(() => import('./text/PatchPanel').then((m) => ({ default: m.PatchPanel })));

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
  useQueuedToasts();
  const [dragging, setDragging] = useState<Side | null>(null);
  const [urlFor, setUrlFor] = useState<Side | null>(null);
  const [tooLarge, setTooLarge] = useState<Source | null>(null);
  const [tooLargeSide, setTooLargeSide] = useState<Side>('after');
  // TX-12: the patch being opened (null: show the two editors). Shared with the top bar, which shows Back for it.
  const { patch, setPatch } = usePatch();
  useEffect(() => () => usePatch.getState().setPatch(null), []);
  const fileInput = useRef<HTMLInputElement>(null);
  const fileSide = useRef<Side>('before');

  const accept = useCallback(
    async (side: Side, s: Source) => {
      // OUT-06: a comparison file (.specdiff.json) opens the comparison it carries, on either side.
      if (isComparisonName(s.name) || (/\.json$/i.test(s.name) && /^\s*\{\s*"left"\s*:/.test(s.content.slice(0, 200)))) {
        const payload = await readComparisonFile(s.content);
        if (payload) {
          void openPayload(payload);
          return;
        }
        if (isComparisonName(s.name)) {
          toast({
            title: `Couldn’t open ${s.name}`,
            description: 'It isn’t a Specdiff comparison file, or it is damaged.',
            tone: 'error',
          });
          return;
        }
      }
      if (sizeVerdict(s.size) === 'text-only') {
        setTooLarge(s);
        setTooLargeSide(side);
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

  const detectedInfo = before
    ? detectMode(before.name, before.content)
    : after
      ? detectMode(after.name, after.content)
      : null;
  const parseError = result && 'kind' in result ? result : null;
  const ignoreWs = settings.config.text?.ignoreWhitespace ?? false;
  const hideDocs = settings.config.openapi?.hideDocsOnly ?? false;
  // TX-12: one side holds a patch and the other is empty.
  const patchSide: Side | null =
    before?.content && !after?.content && looksLikePatch(before.content)
      ? 'before'
      : after?.content && !before?.content && looksLikePatch(after.content)
        ? 'after'
        : null;

  if (patch !== null)
    return (
      <Suspense fallback={null}>
        <PatchPanel initial={patch} onClose={() => setPatch(null)} />
      </Suspense>
    );

  return (
    // A-01 drag over: the page becomes two tall drop zones (the rest of the Compare chrome steps aside).
    <div className={css.page} data-dragging={dragging ? '' : undefined}>
      <header className={css.head}>
        <div>
          <h1 className={css.h1}>{dragging ? 'Compare two versions' : 'Compare two files'}</h1>
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
          <button type="button" className={css.sample} onClick={() => setPatch('')}>
            <icons.FileDiff size={14} aria-hidden="true" /> Paste a patch
          </button>
        </div>
      </header>

      {patchSide && (
        <div className={css.patchNotice} role="status">
          <icons.FileDiff size={16} aria-hidden="true" />
          <span>
            {patchSide === 'before' ? 'Before' : 'After'} looks like a patch or <code>git diff</code>{' '}
            output.
          </span>
          <Button
            variant="secondary"
            onClick={() => setPatch((patchSide === 'before' ? before : after)?.content ?? '')}
          >
            Open as a patch
          </Button>
        </div>
      )}

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
                {dragging ? (
                  // A-01 drag over: both sides become drop zones; a loaded side shows its file.
                  <DropSide side={side} src={src} target={dragging === side} />
                ) : (
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
                <ReloadButton side={side} />
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
          <icons.ArrowRightLeft size={16} aria-hidden="true" />
        </button>
      </div>

      <input
        ref={fileInput}
        type="file"
        hidden
        accept=".yaml,.yml,.json,.specdiff.json,.md,.markdown,.txt,.log,.zip,.ts,.tsx,.js,.jsx,.java,.py,text/*"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) {
            try {
              accept(fileSide.current, await fromFile(f));
            } catch (err) {
              toast({
                title: `Couldn’t read ${f.name}`,
                description: String((err as LoadError).message ?? err),
                tone: 'error',
              });
            }
          }
        }}
      />

      <div className={css.options}>
        <span className={css.detected}>
          Detected <span className={css.detectedValue}>{detectedInfo ? detectedLabel(detectedInfo) : ''}</span>
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
          onLoad={(into, s) => {
            accept(into, s);
            setUrlFor(null);
          }}
        />
      )}
      {tooLarge && (
        <TooLargeDialog
          file={tooLarge}
          side={tooLargeSide}
          other={tooLargeSide === 'before' ? after : before}
          onClose={() => setTooLarge(null)}
          onCompareAsText={() => {
            setMode('text');
            setTooLarge(null);
          }}
          onChooseAnother={() => {
            setTooLarge(null);
            pick(tooLargeSide);
          }}
        />
      )}
    </div>
  );
}

const SIDE_LABEL: Record<Side, string> = { before: 'Before', after: 'After' };

const LANGUAGE_NAME: Record<string, string> = {
  typescript: 'TypeScript', javascript: 'JavaScript', java: 'Java', python: 'Python', go: 'Go', ruby: 'Ruby',
  rust: 'Rust', kotlin: 'Kotlin', csharp: 'C#', c: 'C', cpp: 'C++', swift: 'Swift', php: 'PHP', shell: 'Shell',
  sql: 'SQL', css: 'CSS', html: 'HTML',
};
/** "Code · Java": code names its language (detected from the extension). */
export function detectedLabel(d: { mode: Mode; language?: string | undefined }): string {
  return d.mode === 'code' && d.language ? `Code · ${LANGUAGE_NAME[d.language] ?? d.language}` : DETECTED[d.mode];
}

function describeSource(src: Source): string {
  const d = detectMode(src.name, src.content.slice(0, 65536));
  const kind =
    d.mode === 'openapi' && d.specVersion
      ? `${d.specVersion.startsWith('2') ? 'Swagger' : 'OpenAPI'} ${d.specVersion.split('.').slice(0, 2).join('.')}`
      : DETECTED[d.mode];
  return `${kind} · ${formatBytes(src.size)}`;
}

/** A-01 drag over: the target side turns into the drop zone; the other shows its file, or an empty zone. */
function DropSide({ side, src, target }: { side: Side; src: Source | null; target: boolean }) {
  if (target)
    return (
      <div className={css.zone} data-target="">
        <icons.ArrowUpToLine size={24} aria-hidden="true" />
        <p className={css.zoneTitle}>Drop to use as {SIDE_LABEL[side]}</p>
        <p className={css.zoneDetail}>
          One file, a folder, or a ZIP of a split spec. External $refs inside the folder are resolved.
        </p>
      </div>
    );
  return (
    <div className={css.zone}>
      {src?.content ? (
        <>
          <icons.File size={22} aria-hidden="true" />
          <p className={css.zoneFile}>{src.name}</p>
          <p className={css.zoneDetail}>
            {SIDE_LABEL[side]} · {describeSource(src)}
          </p>
        </>
      ) : (
        <p className={css.zoneDetail}>Drop to use as {SIDE_LABEL[side]}</p>
      )}
    </div>
  );
}

/** O-08 File too large: both files with sizes, two options, and the CLI for files this big (B-11). */
function TooLargeDialog({
  file,
  side,
  other,
  onClose,
  onCompareAsText,
  onChooseAnother,
}: {
  file: Source;
  side: Side;
  other: Source | null;
  onClose: () => void;
  onCompareAsText: () => void;
  onChooseAnother: () => void;
}) {
  const ext = /\.ya?ml$/i.test(file.name) ? 'yaml' : 'json';
  const format = ext === 'yaml' ? 'YAML' : 'JSON';
  const files = (side === 'before' ? [file, other] : [other, file]) as Array<Source | null>;
  return (
    <Dialog
      open
      title={`${file.name} is ${formatBytes(file.size)}`}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      className={css.wideDialog}
      icon={
        <span className={css.warnTile} aria-hidden="true">
          <icons.TriangleAlert size={20} />
        </span>
      }
      actions={
        <div className={css.band}>
          <span className={css.bandNote}>
            Run large files from your terminal:{' '}
            <code className={css.cmd}>npx specdiff-cli a.{ext} b.{ext}</code>
          </span>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className={css.tooLarge}>
        <p className={css.tooLargeBody}>
          Structural {format} comparison works up to 25 MB in the browser. Above that, building the
          tree uses more memory than most tabs allow and the page can freeze.
        </p>
        <dl className={css.sizes}>
          {files.map((f, i) =>
            f ? (
              <div key={i}>
                <dt>{i ? 'After' : 'Before'}</dt>
                <dd>
                  {f.name} · {formatBytes(f.size)}
                </dd>
              </div>
            ) : null,
          )}
        </dl>
        <div className={css.optionCard}>
          <div>
            <p className={css.optionTitle}>Compare as text</p>
            <p className={css.optionText}>
              Line and word diff only. Key order and array matching are not available.
            </p>
          </div>
          <Button variant="brand" onClick={onCompareAsText}>
            Compare as text
          </Button>
        </div>
        <div className={css.optionCard} data-tone="raised">
          <div>
            <p className={css.optionTitle}>Use smaller files</p>
            <p className={css.optionText}>
              Split the export, or remove fields you don’t need, then compare again.
            </p>
          </div>
          <Button variant="secondary" onClick={onChooseAnother}>
            Choose another file
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function UrlDialog({
  side,
  onClose,
  onLoad,
}: {
  side: Side;
  onClose: () => void;
  onLoad: (into: Side, s: Source) => void;
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
      onLoad(into, await loadUrl(url));
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
  return (
    <Dialog
      open
      title="Load from URL"
      description="Paste a link to a raw file or a GitHub file page."
      className={css.wideDialog}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      actions={
        <div className={css.band}>
          <span className={css.bandNote}>
            <icons.Shield size={13} aria-hidden="true" /> The file goes from that server to this tab
            only.
          </span>
          <span className={css.bandActions}>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="brand"
              icon={<icons.Download size={15} />}
              disabled={!url.trim() || busy}
              onClick={() => void submit()}
            >
              {busy ? 'Loading…' : 'Load file'}
            </Button>
          </span>
        </div>
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
          mono
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
        <div className={css.into}>
          <span className={css.intoLabel} id="load-into">
            Load into
          </span>
          <div className={css.intoTrack}>
            <SegmentedControl
              label="Load into"
              value={into}
              onValueChange={setInto}
              options={[
                { value: 'before', label: 'Before' },
                { value: 'after', label: 'After' },
              ]}
            />
          </div>
        </div>
        {err && (
          <p role="alert" className={css.error}>
            {err}
          </p>
        )}
        <p className={css.cors}>
          <icons.TriangleAlert size={14} aria-hidden="true" className={css.corsIcon} />
          <span>
            Your browser fetches the file directly. If the server doesn’t allow cross-origin
            requests, download the file and drop it in instead.
          </span>
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
                    <span className={css.changes}>{e.summary.total} change{e.summary.total === 1 ? '' : 's'}</span>
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
