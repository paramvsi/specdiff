// A-10 Changelog, export and share (OUT-01, OUT-02, OUT-03, OUT-05). decisions.json lives in the review panel (OA-21).
import { reportToHtml, type ChangelogTemplate } from '@specdiff/core';
import { encodeShare } from '@specdiff/core/share';
import { Button, Checkbox, useToast } from '@specdiff/ui';
import * as icons from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNav } from '../../shell/nav';
import { useApp } from '../../state/store';
import { sharePayload } from '../ShareDialog';
import { designChangelog, headingTone } from './changelogText';
import { useSpecContext } from './Title';
import { copy, download } from './util';
import css from './Changelog.module.css';

export { download } from './util';

const TEMPLATES: Array<[ChangelogTemplate, string]> = [['release-notes', 'Release notes'], ['keep-a-changelog', 'Keep a Changelog'], ['slack', 'Slack message'], ['pr-comment', 'PR comment']];

/** The Markdown with headings coloured by severity, drawn under a transparent textarea of the same metrics. */
function Highlight({ text }: { text: string }) {
  return (
    <pre className={css.highlight} aria-hidden="true">
      {text.split('\n').map((line, i) => {
        const tone = headingTone(line);
        return <Fragment key={i}>{tone ? <span className={css.h} data-tone={tone}>{line}</span> : line}{'\n'}</Fragment>;
      })}
      {'​'}
    </pre>
  );
}

export function Changelog() {
  const { result, before, after, mode, settings, decisions } = useApp();
  const { toast } = useToast();
  const { spec } = useSpecContext();
  const [template, setTemplate] = useState<ChangelogTemplate>('release-notes');
  const [group, setGroup] = useState(true);
  const [docs, setDocs] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [shareCard, setShareCard] = useState(true);
  const report = result && 'report' in result ? result.report : null;
  const key = `${template}|${group}|${docs}`;
  const generated = useMemo(() => (report ? designChangelog(report, template, { groupBySeverity: group, includeDocs: docs, version: report.versionCheck?.suggested ?? report.inputs.after.infoVersion ?? '', date: new Date().toISOString().slice(0, 10) }, spec) : ''), [report, template, group, docs, spec]);
  if (!report) return null;
  const text = edits[key] ?? generated;
  const base = (after?.name ?? 'spec').replace(/\.[^.]+$/, '');

  return (
    <div className={css.layout}>
      <section className={css.main} aria-labelledby="cl-title">
        <div className={css.head}>
          <h1 id="cl-title" className={css.h1}>Changelog</h1>
          <div role="tablist" aria-label="Template" className={css.tabs}>
            {TEMPLATES.map(([t, label]) => <button key={t} role="tab" type="button" aria-selected={template === t} className={css.tab} onClick={() => setTemplate(t)}>{label}</button>)}
          </div>
        </div>
        <div className={css.editor}>
          <div className={css.bar}>
            <Checkbox label="Group by severity" checked={group} onCheckedChange={setGroup} />
            <Checkbox label="Include docs-only" checked={docs} onCheckedChange={setDocs} />
            <span className={css.hint}>editable · Markdown</span>
          </div>
          <div className={css.textWrap}>
            <Highlight text={text} />
            <label className="sd-visually-hidden" htmlFor="changelog-text">Changelog text</label>
            <textarea id="changelog-text" className={css.text} value={text} spellCheck onChange={(e) => setEdits({ ...edits, [key]: e.target.value })} />
          </div>
          <div className={css.foot}>
            {edits[key] !== undefined && <Button variant="ghost" onClick={() => { const n = { ...edits }; delete n[key]; setEdits(n); }}>Reset to generated</Button>}
            <Button variant="secondary" onClick={() => download(`${base}-changelog.md`, text, 'text/markdown')}>Download .md</Button>
            <Button variant="inverse" icon={<icons.Copy size={15} />} onClick={() => { void copy(text); toast({ title: 'Changelog copied' }); }}>Copy</Button>
          </div>
        </div>
      </section>
      <aside className={css.side}>
        {shareCard && <ShareCard onClose={() => setShareCard(false)} />}
        <h2 className={css.exportTitle}>Export</h2>
        <div className={css.exports}>
          <ExportCard title="Markdown" body="The changelog above, ready for a release." ext=".md" onClick={() => download(`${base}-changelog.md`, text, 'text/markdown')} />
          <ExportCard title="JSON report" body="Every change with path, rule and severity, for scripts." ext=".json" onClick={() => download(`${base}-report.json`, JSON.stringify(report, null, 2) + '\n', 'application/json')} />
          <ExportCard title="HTML report" body="A standalone page to share with people who don’t use Specdiff." ext=".html" onClick={() => download(`${base}-report.html`, reportToHtml(report), 'text/html')} />
          <ExportCard title="Comparison file" body="Both files and your options, to open later or share when the link is too long." ext=".specdiff.json" onClick={() => download(`${base}.specdiff.json`, JSON.stringify({ left: { name: before?.name ?? 'before', content: before?.content ?? '' }, right: { name: after?.name ?? 'after', content: after?.content ?? '' }, mode: mode === 'auto' ? 'openapi' : mode, options: settings.config, decisions }, null, 2), 'application/json')} />
        </div>
      </aside>
    </div>
  );
}

