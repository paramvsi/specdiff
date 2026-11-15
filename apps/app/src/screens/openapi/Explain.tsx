// O-04 Explain this change (OA-07, OUT-12): what changed, who it breaks, what they'll see, how to avoid it.
import type { Change } from '@specdiff/core';
import { Button, Drawer, MethodChip, SeverityBadge, useToast } from '@specdiff/ui';
import * as icons from 'lucide-react';
import { useApp } from '../../state/store';
import { useExplain } from './explainStore';
import { fixOptions } from './fixes';
import { Md, Segs, useSpecContext } from './Title';
import { changeTitle, codeSegments, fixChangelogLine, segText, valueText, type Seg } from './titles';
import { copy, methodOf, needsDecision } from './util';
import css from './Explain.module.css';

/** One or two sentences on what moved in the spec, by rule family. */
export function whatChanged(c: Change): Seg[] {
  const name = c.path.split(' › ').at(-1)!.replace(/^(query|header|path|cookie) /, '');
  const id = c.ruleId ?? '';
  if (id === 'request-property-became-required') return codeSegments(`\`${name}\` moved into the request body’s \`required\` list. Before, a request without it was accepted.`);
  if (id === 'request-param-became-required') return codeSegments(`\`${name}\` is now \`required: true\`. Before, a request without it was accepted.`);
  if (id === 'endpoint-removed') return codeSegments(`\`${c.operation?.method.toUpperCase()} ${c.operation?.path}\` is gone from the new spec. It was never marked \`deprecated\`.`);
  if (id === 'response-property-removed') return codeSegments(`\`${name}\` is no longer in the response schema${c.sharedSchema ? ` \`${c.sharedSchema.name}\`` : ''}.`);
  if (c.before !== undefined || c.after !== undefined) {
    const v = (x: unknown) => (x === undefined ? 'absent' : `\`${valueText(x)}\``);
    return codeSegments(`Before: ${stop(v(c.before))} After: ${stop(v(c.after))}`);
  }
  return [];
}

/** Who it breaks: the rule's audience, the shared schema's endpoints, and who replays old traffic. */
function whoBreaks(c: Change): Seg[][] {
  const out: Seg[][] = [];
  if (c.explanation) out.push(codeSegments(c.explanation.who));
  if (c.sharedSchema) out.push(codeSegments(`Clients of the ${c.sharedSchema.usageCount} endpoint${c.sharedSchema.usageCount === 1 ? '' : 's'} that use \`${c.sharedSchema.name}\`: ${c.sharedSchema.usages.join(', ')}`));
  if (needsDecision(c)) {
    out.push(codeSegments('SDKs generated from the old spec'));
    if (c.direction === 'request' || c.direction === 'both') out.push(codeSegments('Jobs that replay stored requests'));
  }
  return out;
}

