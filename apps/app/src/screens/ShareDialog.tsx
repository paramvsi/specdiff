// O-09 Share (OUT-05, OUT-06, OUT-09). The link carries both files in its hash, compressed and
// optionally encrypted with AES-GCM in this tab. The passphrase never leaves the browser.
import type { DecisionsFile, Mode, SharePayload } from '@specdiff/core';
import { detectMode } from '@specdiff/core/detect';
import { encodeShare, SHARE_WARN_BYTES } from '@specdiff/core/share';
import { Button, Checkbox, Dialog, PassphraseField, Switch, useToast } from '@specdiff/ui';
import * as icons from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Source } from '../lib/input';
import { useNav } from '../shell/nav';
import { useApp, type Settings } from '../state/store';
import type { CompareResult } from '../worker/protocol';
import { copyText, download } from './ExportMenu';
import css from './ShareDialog.module.css';

export interface ShareInput {
  before: Source;
  after: Source;
  result: CompareResult | null;
  mode?: Mode | 'auto';
  settings: Settings;
  decisions: DecisionsFile;
  includeRules: boolean;
  includeDecisions: boolean;
  changeId: string | null;
  /** The tab the change is open on (OUT-05: the link opens there). */
  tab?: string | undefined;
}

export function sharePayload(i: ShareInput): SharePayload {
  const mode: Mode =
    i.result && !('kind' in i.result)
      ? i.result.mode
      : i.mode && i.mode !== 'auto'
        ? i.mode
        : detectMode(i.before.name, i.before.content).mode;
  return {
    left: { name: i.before.name, content: i.before.content },
    right: { name: i.after.name, content: i.after.content },
    mode,
    ...(i.includeRules ? { options: i.settings.config as Record<string, unknown> } : {}),
    ...(i.includeDecisions && Object.keys(i.decisions.decisions).length
      ? { decisions: i.decisions }
      : {}),
    ...(i.changeId ? { view: { changeId: i.changeId, ...(i.tab ? { tab: i.tab } : {}) } } : {}),
  };
}

/** The same payload as the link, as a file (OUT-06). */
export function comparisonFile(i: ShareInput) {
  return {
    name: 'comparison.specdiff.json',
    content: JSON.stringify(sharePayload(i), null, 2) + '\n',
    type: 'application/json',
  };
}

function changeTitle(r: CompareResult | null, id: string | null): string | null {
  if (!r || 'kind' in r || !id) return null;
  if ('report' in r) {
    const c = r.report.changes.find((x) => x.id === id);
    if (!c) return null;
    return c.operation
      ? `${c.operation.method.toUpperCase()} ${c.operation.path} · ${c.changelogLine ?? c.path}`
      : (c.changelogLine ?? c.path);
  }
  if ('json' in r) return r.json.changes.find((x) => x.id === id)?.path ?? null;
  // Text, Markdown and Code changes (X-12 ids t-<n>, m-<n>, k-<name>).
  const m = /^([tmk])-(.+)$/.exec(id);
  if (!m) return null;
  if (m[1] === 'k') return 'code' in r ? m[2]! : null;
  if (m[1] === 'm') return 'markdown' in r ? `Block ${Number(m[2]) + 1}` : null;
  return 'text' in r && r.text.blocks.length > Number(m[2]) ? `Change ${Number(m[2]) + 1} of ${r.text.blocks.length}` : null;
}

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

