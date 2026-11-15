// V-01 API overview (VW-01, VW-07, VW-08), its load-error state (VW-13, X-08) and the
// Authentication page.
import { Button, Skeleton, ViewerBadge } from '@specdiff/ui';
import { ChevronRight, KeyRound, RefreshCw, TriangleAlert, Upload } from 'lucide-react';
import { createContext, useContext, useMemo, useRef } from 'react';
import { fieldNames, summarySentence } from './change-index';
import { useViewer } from './context';
import { schemeSummary } from './fields';
import { Method, cx } from './parts';
import type { LoadError, ViewerVersion } from './types';
import css from './Viewer.module.css';

export function authSummary(schemes: Record<string, Record<string, unknown>>): string {
  const names = [...new Set(Object.values(schemes).map(schemeSummary))];
  return names.length ? names.join(' · ') : 'None';
}

/** A path that wraps after a "/" rather than mid-word ("/cards" stays whole on phones, M-05). */
function breakablePath(path: string) {
  return path.split(/(?<=\/)/).map((seg, i) => (i ? <span key={i}><wbr />{seg}</span> : seg));
}

export function Overview() {
  const v = useViewer();
  const { cur, prev, index, report, isPhone } = v;
  const m = cur.model;
  const specVersion = String(cur.spec.openapi ?? cur.spec.swagger ?? '').split('.').slice(0, 2).join('.');
  const names = useMemo(() => fieldNames(cur.spec), [cur.spec]);
  // One prose sentence (V-01), not the changelog lines joined with " · ".
  const summary = useMemo(() => (report?.status === 'ready' ? summarySentence(report.report.changes, m, names) : ''), [report, m, names]);
  const total = report?.status === 'ready' ? report.report.summary.total : 0;
  // V01-Overview-Error: while a version failed to load, the overview shows the error over skeleton cards.
  if (v.versions.some((x) => x.error && !x.spec)) {
    return (
      <div className={css.page}>
        <h1 className={css.srOnly}>{m.title}</h1>
        <LoadErrors />
        <OverviewSkeleton />
      </div>
    );
  }
  return (
    <div className={css.page}>
      <LoadErrors />
      <p className={css.eyebrow}>
        <span className={css.versionPill}>v{cur.label.replace(/^v/, '')}</span>
        {isPhone ? (prev ? <span className={css.muted}>vs {prev.label}</span> : null) : cur.version.date ? <span className={css.muted}>Released {cur.version.date}</span> : null}
      </p>
      <h1 className={css.h1}>{m.title}</h1>
      {m.description ? <p className={css.lead}>{m.description}</p> : null}

      {isPhone ? (
        prev && report?.status === 'ready' ? (
          <a className={css.phoneSince} href={v.href({ page: 'changes' })}>
            <span>
              <strong>{total} changes since {prev.label}</strong>
              <span className={css.small}>{index.counts.breaking} breaking · {index.counts.new} new endpoints</span>
            </span>
            <ChevronRight aria-hidden="true" size={18} />
          </a>
        ) : null
      ) : (
        <>
          <div className={css.infoGrid}>
            {m.servers.slice(0, 2).map((s, i) => (
              <div key={s.url} className={css.infoCard}>
                <span className={css.infoLabel}>{i === 0 ? 'Server' : /sandbox/i.test(`${s.description ?? ''} ${s.url}`) ? 'Sandbox' : 'Server'}</span>
                <span className={css.infoValue}>{s.url}</span>
              </div>
            ))}
            <div className={css.infoCard}>
              <span className={css.infoLabel}>Authentication</span>
              <span className={css.infoValue}>{authSummary(m.securitySchemes)}</span>
            </div>
            <div className={css.infoCard}>
              <span className={css.infoLabel}>Spec</span>
              <span className={css.infoValue}>OpenAPI {specVersion} · {m.ops.length} operations</span>
            </div>
          </div>
          {prev ? (
            <section className={css.card} aria-labelledby="sd-since">
              <div className={css.cardHead}>
                <h2 id="sd-since" className={css.h3}>Since {prev.label}</h2>
                <a className={css.link} href={v.href({ page: 'changes' })}>See all changes</a>
              </div>
              {report?.status === 'ready' || !v.compareAvailable ? (
                <>
                  <p className={css.counts}>
                    {(['breaking', 'changed', 'new', 'deprecated'] as const).map((k) => (
                      <span key={k} className={css.countItem}><ViewerBadge kind={k} /> {index.counts[k]}</span>
                    ))}
                  </p>
                  {summary ? <p className={cx(css.muted, css.summaryText)}>{summary}</p> : null}
                  {!v.compareAvailable ? <p className={css.muted}>{v.compareNote ?? 'Breaking and Changed badges need the comparison engine; only New and Deprecated are shown.'}</p> : null}
                </>
              ) : report?.status === 'error' ? (
                <p className={css.muted}>Could not compare the versions: {report.message}</p>
              ) : (
                <p className={css.muted} role="status">Comparing {prev.label} with {cur.label}…</p>
              )}
            </section>
          ) : null}
        </>
      )}

      {m.tags.map((t) => (
        <section key={t.name} className={cx(css.card, css.lazyCard)} aria-labelledby={`sd-tag-${t.name}`}>
          <h2 id={`sd-tag-${t.name}`} className={css.h3}>{t.title}</h2>
          <ul className={css.opList}>
            {t.ops.map((o) => {
              const badge = index.ops.get(o.key);
              return (
                <li key={o.key}>
                  <a className={css.opRow} href={v.href({ page: 'op', slug: o.slug, tab: 'docs' })}>
                    <Method method={o.method} className={css.opMethod} />
                    {isPhone ? (
                      <span className={css.opStack}>
                        <span>{o.summary ?? o.path}</span>
                        <span className={css.opPathSmall}>{breakablePath(o.path)}</span>
                      </span>
                    ) : (
                      <>
                        <span className={cx(css.opPath, o.deprecated && css.struck)}>{o.path}</span>
                        <span className={css.opSummary}>{o.summary ?? ''}</span>
                      </>
                    )}
                    <span className={css.opBadge}>{badge ? <ViewerBadge kind={badge} /> : null}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** "Couldn't load openapi-1.5.0.yaml" banners for versions that failed (V-01 error). */
export function LoadErrors() {
  const v = useViewer();
  const failed = v.versions.filter((x) => x.error && !x.spec);
  if (!failed.length) return null;
  return (
    <>
      {failed.map((f) => (
        <LoadErrorBanner key={f.label} version={f} partial />
      ))}
    </>
  );
}

export function LoadErrorBanner({ version, partial }: { version: ViewerVersion; partial?: boolean }) {
  const ctx = useOptionalViewerActions();
  const fileRef = useRef<HTMLInputElement>(null);
  const err = version.error as LoadError;
  const retry = ctx?.retry;
  const file = ctx?.replaceFile;
  return (
    <section className={css.errorCard} role="alert" aria-labelledby={`sd-err-${version.label}`}>
      <TriangleAlert aria-hidden="true" className={css.errorIcon} size={18} />
      <div>
        <h2 id={`sd-err-${version.label}`} className={css.h4}>Couldn’t load {version.source || version.label}</h2>
        <p className={css.errorText}>
          {err.kind === 'cors' ? (
            <>The server at <code className={css.code}>{err.host ?? 'the spec host'}</code> didn’t allow this page to read the file (CORS).</>
          ) : err.kind === 'parse' ? (
            <>The file isn’t valid YAML or JSON: {err.message}</>
          ) : (
            <>{err.message}</>
          )}{' '}
          {partial ? 'The current version loaded, so the reference works, but change badges are off until both versions load.' : ''}
        </p>
        <div className={css.row}>
          {retry ? <Button icon={<RefreshCw />} onClick={() => retry(version.label)}>Try again</Button> : null}
          {file ? (
            <>
              <Button icon={<Upload />} onClick={() => fileRef.current?.click()}>Choose a file instead</Button>
              <input
                ref={fileRef}
                type="file"
                accept=".yaml,.yml,.json"
                className={css.hiddenInput}
                aria-label={`Choose a file for ${version.label}`}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) file(version.label, f); e.target.value = ''; }}
              />
            </>
          ) : null}
          {err.kind === 'cors' || err.kind === 'network' ? (
            <a className={css.link} href="https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS" target="_blank" rel="noreferrer noopener">Why does this happen?</a>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** Retry and file replacement come from the Viewer. */
export const ActionsCtx = createContext<{ retry?: ((label: string) => void) | undefined; replaceFile: (label: string, f: File) => void } | null>(null);
const useOptionalViewerActions = () => useContext(ActionsCtx);

/** Placeholder cards under a load error (V01-Overview-Error): a heading card, then two list cards. */
function OverviewSkeleton() {
  return (
    <div className={css.skeletonStack} aria-hidden="true">
      <div className={css.card}>
        <Skeleton width="29%" height={14} radius="pill" />
        <Skeleton width="53%" height={30} radius="pill" />
        <Skeleton width="77%" height={14} radius="pill" />
        <Skeleton width="67%" height={14} radius="pill" />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className={css.card}>
          <Skeleton width="17%" height={14} radius="pill" />
          {[39, 53, 34].map((w) => (
            <div key={w} className={css.skeletonRow}>
              <Skeleton width={50} height={18} radius="pill" />
              <Skeleton width={`${w}%`} height={18} radius="pill" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function LoadingSkeleton() {
  return (
    <div className={css.page} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className={css.card}>
          <Skeleton width="40%" height={14} />
          <Skeleton width="80%" height={i === 0 ? 30 : 18} />
          <Skeleton width="90%" height={14} />
          <Skeleton width="70%" height={14} />
        </div>
      ))}
    </div>
  );
}

export function AuthPage() {
  const v = useViewer();
  const schemes = Object.entries(v.cur.model.securitySchemes);
  return (
    <div className={css.page}>
      <h1 className={css.h1}>Authentication</h1>
      {schemes.length ? (
        <ul className={css.fieldList}>
          {schemes.map(([name, s]) => (
            <li key={name} className={css.field}>
              <div className={css.fieldHead}>
                <span className={css.fieldName}>{name}</span>
                <span className={css.fieldType}>{schemeSummary(s)}</span>
              </div>
              {s.description ? <p className={css.fieldDesc}>{String(s.description)}</p> : null}
              {s.type === 'oauth2' && s.flows?.clientCredentials?.tokenUrl ? (
                <p className={css.fieldMeta}>Token URL <code className={css.code}>{String(s.flows.clientCredentials.tokenUrl)}</code></p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className={css.lead}>This API does not declare any authentication.</p>
      )}
      {v.tryItEnabled && !v.isPhone ? (
        <p className={css.muted}><KeyRound aria-hidden="true" size={14} /> Credentials for Try it are set from an endpoint’s Try it panel and stay in this tab unless you choose to remember them.</p>
      ) : null}
    </div>
  );
}