export function Explain() {
  const { id, close } = useExplain();
  const { result, decide, decisions } = useApp();
  const { toast } = useToast();
  const { ctx, spec } = useSpecContext();
  const c = id && result && 'report' in result ? result.report.changes.find((x) => x.id === id) : undefined;
  if (!c || !result || !('report' in result)) return null;
  const title = changeTitle(c, ctx);
  const what = whatChanged(c);
  const options = needsDecision(c) ? fixOptions(c, spec, result.report.versionCheck?.bump === 'major' ? result.report.versionCheck.suggested : undefined) : [];
  const line = c.changelogLine ? fixChangelogLine(c.changelogLine, c, spec) : undefined;
  const llm = [`Change in an OpenAPI spec (${c.severity}): ${segText(title)}`, `Where: ${c.path} (${c.jsonPath ?? ''})`, segText(what), c.explanation && `Who it breaks: ${c.explanation.who}`, c.explanation && `What they will see: ${c.explanation.see}`, c.explanation && `How to avoid it: ${c.explanation.avoid}`, ...options.map((o, i) => `Option ${i + 1} (${o.title}):\n${o.code}`), `Rule: ${c.ruleId}`].filter(Boolean).join('\n');
  const accepted = decisions.decisions[c.fingerprint]?.decision === 'accepted';
  return (
    <Drawer open title={segText(title)} eyebrow={<span className={css.meta}>{methodOf(c) && <MethodChip method={methodOf(c)!} />}<code>{c.operation?.path ?? c.sourceBlock}</code><SeverityBadge severity={c.severity ?? 'docs'} /></span>} onOpenChange={(o) => { if (!o) close(); }} side="right" className={css.drawer}>
      <div className={css.wrap}>
        <div className={css.body}>
          {what.length > 0 && <section><h3 className={css.h3}>What changed</h3><p><Segs segs={what} codeClass={css.code} /></p></section>}
          {c.explanation && <>
            <section><h3 className={css.h3}>Who it breaks</h3><ul className={css.who}>{whoBreaks(c).map((s, i) => <li key={i}><Segs segs={s} codeClass={css.code} /></li>)}</ul></section>
            <section><h3 className={css.h3}>What they’ll see</h3><p><TheySee c={c} /></p></section>
            <section>
              <h3 className={css.h3}>How to avoid it</h3>
              {/* With fix options the options are the advice; the one-line summary is for changes without them. */}
              {!options.length && <p><Md text={c.explanation.avoid} codeClass={css.code} /></p>}
              {options.length > 0 && <>
                <p className={css.pick}>Pick one, then re-run the comparison:</p>
                {options.map((o, i) => <pre key={o.title} className={css.option}><code><span className={css.comment}># Option {i + 1} · {o.title}</span>{'\n'}<Marked text={o.code} mark={o.mark ?? []} /></code></pre>)}
              </>}
            </section>
          </>}
          <section className={css.ruleRow}><div><h3 className={css.h3}>Rule</h3><code>{c.ruleId}</code></div><a className={css.link} href={`/rules/${c.ruleId}/`}>Read the rule</a></section>
        </div>
        <footer className={css.foot}>
          <Button variant="secondary" icon={<icons.Copy size={15} />} onClick={() => { void copy(llm); toast({ title: 'Copied for your LLM', description: 'You paste it where you choose. Specdiff doesn’t call any AI service.' }); }}>Copy for LLM</Button>
          {line && <Button variant="secondary" onClick={() => { void copy(line); toast({ title: 'Changelog line copied' }); }}>Copy changelog line</Button>}
          {needsDecision(c) && <Button variant="inverse" icon={<icons.Check size={15} />} aria-pressed={accepted} onClick={() => { decide(c.fingerprint, accepted ? null : { decision: 'accepted', path: c.path, ...(c.ruleId ? { ruleId: c.ruleId } : {}) }); }}>{accepted ? 'Accepted' : 'Accept'}</Button>}
        </footer>
      </div>
    </Drawer>
  );
}

/** "400 Bad Request with `missing required property: currency`, on the first call after you deploy." */
function TheySee({ c }: { c: Change }) {
  const see = c.explanation?.see ?? '';
  const m = /^(\d{3} [A-Z][A-Za-z ]+?)\.?$/.exec(see.trim());
  const id = c.ruleId ?? '';
  const name = c.path.split(' › ').at(-1)!.replace(/^(query|header|path|cookie) /, '');
  const body = id === 'request-property-became-required' || id === 'request-property-added-required' || id === 'request-param-became-required' || id === 'request-param-added-required'
    ? `missing required property: ${name}`
    : null;
  if (!m || !body) return <Md text={see} codeClass={css.code} />;
  return <><strong>{m[1]}</strong> with <code className={css.plainMono}>{body}</code>, on the first call after you deploy.</>;
}

/** Code with the fix parts highlighted (O-04 options). */
function Marked({ text, mark }: { text: string; mark: string[] }) {
  const parts: Array<{ t: string; on: boolean }> = [];
  let rest = text;
  for (;;) {
    const hits = mark.map((m) => ({ m, i: m ? rest.indexOf(m) : -1 })).filter((h) => h.i >= 0).sort((a, b) => a.i - b.i);
    const h = hits[0];
    if (!h) { parts.push({ t: rest, on: false }); break; }
    parts.push({ t: rest.slice(0, h.i), on: false }, { t: h.m, on: true });
    rest = rest.slice(h.i + h.m.length);
  }
  return <>{parts.map((p, i) => (p.on ? <mark key={i} className={css.mark}>{p.t}</mark> : p.t))}</>;
}

/** End a sentence with one full stop (descriptions often end with their own). */
// A value in backticks that ends with its own full stop ("`…saved cards.`") counts as ended too.
const stop = (t: string) => (/[.!?]`?$/.test(t.trim()) ? t.trim() : `${t.trim()}.`);
