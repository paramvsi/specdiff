// O-04 Explain this change (OA-07, OUT-12): who it breaks, what they'll see, how to avoid it.
import { Button, Drawer, MethodChip, SeverityBadge, useToast } from '@specdiff/ui';
import * as icons from 'lucide-react';
import { useApp } from '../../state/store';
import { useExplain } from './explainStore';
import { Title } from './Summary';
import { copy, headlineText, methodOf, needsDecision, ruleOf } from './util';
import css from './Explain.module.css';

export function Explain() {
  const { id, close } = useExplain();
  const { result, decide, decisions } = useApp();
  const { toast } = useToast();
  const c = id && result && 'report' in result ? result.report.changes.find((x) => x.id === id) : undefined;
  if (!c) return null;
  const rule = ruleOf(c.ruleId);
  const what = c.before !== undefined || c.after !== undefined ? `Before: ${fmt(c.before)}. After: ${fmt(c.after)}.` : headlineText(c) + '.';
  const llm = [`Change in an OpenAPI spec (${c.severity}): ${headlineText(c)}`, `Where: ${c.path} (${c.jsonPath ?? ''})`, what, c.explanation && `Who it breaks: ${c.explanation.who}`, c.explanation && `What they will see: ${c.explanation.see}`, c.explanation && `How to avoid it: ${c.explanation.avoid}`, `Rule: ${c.ruleId}`].filter(Boolean).join('\n');
  const accepted = decisions.decisions[c.fingerprint]?.decision === 'accepted';
  return (
    <Drawer open title={headlineText(c)} onOpenChange={(o) => { if (!o) close(); }} side="right">
      <div className={css.body}>
        <div className={css.meta}>{methodOf(c) && <MethodChip method={methodOf(c)!} />}<code>{c.operation?.path ?? c.sourceBlock}</code><SeverityBadge severity={c.severity ?? 'docs'} /></div>
        <h2 className={css.title}><Title c={c} /></h2>
        <section><h3 className={css.h3}>What changed</h3><p>{what}</p></section>
        {c.explanation && <>
          <section><h3 className={css.h3}>Who it breaks</h3><ul className={css.who}><li>{c.explanation.who}</li>{c.sharedSchema && <li>Every client of the {c.sharedSchema.usageCount} endpoint{c.sharedSchema.usageCount === 1 ? '' : 's'} that use {c.sharedSchema.name}: {c.sharedSchema.usages.join(', ')}</li>}</ul></section>
          <section><h3 className={css.h3}>What they’ll see</h3><p>{c.explanation.see}</p></section>
          <section><h3 className={css.h3}>How to avoid it</h3><p>{c.explanation.avoid}</p></section>
        </>}
        <section className={css.ruleRow}><div><h3 className={css.h3}>Rule</h3><code>{c.ruleId}</code>{rule && <p className={css.muted}>{rule.title} · default {rule.severity ?? 'reported elsewhere'} · {rule.direction}</p>}</div><a className={css.link} href={`/rules/${c.ruleId}/`}>Read the rule</a></section>
      </div>
      <footer className={css.foot}>
        <Button variant="secondary" icon={<icons.Copy size={15} />} onClick={() => { void copy(llm); toast({ title: 'Copied for your LLM', description: 'Specdiff makes no AI calls. Paste it where you like.' }); }}>Copy for LLM</Button>
        {c.changelogLine && <Button variant="secondary" onClick={() => { void copy(c.changelogLine!); toast({ title: 'Changelog line copied' }); }}>Copy changelog line</Button>}
        {needsDecision(c) && <Button variant="inverse" icon={<icons.Check size={15} />} aria-pressed={accepted} onClick={() => { decide(c.fingerprint, accepted ? null : { decision: 'accepted', path: c.path, ...(c.ruleId ? { ruleId: c.ruleId } : {}) }); }}>{accepted ? 'Accepted' : 'Accept'}</Button>}
      </footer>
    </Drawer>
  );
}
const fmt = (v: unknown) => (v === undefined ? 'absent' : typeof v === 'string' ? v : JSON.stringify(v));