export function ShareDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { before, after, result, mode, settings, decisions } = useApp();
  const changeId = useNav((s) => s.changeId);
  // OUT-05: a change is shown in the Workspace (OpenAPI); other modes have one view, so the tab is the same.
  const navTab = useNav((s) => s.tab);
  const tab = navTab && navTab !== 'summary' ? navTab : 'workspace';
  const { toast } = useToast();
  const [includeRules, setIncludeRules] = useState(true);
  const [openOnChange, setOpenOnChange] = useState(true);
  const [includeDecisions, setIncludeDecisions] = useState(false);
  const [locked, setLocked] = useState(false);
  const [pass, setPass] = useState('');
  const [made, setMade] = useState<{ req: object; link: string } | null>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const title = changeTitle(result, changeId);
  const hasDecisions = Object.keys(decisions.decisions).length > 0;

  const input = useMemo<ShareInput | null>(
    () =>
      before && after
        ? {
            before,
            after,
            result,
            mode,
            settings,
            decisions,
            includeRules,
            includeDecisions,
            changeId: openOnChange && title ? changeId : null,
            tab,
          }
        : null,
    [before, after, result, mode, settings, decisions, includeRules, includeDecisions, openOnChange, title, changeId, tab],
  );

  // The link belongs to one request; a stale one is never shown.
  const req = useMemo(
    () => (input && !(locked && !pass) ? { input, pass: locked ? pass : undefined } : null),
    [input, locked, pass],
  );
  useEffect(() => {
    if (!req) return;
    let live = true;
    // PBKDF2 takes a moment; wait for typing to pause before deriving the key.
    const t = setTimeout(
      () =>
        void encodeShare(sharePayload(req.input), req.pass).then((hash) => {
          if (live) setMade({ req, link: `${location.origin}${location.pathname}#${hash}` });
        }),
      req.pass ? 300 : 0,
    );
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [req]);
  const link = made && made.req === req ? made.link : '';
  const busy = !!req && !link;

  const size = new Blob([link]).size;
  const over = size > SHARE_WARN_BYTES;
  const near = !over && size > SHARE_WARN_BYTES * 0.75;
  const saveFile = () => {
    if (!input) return;
    const f = comparisonFile(input);
    download(f.name, f.content, f.type);
    saved.current = true;
  };
  // O-13: closing the dialog with a link too long for many chat apps, and no file saved, offers the file.
  const saved = useRef(false);
  const close = (o: boolean) => {
    if (!o && over && !saved.current)
      toast({
        title: 'Link is long',
        description: `Some apps cut links over ${kb(SHARE_WARN_BYTES).replace('.0', '')}.`,
        tone: 'warning',
        action: { label: 'Download file', onClick: saveFile },
      });
    if (!o) saved.current = false;
    onOpenChange(o);
  };
  const fileLink = (
    <button
      type="button"
      className="sd-link"
      onClick={saveFile}
    >
      download a comparison file
    </button>
  );

  const copy = async () => {
    if (!link) return;
    if (await copyText(link))
      toast({
        title: 'Link copied',
        description: locked ? 'Send the passphrase separately.' : undefined,
        tone: 'success',
      });
    else {
      linkRef.current?.select();
      toast({ title: 'Couldn’t copy', description: 'The link is selected: copy it with ⌘C or Ctrl+C.', tone: 'info' });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Share this comparison"
      description="Both files travel inside the link. Nothing is stored on a server."
      className={css.dialog}
      actions={
        <div className={css.foot}>
          <span className={css.footNote}>
            <icons.Shield size={13} aria-hidden="true" />
            {locked
              ? 'Encrypted in this browser with AES-GCM before the link is made.'
              : 'Compressed in this browser. Anyone with the link can see both files.'}
          </span>
          <Button variant="secondary" onClick={() => close(false)}>
            Done
          </Button>
        </div>
      }
    >
      <div className={css.body}>
        <div className={css.options}>
          <Checkbox
            label="Include my rules and ignore paths"
            checked={includeRules}
            onCheckedChange={setIncludeRules}
          />
          {title && (
            <div>
              <Checkbox
                label="Open on the current change"
                checked={openOnChange}
                onCheckedChange={setOpenOnChange}
              />
              <p className={css.sub}>{title}</p>
            </div>
          )}
          {hasDecisions && (
            <Checkbox
              label="Include review decisions"
              checked={includeDecisions}
              onCheckedChange={setIncludeDecisions}
            />
          )}
        </div>

        <div className={css.lock}>
          <div>
            <p className={css.lockTitle}>
              <icons.Lock size={14} aria-hidden="true" /> Lock with a passphrase
            </p>
            <p className={css.sub}>The link only opens for people who know it.</p>
          </div>
          <Switch label="Lock" hideLabel checked={locked} onCheckedChange={setLocked} className={css.switch} />
        </div>
        {locked && (
          <div className={css.passBox}>
            <PassphraseField value={pass} onValueChange={setPass} />
            <p className={css.note}>
              Send the passphrase separately, not in the same message as the link. If it’s lost,
              nobody can recover the comparison — including us. It never leaves this browser.
            </p>
          </div>
        )}

        <div className={css.size}>
          <div className={css.sizeHead}>
            <span>Link size</span>
            <span className={css.mono}>
              {link ? kb(size) : '—'} of {kb(SHARE_WARN_BYTES).replace('.0', '')}
            </span>
          </div>
          <span className={css.bar} aria-hidden="true">
            <span
              className={css.fill}
              data-level={over ? 'over' : near ? 'near' : 'ok'}
              style={{ width: `${Math.min(100, (size / SHARE_WARN_BYTES) * 100)}%` }}
            />
          </span>
          {over ? (
            <p className={css.warn} role="status">
              <icons.TriangleAlert size={14} aria-hidden="true" /> Over the limit. Many chat apps
              and browsers cut links this long; {fileLink} (.specdiff.json) instead.
            </p>
          ) : near ? (
            <p className={css.sub}>
              Close to the limit. Some chat apps cut long links; {fileLink} instead if it breaks.
            </p>
          ) : null}
          {over && (
            <Button
              variant="secondary"
              icon={<icons.Download size={15} />}
              onClick={saveFile}
            >
              Download comparison (.specdiff.json)
            </Button>
          )}
        </div>

        <div className={css.linkRow}>
          <input
            ref={linkRef}
            className={css.link}
            readOnly
            aria-label="Share link"
            value={link || (locked && !pass ? 'Enter a passphrase to make the link' : busy ? 'Making the link…' : '')}
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button
            variant="brand"
            icon={<icons.Copy size={15} />}
            disabled={!link || busy}
            onClick={() => void copy()}
          >
            Copy link
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
