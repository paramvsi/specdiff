// OA-21: download and import `.specdiff/decisions.json` from the review panel and the Changelog export area.
import { Button, useToast } from '@specdiff/ui';
import * as icons from 'lucide-react';
import { useRef } from 'react';
import { useApp } from '../../state/store';
import { download } from './util';
import { DECISIONS_NAME, decisionsJson, readDecisions } from './decisions';

export function DecisionsActions({ className }: { className?: string | undefined }) {
  const { decisions, setDecisions, result } = useApp();
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const changes = result && 'report' in result ? result.report.changes : [];
  const count = Object.keys(decisions.decisions).length;
  const onFile = async (f: File) => {
    const r = readDecisions(await f.text(), changes);
    if ('error' in r) {
      toast({ title: `Couldn’t import ${f.name}`, description: r.error, tone: 'error' });
      return;
    }
    setDecisions(r.file);
    const stale = r.stale.length ? ` ${r.stale.length} no longer match a change in this comparison (stale): kept in the file, ignored here and by the CLI.` : '';
    toast({ title: `Imported ${r.matched} decision${r.matched === 1 ? '' : 's'}`, description: `From ${f.name}.${stale}` });
  };
  return (
    <div className={className}>
      <Button variant="secondary" icon={<icons.Download size={15} />} disabled={!count}
        onClick={() => { download(DECISIONS_NAME, decisionsJson(decisions), 'application/json'); toast({ title: 'decisions.json downloaded', description: 'Put it in .specdiff/ next to your spec and commit it.' }); }}>
        Download decisions.json
      </Button>
      <Button variant="secondary" icon={<icons.Upload size={15} />} onClick={() => input.current?.click()}>Import decisions.json</Button>
      <input ref={input} type="file" hidden accept=".json,application/json" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void onFile(f); }} />
    </div>
  );
}
