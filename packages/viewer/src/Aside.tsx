// Right column of an endpoint: Try it button, code samples (VW-06), response example, migration.
import { Button } from '@specdiff/ui';
import { Copy, Send } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useViewer } from './context';
import { mediaOf, opMarkdown } from './fields';
import { deref, type Json, type Op } from './model';
import { CodePanel, CopyButton, DarkTabs, cx } from './parts';
import { exampleFor, sample, type Lang, type SampleInput } from './samples';
import { TryIt } from './TryIt';
import css from './Viewer.module.css';

const LANGS: ReadonlyArray<{ value: Lang; label: string }> = [
  { value: 'curl', label: 'curl' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
];
const LANGS_PHONE: ReadonlyArray<{ value: Lang; label: string }> = LANGS.map((l) => (l.value === 'javascript' ? { ...l, label: 'JS' } : l));

const str = (v: unknown) => (v === undefined || v === null ? '' : typeof v === 'string' ? v : JSON.stringify(v));

/** Placeholder credentials for samples, from the operation's first security requirement. */
export function authPlaceholder(spec: Json, op: Op): Record<string, string> {
  const name = Object.keys(op.security[0] ?? {})[0];
  const s = name ? deref(spec, spec.components?.securitySchemes?.[name]) : undefined;
  if (!s) return {};
  if (s.type === 'apiKey' && s.in === 'header') return { [s.name]: '$API_KEY' };
  if (s.type === 'http' && s.scheme === 'basic') return { Authorization: 'Basic $CREDENTIALS' };
  if (s.type === 'http' || s.type === 'oauth2' || s.type === 'openIdConnect') return { Authorization: 'Bearer $API_TOKEN' };
  return {};
}

const hasExample = (spec: Json, schema: Json) => {
  const s = deref(spec, schema);
  return !!s && (s.example !== undefined || !!s.examples?.length || s.default !== undefined || !!s.enum?.length);
};

export function sampleInputFor(spec: Json, op: Op, server: string): SampleInput {
  const path: Record<string, string> = {};
  const query: Record<string, string> = {};
  const headers: Record<string, string> = { ...authPlaceholder(spec, op) };
  for (const p of op.params) {
    const ex = str(exampleFor(spec, p.schema));
    // A path value only from a real example; a type placeholder ("string") in a URL reads like a real id.
    if (p.in === 'path') { if (hasExample(spec, p.schema)) path[p.name] = ex; }
    else if (p.in === 'query' && p.required) query[p.name] = ex;
    else if (p.in === 'header' && p.required) headers[p.name] = ex;
  }
  const media = op.requestBody && mediaOf(op.requestBody.content);
  const bodyValue = media ? (media[1].example ?? exampleFor(spec, media[1].schema)) : undefined;
  return { op, server, path, query, headers, ...(bodyValue !== undefined && bodyValue !== null ? { body: JSON.stringify(bodyValue) } : {}) };
}

export function CodeSamples({ op }: { op: Op }) {
  const v = useViewer();
  const [lang, setLang] = useState<Lang>('curl');
  const input = useMemo(() => sampleInputFor(v.cur.spec, op, v.cur.model.servers[0]?.url ?? ''), [v.cur, op]);
  const code = sample(lang, input);
  return (
    <section className={css.codePanel} aria-label="Code samples">
      <DarkTabs label="Code sample language" tabs={v.isPhone ? LANGS_PHONE : LANGS} value={lang} onChange={setLang} trailing={<CopyButton text={code} label={`Copy ${lang} sample`} />}>
        {/* Long lines wrap (Java's .uri(…), a long URL) instead of being cut at the panel edge. */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
        <pre className={cx(css.pre, css.preWrap)} tabIndex={0}><code>{code}</code></pre>
      </DarkTabs>
    </section>
  );
}

export function responseExample(spec: Json, op: Op): { status: string; json: string } | undefined {
  const r = op.responses.find((x) => x.status.startsWith('2')) ?? op.responses[0];
  if (!r) return undefined;
  const media = mediaOf(r.content);
  if (!media) return undefined;
  const ex = media[1].example ?? exampleFor(spec, media[1].schema);
  return ex === undefined || ex === null ? undefined : { status: r.status, json: JSON.stringify(ex, null, 2) };
}

export function EndpointAside({ op }: { op: Op }) {
  const v = useViewer();
  const [open, setOpen] = useState(false);
  const ex = responseExample(v.cur.spec, op);
  const raw = deref(v.cur.spec, v.cur.spec.paths?.[op.path])?.[op.method] ?? {};
  const replacement = raw['x-replacement'] as string | undefined;
  if (open && v.tryItEnabled) return <TryIt op={op} onClose={() => setOpen(false)} />;
  const llm = () => v.copyMarkdown(opMarkdown(v.cur.spec, v.cur.model, op, v.index.opChanges.get(op.key) ?? []));
  return (
    <div className={css.aside}>
      {op.deprecated && (replacement || op.description) ? (
        <>
          <section className={css.card} aria-labelledby="sd-migrate">
            <h2 id="sd-migrate" className={css.h4}>Migrate to the replacement</h2>
            <p className={css.muted}>{op.description ?? `Use ${replacement} instead.`}</p>
          </section>
          {replacement ? (
            <CodePanel title="Migration" code={`# before\n${op.method.toUpperCase()} ${op.path}\n\n# after\n${replacement}`} />
          ) : null}
        </>
      ) : (
        <>
          <div className={css.row}>
            {v.tryItEnabled ? <Button variant="brand" icon={<Send />} onClick={() => setOpen(true)}>Try it</Button> : null}
            <Button icon={<Copy />} onClick={llm}>Copy for LLM</Button>
          </div>
          <CodeSamples op={op} />
          {ex ? <CodePanel title={`${ex.status} · Response example`} code={ex.json} /> : null}
        </>
      )}
    </div>
  );
}
