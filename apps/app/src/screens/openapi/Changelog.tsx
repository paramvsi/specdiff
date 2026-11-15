// A-10 Changelog and export (OUT-01, OUT-02, OUT-03).
import { buildChangelog, reportToHtml, type ChangelogTemplate } from '@specdiff/core';
import { Button, Checkbox, useToast } from '@specdiff/ui';
import * as icons from 'lucide-react';
import { useMemo, useState } from 'react';
import { useApp } from '../../state/store';
import { ShareDialog } from '../ShareDialog';
import { copy } from './util';
import css from './Changelog.module.css';

const TEMPLATES: Array<[ChangelogTemplate, string]> = [['release-notes', 'Release notes'], ['keep-a-changelog', 'Keep a Changelog'], ['slack', 'Slack message'], ['pr-comment', 'PR comment']];

export function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Changelog() {
  const { result, before, after, mode, settings, decisions } = useApp();
  const { toast } = useToast();
  const [template, setTemplate] = useState<ChangelogTemplate>('release-notes');
  const [group, setGroup] = useState(true);
  const [docs, setDocs] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [share, setShare] = useState(false);
  const report = result && 'report' in result ? result.report : null;
  const key = `${template}|${group}|${docs}`;
  const generated = useMemo(() => (report ? buildChangelog(report, template, { groupBySeverity: group, includeDocs: docs, version: report.versionCheck?.suggested ?? report.inputs.after.infoVersion ?? '', date: new Date().toISOString().slice(0, 10) }) : ''), [report, template, group, docs]);
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
          <label className="sd-visually-hidden" htmlFor="changelog-text">Changelog text</label>
          <textarea id="changelog-text" className={css.text} value={text} spellCheck onChange={(e) => setEdits({ ...edits, [key]: e.target.value })} />
          <div className={css.foot}>
            {edits[key] !== undefined && <Button variant="ghost" onClick={() => { const n = { ...edits }; delete n[key]; setEdits(n); }}>Reset to generated</Button>}
            <Button variant="secondary" onClick={() => download(`${base}-changelog.md`, text, 'text/markdown')}>Download .md</Button>
            <Button variant="inverse" icon={<icons.Copy size={15} />} onClick={() => { void copy(text); toast({ title: 'Changelog copied' }); }}>Copy</Button>
          </div>
        </div>
      </section>
      <aside className={css.side}>
        <section className={css.card} aria-labelledby="share-h">
          <h2 id="share-h" className={css.h2}>Share this comparison</h2>
          <p className={css.muted}>The link holds both files, compressed. Nothing is stored on a server, so anyone with the link can see the content.</p>
          <Button variant="brand" icon={<icons.Link size={15} />} onClick={() => setShare(true)}>Create a link</Button>
        </section>
        <h2 className={css.exportTitle}>Export</h2>
        <div className={css.exports}>
          <ExportCard title="Markdown" body="The changelog above, ready for a release." ext=".md" onClick={() => download(`${base}-changelog.md`, text, 'text/markdown')} />
          <ExportCard title="JSON report" body="Every change with path, rule and severity, for scripts." ext=".json" onClick={() => download(`${base}-report.json`, JSON.stringify(report, null, 2) + '\n', 'application/json')} />
          <ExportCard title="HTML report" body="A standalone page to share with people who don’t use Specdiff." ext=".html" onClick={() => download(`${base}-report.html`, reportToHtml(report), 'text/html')} />
          <ExportCard title="Comparison file" body="Both files and your options, to open later or share when the link is too long." ext=".specdiff.json" onClick={() => download(`${base}.specdiff.json`, JSON.stringify({ left: { name: before?.name ?? 'before', content: before?.content ?? '' }, right: { name: after?.name ?? 'after', content: after?.content ?? '' }, mode: mode === 'auto' ? 'openapi' : mode, options: settings.config, decisions }, null, 2), 'application/json')} />
        </div>
      </aside>
      {share && <ShareDialog open onOpenChange={setShare} />}
    </div>
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
