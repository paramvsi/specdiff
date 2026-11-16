// O-11 Copy for LLM (OUT-12). Specdiff makes no AI calls: text goes to the clipboard, or to claude.ai only on click.
// A small menu of its own (not the shared Menu) because each item has a title and a detail line, and the menu
// ends with the privacy note, as designed.
import type { Change } from '@specdiff/core';
import { Button, useToast } from '@specdiff/ui';
import * as icons from 'lucide-react';
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { useNav } from './nav';
import { useApp } from '../state/store';

export function llmText(changes: Change[], title: string): string {
  const lines = [`${title}. ${changes.length} change${changes.length === 1 ? '' : 's'} between two versions of an OpenAPI spec, from Specdiff.`, ''];
  for (const c of changes) {
    lines.push(`- [${c.severity}] ${c.path}`, `  rule: ${c.ruleId}`, `  where: ${c.jsonPath ?? ''}`);
    if (c.before !== undefined) lines.push(`  before: ${JSON.stringify(c.before)}`);
    if (c.after !== undefined) lines.push(`  after: ${JSON.stringify(c.after)}`);
    if (c.explanation) lines.push(`  who it breaks: ${c.explanation.who}`, `  what they see: ${c.explanation.see}`, `  how to avoid: ${c.explanation.avoid}`);
  }
  return lines.join('\n') + '\n';
}
/** Open in Claude: the prompt, cut at 6000 characters by code point (a split emoji would make encodeURIComponent throw). */
export const claudeUrl = (text: string) =>
  `https://claude.ai/new?q=${encodeURIComponent([...`Explain these API changes and how to migrate:\n\n${text}`].slice(0, 6000).join(''))}`;

export const kb = (s: string) => `${(new Blob([s]).size / 1024).toFixed(1)} KB`;
const n = (k: number) => `${k} change${k === 1 ? '' : 's'}`;

/** "POST /v1/payments · currency": the operation and the changed thing. */
export function changeDetail(c: Change): string {
  const segs = c.path.split(' › ');
  const last = segs.length > 1 ? segs.at(-1)!.replace(/^(query|header|path|cookie|response) /, '') : '';
  const where = c.operation ? `${c.operation.method.toUpperCase()} ${c.operation.path}` : segs[0]!;
  return last ? `${where} · ${last}` : where;
}

interface Item { title: string; detail: string; icon: ReactNode; disabled?: boolean; onSelect: () => void }

const S: Record<string, CSSProperties> = {
  wrap: { position: 'relative', display: 'inline-block' },
  menu: { position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 60, width: 372, padding: 6, background: 'var(--sd-surface)', color: 'var(--sd-ink)', border: '1px solid var(--sd-line)', borderRadius: 'var(--sd-radius-md)', boxShadow: 'var(--sd-shadow-popover)', fontFamily: 'var(--sd-font-sans)' },
  item: { display: 'flex', width: '100%', gap: 12, alignItems: 'flex-start', padding: '10px 12px', border: 0, borderRadius: 'var(--sd-radius-sm)', background: 'none', color: 'inherit', textAlign: 'left', font: 'inherit', cursor: 'pointer' },
  icon: { display: 'inline-flex', marginTop: 2, flex: 'none' },
  title: { display: 'block', fontSize: 14.5, fontWeight: 600 },
  detail: { display: 'block', marginTop: 2, fontSize: 12.5, color: 'var(--sd-muted)' },
  note: { margin: '6px 6px 0', padding: '10px 12px', borderRadius: 'var(--sd-radius-sm)', background: 'var(--sd-possibly-bg)', color: 'var(--sd-ink)', fontSize: 12.5, lineHeight: 1.5 },
};