/** A-10 share card: the link, Copy link and the two designed options. Lock and decisions live in the top bar's Share. */
function ShareCard({ onClose }: { onClose: () => void }) {
  const { before, after, result, mode, settings, decisions } = useApp();
  const changeId = useNav((s) => s.changeId);
  const { toast } = useToast();
  const [openOnChanges, setOpenOnChanges] = useState(true);
  const [rules, setRules] = useState(false);
  const [link, setLink] = useState('');
  useEffect(() => {
    if (!before || !after) return;
    let live = true;
    const p = sharePayload({ before, after, result, mode, settings, decisions, includeRules: rules, includeDecisions: false, changeId: null });
    const payload = openOnChanges ? { ...p, view: { tab: 'workspace', ...(changeId ? { changeId } : {}) } } : p;
    void encodeShare(payload).then((h) => { if (live) setLink(`${location.origin}${location.pathname}#${h}`); });
    return () => { live = false; };
  }, [before, after, result, mode, settings, decisions, rules, openOnChanges, changeId]);
  return (
    <section className={css.card} aria-labelledby="share-h">
      <div className={css.shareHead}>
        <h2 id="share-h" className={css.h2}>Share this comparison</h2>
        <Button variant="secondary" iconOnly icon={<icons.X size={16} />} aria-label="Close" onClick={onClose} />
      </div>
      <p className={css.muted}>The link holds both files, compressed. Nothing is stored on a server, so anyone with the link can see the content.</p>
      <div className={css.linkRow}>
        <input className={css.linkField} readOnly value={link} aria-label="Comparison link" onFocus={(e) => e.currentTarget.select()} />
        <Button variant="brand" icon={<icons.Copy size={15} />} disabled={!link} onClick={() => { void copy(link)?.then(() => toast({ title: 'Link copied' }), () => toast({ title: 'Couldn’t copy', tone: 'error' })); }}>Copy link</Button>
      </div>
      <Checkbox label="Open on the Changes view" checked={openOnChanges} onCheckedChange={setOpenOnChanges} />
      <Checkbox label="Include my rules and filters" checked={rules} onCheckedChange={setRules} />
    </section>
  );
}

function ExportCard({ title, body, ext, onClick }: { title: string; body: string; ext: string; onClick: () => void }) {
  return (
    <button type="button" className={css.export} onClick={onClick}>
      <span className={css.exportName}>{title}</span>
      <span className={css.muted}>{body}</span>
      <code className={css.ext}>{ext}</code>
    </button>
  );
}
