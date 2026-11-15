// O-11 Copy for LLM (OUT-12). Specdiff makes no AI calls: text goes to the clipboard, or to claude.ai only on click.
import type { Change } from '@specdiff/core';
import { Button, Menu, useToast } from '@specdiff/ui';
import * as icons from 'lucide-react';
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
const kb = (s: string) => `${(new Blob([s]).size / 1024).toFixed(1)} KB`;

export function CopyLlmMenu() {
  const { result, after } = useApp();
  const changeId = useNav((s) => s.changeId);
  const { toast } = useToast();
  if (!result || !('report' in result)) return null;
  const all = result.report.changes;
  const breaking = all.filter((c) => c.severity === 'breaking');
  const current = all.find((c) => c.id === changeId);
  const name = after?.name ?? 'the spec';
  const t = { breaking: llmText(breaking, `Breaking changes in ${name}`), all: llmText(all, `All changes in ${name}`), current: current ? llmText([current], `One change in ${name}`) : '' };
  const copy = (s: string) => navigator.clipboard.writeText(s).then(() => toast({ title: 'Copied for your LLM', description: 'You paste it where you choose. Specdiff doesn’t call any AI service.' }), () => toast({ title: 'Couldn’t copy', tone: 'error' }));
  return (
    <Menu align="end" trigger={<Button variant="secondary" icon={<icons.Copy size={15} />}>Copy for LLM</Button>} items={[
      { label: `Copy breaking changes for LLM · ${breaking.length} changes, ${kb(t.breaking)}`, onSelect: () => void copy(t.breaking), disabled: !breaking.length },
      { label: `Copy all changes for LLM · ${all.length} changes, ${kb(t.all)}`, onSelect: () => void copy(t.all) },
      { label: `Copy current change only${current ? ` · ${current.path}` : ''}`, onSelect: () => void copy(t.current), disabled: !current },
      'separator',
      { label: 'Open in Claude (breaking changes)', icon: <icons.ExternalLink size={14} />, onSelect: () => window.open(`https://claude.ai/new?q=${encodeURIComponent(`Explain these API changes and how to migrate:\n\n${t.breaking}`.slice(0, 6000))}`, '_blank', 'noopener,noreferrer') },
    ]} />
  );
}
