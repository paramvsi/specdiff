// Try it (VW-05): request form and JSON, server select, auth, send from the browser, response
// viewer with a schema check; fails-on-newer warning (VW-11, Beta); CORS guidance (VW-13).
import { BetaLabel, Button, SegmentedControl, TextField } from '@specdiff/ui';
import { Check, Copy, KeyRound, RefreshCw, Send, TriangleAlert, X } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { sampleInputFor } from './Aside';
import { AuthDialog } from './AuthDialog';
import { useViewer, type Loaded } from './context';
import { fieldsOf, mediaOf, type Field } from './fields';
import { copyText } from './hooks';
import { deref, typeLabel, type Json, type Op } from './model';
import { DarkTabs, Method, cx } from './parts';
import { buildUrl, sample } from './samples';
import {
  AUTH_LABEL, BlockedError, applyAuth, applyFix, checkSchema, isAuthSet, newerOnlyIssues, proxied, requestIssues, send, toSampleInput,
  type Draft, type Issue, type SendResult,
} from './request';
import css from './Viewer.module.css';

const PRIMITIVE = new Set(['string', 'integer', 'number', 'boolean']);
const uuid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`);

function initialDraft(spec: Json, op: Op, server: string): Draft {
  const s = sampleInputFor(spec, op, server);
  const headers: Record<string, string> = {};
  for (const p of op.params) if (p.in === 'header') headers[p.name] = /idempotency/i.test(p.name) ? uuid() : s.headers[p.name] ?? '';
  const query: Record<string, string> = {};
  for (const p of op.params) if (p.in === 'query') query[p.name] = s.query[p.name] ?? '';
  const body = s.body ? JSON.stringify(JSON.parse(s.body), null, 2) : undefined;
  return { server, path: s.path, query, headers, ...(body ? { body } : {}) };
}

function readBody(body: string | undefined): Record<string, unknown> | undefined {
  try {
    const v = JSON.parse(body || '{}') as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function coerce(spec: Json, f: Field, text: string): unknown {
  const t = typeLabel(spec, f.schema);
  if (/^(integer|number)/.test(t) && text.trim() !== '' && !Number.isNaN(Number(text))) return Number(text);
  if (t.startsWith('boolean')) return text === 'true' ? true : text === 'false' ? false : text;
  return text;
}

type Phase = { kind: 'idle' } | { kind: 'sending' } | { kind: 'result'; result: SendResult; url: string; draft: Draft } | { kind: 'blocked'; host: string; draft: Draft } | { kind: 'warning'; issues: Issue[]; older: Loaded; newer: Loaded };

export function TryIt({ op, onClose }: { op: Op; onClose: () => void }) {
  const v = useViewer();
  const { spec, model } = v.cur;
  const servers = model.servers.length ? model.servers : [{ url: typeof location !== 'undefined' ? location.origin : '' }];
  const [draft, setDraft] = useState<Draft>(() => initialDraft(spec, op, servers[0]!.url));
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [authOpen, setAuthOpen] = useState(false);
  const id = useId();
  const media = op.requestBody && mediaOf(op.requestBody.content);
  const bodyFields = useMemo(() => (media ? fieldsOf(spec, media[1].schema) : []), [spec, media]);
  const formFields = bodyFields.filter((f) => PRIMITIVE.has(String(deref(spec, f.schema)?.type ?? (deref(spec, f.schema)?.enum ? 'string' : ''))));
  const body = readBody(draft.body);
  const warning = phase.kind === 'warning' ? phase : undefined;
  const fieldError = (where: Issue['where'], name: string) => {
    const i = warning?.issues.find((x) => x.where === where && x.name === name);
    if (!i) return undefined;
    return /is required$/.test(i.message) ? `Required since ${warning!.newer.label}` : i.message;
  };

  // The newer and older loaded versions, for the fails-on-newer check (VW-11).
  const pair = useMemo(() => {
    if (!v.prev) return undefined;
    const iCur = v.loaded.findIndex((l) => l.label === v.cur.label);
    const iPrev = v.loaded.findIndex((l) => l.label === v.prev!.label);
    const [older, newer] = iPrev < iCur ? [v.prev, v.cur] : [v.cur, v.prev];
    const olderOp = older.model.ops.find((o) => o.key === op.key);
    const newerOp = newer.model.ops.find((o) => o.key === op.key);
    return olderOp && newerOp ? { older, newer, olderOp, newerOp } : undefined;
  }, [v.prev, v.cur, v.loaded, op.key]);

  const doSend = async (d: Draft) => {
    setPhase({ kind: 'sending' });
    const final = applyAuth(v.auth, d);
    const url = buildUrl(toSampleInput(op, final));
    try {
      const result = await send(proxied(url, v.corsProxy), op.method, final.headers, op.requestBody ? final.body : undefined);
      setPhase({ kind: 'result', result, url, draft: final });
    } catch (e) {
      if (e instanceof BlockedError) setPhase({ kind: 'blocked', host: e.host, draft: final });
      else setPhase({ kind: 'idle' });
    }
  };

  const onSend = () => {
    if (pair) {
      const final = applyAuth(v.auth, draft);
      const newer = requestIssues(pair.newer.spec, pair.newerOp, final);
      const older = requestIssues(pair.older.spec, pair.olderOp, final);
      const only = newerOnlyIssues(newer, older);
      if (only.length) { setPhase({ kind: 'warning', issues: only, older: pair.older, newer: pair.newer }); return; }
    }
    void doSend(draft);
  };

  const setBag = (bag: 'path' | 'query' | 'headers', name: string, value: string) => setDraft((d) => ({ ...d, [bag]: { ...d[bag], [name]: value } }));
  const setBodyField = (f: Field, text: string) => setDraft((d) => {
    const obj = { ...(readBody(d.body) ?? {}) };
    if (text === '') delete obj[f.name];
    else obj[f.name] = coerce(spec, f, text);
    return { ...d, body: JSON.stringify(obj, null, 2) };
  });

  const paramInput = (bag: 'path' | 'query' | 'headers', where: Issue['where'], name: string, description?: string) => (
    <TextField
      key={`${where}:${name}`}
      label={name}
      mono
      value={draft[bag][name] ?? ''}
      onChange={(e) => setBag(bag, name, e.target.value)}
      hint={/idempotency/i.test(name) && where === 'header' ? 'Generated for you' : description && description.length < 60 ? description : undefined}
      error={fieldError(where, name)}
    />
  );

  const otherServer = servers.find((s) => s.url !== draft.server);
  const authSet = isAuthSet(v.auth);

  return (
    <div className={css.aside}>
      <section className={cx(css.card, css.tryCard)} aria-label="Try it">
        <div className={css.tryHead}>
          <Method method={op.method} />
          <span className={css.opHeaderPath}>{op.path}</span>
          <Button variant="secondary" iconOnly icon={<X />} aria-label="Close Try it" onClick={onClose} className={css.pushRight} />
        </div>
        <div className={css.formField}>
          <label htmlFor={`${id}-server`} className={css.formLabel}>Server</label>
          <select id={`${id}-server`} className={css.select} value={draft.server} onChange={(e) => setDraft((d) => ({ ...d, server: e.target.value }))}>
            {servers.map((s) => <option key={s.url} value={s.url}>{s.url}</option>)}
          </select>
        </div>
        <div className={cx(css.authLine, authSet && css.authLineSet)}>
          <KeyRound aria-hidden="true" size={14} />
          <span>{authSet ? `${AUTH_LABEL[v.auth!.kind]} set · ${v.remembered ? 'remembered in this browser' : 'kept in this tab only'}` : 'No credentials set'}</span>
          <button type="button" className={css.linkButton} onClick={() => setAuthOpen(true)}>{authSet ? 'Change' : 'Add'}</button>
        </div>
        {media ? <SegmentedControl label="Request editor" options={[{ value: 'form', label: 'Form' }, { value: 'json', label: 'JSON' }]} value={mode} onValueChange={setMode} /> : null}
        <div className={css.formStack}>
          {op.params.filter((p) => p.in === 'path').map((p) => paramInput('path', 'path', p.name, p.description))}
          {op.params.filter((p) => p.in === 'query').map((p) => paramInput('query', 'query', p.name, p.description))}
          {media && mode === 'form'
            ? formFields.map((f) => (
              <TextField
                key={`body:${f.name}`}
                label={f.name}
                mono
                value={body?.[f.name] === undefined ? '' : String(body[f.name])}
                onChange={(e) => setBodyField(f, e.target.value)}
                error={fieldError('body', f.name)}
              />
            ))
            : null}
          {media && mode === 'form' && formFields.length < bodyFields.length ? <p className={css.small}>Nested fields: switch to JSON to edit them.</p> : null}
          {media && mode === 'json' ? (
            <div className={css.formField}>
              <label htmlFor={`${id}-json`} className={css.formLabel}>Request body</label>
              <textarea id={`${id}-json`} className={css.textarea} rows={10} spellCheck={false} value={draft.body ?? ''} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} />
              {body === undefined && draft.body ? <span className={css.errorSmall}><span aria-hidden="true">! </span>Not valid JSON</span> : null}
            </div>
          ) : null}
          {op.params.filter((p) => p.in === 'header').map((p) => paramInput('headers', 'header', p.name, p.description))}
        </div>
        {warning ? (
          <div className={css.warnBox} role="alert">
            <TriangleAlert aria-hidden="true" size={14} className={css.warnIcon} />
            <div>
              <p className={css.noMargin}><strong>This request works on {warning.older.label} but fails on {warning.newer.label}</strong> <BetaLabel /></p>
              <p className={css.noMargin}>
                {warning.issues.map((i, n) => (
                  <span key={`${i.where}:${i.name}`}>{n ? ' ' : ''}{warning.newer.label} {/is required$/.test(i.message) ? <>requires <code className={css.code}>{i.name}</code></> : <>says: {i.message}</>}.</span>
                ))}{' '}
                {warning.issues.some((i) => i.fix) ? 'Fix it now so your integration keeps working after you upgrade.' : ''}
              </p>
              <div className={css.row}>
                {warning.issues.filter((i) => i.fix).slice(0, 1).map((i) => (
                  <Button key="fix" variant="inverse" onClick={() => { setDraft((d) => warning.issues.filter((x) => x.fix).reduce(applyFix, d)); setPhase({ kind: 'idle' }); }}>
                    {warning.issues.filter((x) => x.fix).length > 1 ? 'Fix all' : i.fix!.label}
                  </Button>
                ))}
                <Button onClick={() => void doSend(draft)}>Send to {warning.older.label} anyway</Button>
              </div>
            </div>
          </div>
        ) : null}
        <div className={css.row}>
          <Button variant="brand" icon={<Send />} onClick={onSend} disabled={phase.kind === 'sending'}>{phase.kind === 'sending' ? 'Sending…' : 'Send request'}</Button>
          <Button onClick={() => { setDraft(initialDraft(spec, op, draft.server)); setPhase({ kind: 'idle' }); }}>Reset</Button>
        </div>
      </section>

      {phase.kind === 'result' ? <ResponseView op={op} result={phase.result} url={phase.url} draft={phase.draft} /> : null}
      {phase.kind === 'blocked' ? (
        <section className={css.card} role="alert" aria-labelledby={`${id}-cors`}>
          <h2 id={`${id}-cors`} className={cx(css.h4, css.iconHead)}><TriangleAlert aria-hidden="true" size={16} className={css.warnIcon} /> The browser blocked this request</h2>
          <p className={css.small}>
            <code className={css.code}>{phase.host}</code> didn’t send an <code className={css.code}>Access-Control-Allow-Origin</code> header for this page, so the browser stopped it before it left. Your API may be fine; it just doesn’t allow calls from this origin.
          </p>
          <ol className={css.steps}>
            {otherServer ? <li>{/sandbox/i.test(`${otherServer.description ?? ''}${otherServer.url}`) ? 'Use the sandbox server' : 'Use the other server'} if it allows browser calls.</li> : null}
            <li>Add this origin to your API’s CORS settings: <code className={css.code}>{typeof location !== 'undefined' ? location.origin : ''}</code></li>
            <li>Or set a CORS proxy you trust below. Specdiff doesn’t run one.</li>
          </ol>
          <TextField label="CORS proxy URL" mono placeholder="https://proxy.example.com/?url={url}" value={v.corsProxy} onChange={(e) => v.setCorsProxy(e.target.value)} hint="Requests go to this URL with the target appended, or put {url} where it goes." />
          <div className={css.row}>
            <Button icon={<Copy />} onClick={() => void copyText(sample('curl', toSampleInput(op, phase.draft))).then((ok) => v.notify(ok ? 'Copied as curl' : 'Could not copy'))}>Copy as curl</Button>
            {otherServer ? <Button onClick={() => { setDraft((d) => ({ ...d, server: otherServer.url })); setPhase({ kind: 'idle' }); }}>{/sandbox/i.test(`${otherServer.description ?? ''}${otherServer.url}`) ? 'Switch to sandbox' : 'Switch server'}</Button> : null}
            {v.corsProxy ? <Button icon={<RefreshCw />} onClick={() => void doSend(draft)}>Retry with proxy</Button> : null}
          </div>
        </section>
      ) : null}
      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} op={op} />
    </div>
  );
}

function ResponseView({ op, result, url, draft }: { op: Op; result: SendResult; url: string; draft: Draft }) {
  const v = useViewer();
  const [tab, setTab] = useState<'body' | 'headers' | 'request'>('body');
  const ok = result.status >= 200 && result.status < 300;
  const resp = op.responses.find((r) => r.status === String(result.status)) ?? op.responses.find((r) => r.status === `${String(result.status)[0]}XX`) ?? op.responses.find((r) => r.status === 'default');
  const media = resp ? mediaOf(resp.content) : undefined;
  const issues = media?.[1].schema && result.json !== undefined ? checkSchema(v.cur.spec, media[1].schema, result.json) : undefined;
  const bodyText = result.json !== undefined ? JSON.stringify(result.json, null, 2) : result.text;
  const masked = Object.entries(draft.headers).map(([k, val]) => `${k}: ${/^authorization$/i.test(k) || /key|token|secret/i.test(k) ? '••••••' : val}`);
  const content = tab === 'body' ? bodyText || '(empty body)' : tab === 'headers' ? result.headers.map(([k, val]) => `${k}: ${val}`).join('\n') : [`${op.method.toUpperCase()} ${url}`, ...masked, ...(draft.body && op.requestBody ? ['', draft.body] : [])].join('\n');
  return (
    <section className={css.codePanel} aria-label="Response">
      <DarkTabs
        label="Response view"
        tabs={[{ value: 'body', label: 'Body' }, { value: 'headers', label: 'Headers' }, { value: 'request', label: 'Request' }]}
        value={tab}
        onChange={setTab}
        extra={
          <span className={css.respMeta} role="status">
            <span className={cx(css.respStatus, ok ? css.respOk : css.respErr)}>{result.status} {result.statusText}</span>
            <span>{result.ms} ms · {(result.size / 1024).toFixed(1)} KB</span>
          </span>
        }
      >
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
        <pre className={css.pre} tabIndex={0}><code>{content}</code></pre>
      </DarkTabs>
      <div className={css.schemaCheck}>
        {!media?.[1].schema ? (
          <span>No schema for {result.status} in {v.cur.label}</span>
        ) : issues === undefined ? (
          <span>The response is not JSON; schema not checked</span>
        ) : issues.length === 0 ? (
          <span><Check aria-hidden="true" size={14} /> Matches the {resp!.status} schema in {v.cur.label}</span>
        ) : (
          <div>
            <span><TriangleAlert aria-hidden="true" size={14} /> {issues.length} {issues.length === 1 ? 'difference' : 'differences'} from the {resp!.status} schema in {v.cur.label}</span>
            <ul className={css.issueList}>{issues.map((i) => <li key={i}>{i}</li>)}</ul>
          </div>
        )}
      </div>
    </section>
  );
}
