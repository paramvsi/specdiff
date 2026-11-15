// Top-bar Export (A-10, JS-08, OUT-03, OUT-06): what applies to the current result.
// Files are made in this tab and saved with a Blob URL. Nothing is uploaded.
import type { Row } from '@specdiff/core/text';
import { Button, Menu, useToast, type MenuItem } from '@specdiff/ui';
import * as icons from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../state/store';
import { FeedDialog } from './openapi/FeedDialog';
import { JSON_EXPORTS, jsonExport } from './json/exports';
import { mdSummary } from './markdown/summary';
import { exportOpenApi, OPENAPI_EXPORTS, printReport } from './openapi/exports';
import { comparisonFile } from './ShareDialog';

export function download(name: string, content: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Unified diff (`diff -u` style, 3 lines of context) from core's aligned text rows. */
export function textPatch(rows: Row[], names: { before: string; after: string }, context = 3): string {
  const text = (s: Row['left']) => s!.segs.map((x) => x.text).join('');
  const out = [`--- ${names.before}`, `+++ ${names.after}`];
  const changed = rows.map((r) => r.type !== 'same');
  let i = 0;
  while (i < rows.length) {
    if (!changed[i]) {
      i++;
      continue;
    }
    const start = Math.max(0, i - context);
    let end = i;
    // Extend the hunk while the next change is within 2 × context.
    for (;;) {
      while (end < rows.length && changed[end]) end++;
      let next = end;
      while (next < rows.length && !changed[next]) next++;
      if (next < rows.length && next - end <= context * 2) end = next;
      else break;
    }
    const stop = Math.min(rows.length, end + context);
    const body: string[] = [];
    let a = 0;
    let b = 0;
    const firstLeft = rows.slice(start).find((r) => r.left)?.left?.n ?? 0;
    const firstRight = rows.slice(start).find((r) => r.right)?.right?.n ?? 0;
    const minus: string[] = [];
    const plus: string[] = [];
    const flush = () => {
      body.push(...minus, ...plus);
      minus.length = 0;
      plus.length = 0;
    };
    for (let k = start; k < stop; k++) {
      const r = rows[k]!;
      if (r.type === 'same') {
        flush();
        body.push(` ${text(r.left)}`);
        a++;
        b++;
      } else {
        if (r.left) {
          minus.push(`-${text(r.left)}`);
          a++;
        }
        if (r.right) {
          plus.push(`+${text(r.right)}`);
          b++;
        }
      }
    }
    flush();
    out.push(
      `@@ -${a ? firstLeft : Math.max(0, firstLeft - 1)},${a} +${b ? firstRight : Math.max(0, firstRight - 1)},${b} @@`,
      ...body,
    );
    i = stop;
  }
  return out.join('\n') + '\n';
}

const stem = (n: string) => n.replace(/\s*\(.*\)$/, '').replace(/\.[^.]+$/, '') || 'comparison';

export function ExportMenu({ disabled }: { disabled: boolean }) {
  const { result, before, after, settings, decisions } = useApp();
  const { toast } = useToast();
  const [feedOpen, setFeedOpen] = useState(false);
  const trigger = (
    <Button variant="brand" icon={<icons.Download size={15} />} disabled={disabled}>
      Export
    </Button>
  );
  if (disabled || !result || 'kind' in result || !before || !after) return trigger;
  const names = { before: before.name, after: after.name };
  const save = (f: { name: string; content: string; type: string }) => {
    download(f.name, f.content, f.type);
    toast({ title: `Downloaded ${f.name}`, tone: 'success' });
  };

  const items: Array<MenuItem | 'separator'> = [];
  if ('json' in result) {
    for (const e of JSON_EXPORTS)
      items.push({ label: e.title, onSelect: () => save(jsonExport(e.value, result.json, names)) });
  } else if ('markdown' in result) {
    const md = () => mdSummary(result.markdown, names);
    items.push(
      { label: 'Markdown summary (.md)', onSelect: () => save({ name: `${stem(names.after)}.changes.md`, content: md(), type: 'text/markdown' }) },
      {
        label: 'Copy summary as Markdown',
        onSelect: () =>
          void copyText(md()).then((ok) =>
            toast(ok ? { title: 'Summary copied', tone: 'success' } : { title: 'Couldn’t copy', description: 'Use the download instead.', tone: 'error' }),
          ),
      },
    );
  } else if (result.mode === 'openapi') {
    for (const e of OPENAPI_EXPORTS)
      items.push({
        label: e.label,
        onSelect: () => {
          if (e.kind === 'atom') { setFeedOpen(true); return; }
          const f = exportOpenApi(e.kind);
          if (f) save(f);
          else toast({ title: 'This export isn’t available yet', tone: 'info' });
        },
      });
    items.push({ label: 'Print report', onSelect: printReport });
  }
  if (!('json' in result) && !('markdown' in result) && result.mode !== 'openapi') {
    const patch = () => textPatch(result.text.rows, names);
    items.push(
      { label: 'Unified patch (.patch)', onSelect: () => save({ name: `${stem(names.before)}.patch`, content: patch(), type: 'text/x-diff' }) },
      {
        label: 'Copy patch',
        onSelect: () =>
          void copyText(patch()).then((ok) =>
            toast(ok ? { title: 'Patch copied', tone: 'success' } : { title: 'Couldn’t copy', description: 'Use the download instead.', tone: 'error' }),
          ),
      },
    );
  }
  items.push('separator', {
    label: 'Comparison file (.specdiff.json)',
    onSelect: () => save(comparisonFile({ before, after, result, settings, decisions, includeRules: true, includeDecisions: true, changeId: null })),
  });
  return (
    <>
      <Menu align="end" trigger={trigger} items={items} />
      {feedOpen && (
        <FeedDialog
          defaultTitle={`${after.name.replace(/\.[^.]+$/, '')} changelog`}
          onCancel={() => setFeedOpen(false)}
          onDone={(feed) => {
            setFeedOpen(false);
            const f = exportOpenApi('atom', feed);
            if (f) save(f);
          }}
        />
      )}
    </>
  );
}