export function CopyLlmMenu() {
  const { result, after } = useApp();
  const changeId = useNav((s) => s.changeId);
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrap = useRef<HTMLDivElement>(null);
  const id = useId();
  const triggerId = `${id}-trigger`;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);
  useEffect(() => { if (open && active >= 0) document.getElementById(`${id}-${active}`)?.focus(); }, [open, active, id]);

  if (!result || !('report' in result)) return null;
  const all = result.report.changes;
  const breaking = all.filter((c) => c.severity === 'breaking');
  const current = all.find((c) => c.id === changeId);
  const name = after?.name ?? 'the spec';
  const t = { breaking: llmText(breaking, `Breaking changes in ${name}`), all: llmText(all, `All changes in ${name}`), current: current ? llmText([current], `One change in ${name}`) : '' };
  const close = () => { setOpen(false); document.getElementById(triggerId)?.focus(); };
  const copy = (s: string) => {
    close();
    void navigator.clipboard.writeText(s).then(() => toast({ title: 'Copied for your LLM', description: 'You paste it where you choose. Specdiff doesn’t call any AI service.' }), () => toast({ title: 'Couldn’t copy', tone: 'error' }));
  };
  const list: Item[] = [
    { title: 'Copy breaking changes for LLM', detail: `${n(breaking.length)} with paths, before, after and rule. ${kb(t.breaking)}.`, icon: <icons.Copy size={15} />, disabled: !breaking.length, onSelect: () => copy(t.breaking) },
    { title: 'Copy all changes for LLM', detail: `${n(all.length)}. ${kb(t.all)}.`, icon: <icons.Copy size={15} />, onSelect: () => copy(t.all) },
    { title: 'Copy current change only', detail: current ? changeDetail(current) : 'Open a change in the Workspace first.', icon: <icons.Layers size={15} />, disabled: !current, onSelect: () => copy(t.current) },
    { title: 'Open in Claude', detail: 'Starts a chat on claude.ai with the breaking changes. Only when you click.', icon: <icons.ExternalLink size={15} />, disabled: !breaking.length, onSelect: () => { close(); window.open(claudeUrl(t.breaking), '_blank', 'noopener,noreferrer'); } },
  ];
  const enabled = list.map((x, i) => (x.disabled ? -1 : i)).filter((i) => i >= 0);
  const move = (d: number) => {
    const at = enabled.indexOf(active);
    setActive(enabled[(at + d + enabled.length) % enabled.length] ?? -1);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(enabled[0] ?? -1); }
    else if (e.key === 'End') { e.preventDefault(); setActive(enabled.at(-1) ?? -1); }
    else if (e.key === 'Escape' || e.key === 'Tab') { if (e.key === 'Escape') e.preventDefault(); close(); }
  };

  return (
    <div ref={wrap} style={S.wrap}>
      <Button id={triggerId} variant="secondary" icon={<icons.Copy size={15} />} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
        onClick={() => { setOpen(!open); setActive(enabled[0] ?? -1); }}
        onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(enabled[0] ?? -1); } }}>
        Copy for LLM
      </Button>
      {open && (
        <div style={S.menu}>
          <div id={id} role="menu" aria-label="Copy for LLM" tabIndex={-1} onKeyDown={onKey}>
            {list.map((x, i) => (
              <button key={x.title} id={`${id}-${i}`} type="button" role="menuitem" tabIndex={i === active ? 0 : -1}
                aria-disabled={x.disabled || undefined} onMouseEnter={() => !x.disabled && setActive(i)}
                style={{ ...S.item, ...(i === active ? { background: 'var(--sd-raised)' } : {}), ...(x.disabled ? { cursor: 'not-allowed' } : {}) }}
                onClick={() => { if (!x.disabled) x.onSelect(); }}>
                <span style={{ ...S.icon, ...(x.disabled ? { color: 'var(--sd-muted)' } : {}) }} aria-hidden="true">{x.icon}</span>
                <span>
                  <span style={{ ...S.title, ...(x.disabled ? { color: 'var(--sd-muted)' } : {}) }}>{x.title}</span>
                  <span style={S.detail}>{x.detail}</span>
                </span>
              </button>
            ))}
          </div>
          <p style={S.note}>You paste it where you choose. Specdiff doesn’t call any AI service.</p>
        </div>
      )}
    </div>
  );
}
