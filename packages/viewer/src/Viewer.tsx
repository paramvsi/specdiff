// The Specdiff Viewer: a version-aware API reference (VW-01..VW-14). Hash-routed so it works
// inside any page; themed with CSS variables; no dependency on the app.
import { Drawer, PortalContainerProvider, Toaster, useToast } from '@specdiff/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EndpointAside, CodeSamples } from './Aside';
import { chronological, indexChanges } from './change-index';
import { Changes, ChangesAside } from './Changes';
import { Ctx, type Loaded, type ViewerCtx } from './context';
import { MyEndpointsDialog, SearchDialog, endpointsKey } from './Dialogs';
import { Endpoint } from './Endpoint';
import { authMarkdown, changesMarkdown, opMarkdown, overviewMarkdown, schemaMarkdown } from './fields';
import { ReportStore, copyText, hrefFor, useHashRoute, useMediaQuery, useReport, useTheme, type Route } from './hooks';
import { buildModel, type Json } from './model';
import { ActionsCtx, AuthPage, LoadErrorBanner, LoadingSkeleton, Overview } from './Overview';
import { cx } from './parts';
import { SchemaAside, SchemaPage } from './SchemaPage';
import { Header, Nav, brandStyle } from './Shell';
import { authStorageKey, loadAuth, saveAuth, type AuthState } from './request';
import type { ViewerProps, ViewerVersion } from './types';
import css from './Viewer.module.css';

const isOpenApi3 = (s: Json) => typeof s?.openapi === 'string' && s.openapi.startsWith('3');
const isSwagger2 = (s: Json) => typeof s?.swagger === 'string' && s.swagger.startsWith('2');

function parseFile(text: string, name: string, parseSpec: ViewerProps['parseSpec']): object {
  if (parseSpec) return parseSpec(text, name);
  try {
    return JSON.parse(text) as object;
  } catch {
    throw new Error('This file is not JSON. YAML needs the embedding page to pass a parser.');
  }
}

function readStoredEndpoints(key: string): ReadonlySet<string> | undefined {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    const arr = raw ? (JSON.parse(raw) as unknown) : undefined;
    return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === 'string')) : undefined;
  } catch {
    return undefined;
  }
}

export function Viewer(props: ViewerProps) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [theme, setTheme] = useTheme(props.theme ?? 'system');
  return (
    <div ref={setRoot} className={cx(css.root, props.className)} data-theme={theme} style={brandStyle(props.brand)}>
      <PortalContainerProvider container={root}>
        <Toaster>
          <ViewerInner {...props} theme={theme} onTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
        </Toaster>
      </PortalContainerProvider>
    </div>
  );
}

function ViewerInner(props: Omit<ViewerProps, 'theme'> & { theme: 'light' | 'dark'; onTheme: () => void }) {
  const { versions: set, compare, brand, basePath = '', tryIt = true, parseSpec, onRetry } = props;
  const { toast } = useToast();
  const notify = useCallback((title: string, description?: string) => { toast({ title, ...(description ? { description } : {}) }); }, [toast]);

  // Versions: the host's set, plus files the user picked ("Choose a file instead", "Add a version").
  const [overrides, setOverrides] = useState<Record<string, ViewerVersion>>({});
  const [added, setAdded] = useState<ViewerVersion[]>([]);
  const versions = useMemo(() => chronological([...set.versions.map((x) => overrides[x.label] ?? x), ...added]), [set.versions, overrides, added]);
  const [pair, setPairState] = useState({ current: set.current, compareWith: set.compareWith });
  const pairKey = `${set.current}\u0000${set.compareWith ?? ''}`;
  const [lastPairKey, setLastPairKey] = useState(pairKey);
  if (lastPairKey !== pairKey) { setLastPairKey(pairKey); setPairState({ current: set.current, compareWith: set.compareWith }); }

  const loaded = useMemo<Loaded[]>(
    () => versions.filter((x) => x.spec && isOpenApi3(x.spec)).map((x) => ({ label: x.label, spec: x.spec as Json, model: buildModel(x.spec as Json), version: x })),
    [versions],
  );
  const curVersion = versions.find((x) => x.label === pair.current) ?? versions[versions.length - 1];
  const cur = loaded.find((l) => l.label === curVersion?.label);
  const prev = pair.compareWith && pair.compareWith !== cur?.label ? loaded.find((l) => l.label === pair.compareWith) : undefined;
  const store = useMemo(() => new ReportStore(compare, (label) => loaded.find((l) => l.label === label)?.spec), [compare, loaded]);
  const report = useReport(store, prev?.label, cur?.label);
  const ready = report?.status === 'ready' ? report.report : undefined;
  const index = useMemo(() => (cur ? indexChanges(ready, cur.model, prev?.model) : undefined), [ready, cur, prev]);

  const [route, go] = useHashRoute(basePath);
  const [lastPage, setLastPage] = useState<Route>(route.page === 'search' ? { page: 'overview' } : route);
  if (route.page !== 'search' && JSON.stringify(route) !== JSON.stringify(lastPage)) setLastPage(route);
  const page = route.page === 'search' ? lastPage : route;

  const isPhone = useMediaQuery('(max-width: 639px)');
  const isNarrow = useMediaQuery('(max-width: 1023px)');
  const [navOpen, setNavOpen] = useState(false);
  const [epOpen, setEpOpen] = useState(false);

  const title = cur?.model.title ?? '';
  const authKey = authStorageKey(title);
  const [auth, setAuthState] = useState<AuthState | undefined>(() => loadAuth(authKey));
  const [remembered, setRemembered] = useState(() => !!loadAuth(authKey));
  const [corsProxy, setCorsProxy] = useState(props.corsProxy ?? '');
  const epKey = endpointsKey(title);
  const [myEndpoints, setMyEndpointsState] = useState<ReadonlySet<string> | undefined>(() => readStoredEndpoints(epKey));
  const [lastEpKey, setLastEpKey] = useState(epKey);
  if (lastEpKey !== epKey) { setLastEpKey(epKey); setMyEndpointsState(readStoredEndpoints(epKey)); }

  // "/" opens search (VW-04).
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      go({ page: 'search', q: '' });
    };
    document.addEventListener('keydown', on);
    return () => document.removeEventListener('keydown', on);
  }, [go]);

  // Move focus to the page on navigation, like a full page load would.
  const mainRef = useRef<HTMLElement>(null);
  const pageKey = JSON.stringify(page);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    mainRef.current?.focus({ preventScroll: true });
    if (typeof window.scrollTo === 'function') try { window.scrollTo({ top: 0 }); } catch { /* jsdom */ }
  }, [pageKey]);

  const fileRef = useRef<HTMLInputElement>(null);
  const addFile = async (file: File) => {
    try {
      const spec = parseFile(await file.text(), file.name, parseSpec) as Json;
      let label = String(spec?.info?.version ?? file.name);
      while (versions.some((x) => x.label === label)) label = `${label}′`;
      setAdded((a) => [...a, { label, source: file.name, spec }]);
      notify(`Added ${label}`);
    } catch (e) {
      notify('Could not read the file', e instanceof Error ? e.message : String(e));
    }
  };
  const replaceFile = useCallback(async (label: string, file: File) => {
    try {
      const spec = parseFile(await file.text(), file.name, parseSpec);
      const base = set.versions.find((x) => x.label === label);
      setOverrides((o) => ({ ...o, [label]: { label, source: file.name, ...(base?.date ? { date: base.date } : {}), spec } }));
    } catch (e) {
      notify('Could not read the file', e instanceof Error ? e.message : String(e));
    }
  }, [parseSpec, set.versions, notify]);
  const actions = useMemo(() => ({ retry: onRetry, replaceFile: (l: string, f: File) => void replaceFile(l, f) }), [onRetry, replaceFile]);

  if (!cur || !index) {
    const failed = curVersion && !curVersion.spec && curVersion.error ? curVersion : undefined;
    return (
      <ActionsCtx.Provider value={actions}>
        <main className={css.single}>
          {failed ? (
            <>
              <LoadErrorBanner version={failed} />
              <LoadingSkeleton />
            </>
          ) : curVersion?.spec && isSwagger2(curVersion.spec) ? (
            <section className={css.card} role="alert" aria-labelledby="sd-swagger2">
              <h1 id="sd-swagger2" className={css.h3}>Swagger 2.0 isn’t supported in the Viewer yet</h1>
              <p className={css.muted}>{curVersion.source || curVersion.label} is a Swagger 2.0 document. The Viewer renders OpenAPI 3.0 and 3.1. Convert it to OpenAPI 3 and load it again; the Specdiff app and CLI already compare Swagger 2.0 files.</p>
            </section>
          ) : curVersion?.spec ? (
            <section className={css.card} role="alert" aria-labelledby="sd-notoa">
              <h1 id="sd-notoa" className={css.h3}>This isn’t an OpenAPI document</h1>
              <p className={css.muted}>{curVersion.source || curVersion.label} has no <code className={css.code}>openapi</code> version field.</p>
            </section>
          ) : (
            <LoadingSkeleton />
          )}
        </main>
      </ActionsCtx.Provider>
    );
  }

  const href = (r: Route) => hrefFor(r, basePath);
  const ctx: ViewerCtx = {
    cur, prev, versions, loaded, store, report, index,
    compareWith: pair.compareWith && pair.compareWith !== cur.label ? pair.compareWith : undefined,
    changes: ready?.changes ?? [],
    compareAvailable: !!compare,
    compareNote: props.compareUnavailableReason,
    go, href,
    copyMarkdown: (md, t) => void copyText(md).then((ok) => notify(ok ? t ?? 'Copied for LLM' : 'Could not copy', ok ? (t ? undefined : 'Markdown of this page is on your clipboard.') : 'Your browser blocked the clipboard.')),
    notify,
    opBySlug: new Map(cur.model.ops.map((o) => [o.slug, o])),
    schemaBySlug: new Map(cur.model.schemas.map((s) => [s.slug, s])),
    schemaByName: new Map(cur.model.schemas.map((s) => [s.name, s])),
    isPhone,
    tryItEnabled: tryIt && !isPhone,
    corsProxy, setCorsProxy,
    auth,
    setAuth: (a, remember) => { setAuthState(a); setRemembered(remember && !!a); saveAuth(authKey, a, remember); },
    remembered,
    myEndpoints,
    setMyEndpoints: (keys) => {
      setMyEndpointsState(keys);
      try {
        if (keys) globalThis.localStorage?.setItem(epKey, JSON.stringify([...keys].sort()));
        else globalThis.localStorage?.removeItem(epKey);
      } catch { /* storage blocked: the filter lasts for this visit */ }
    },
    openMyEndpoints: () => setEpOpen(true),
    setPair: (current, compareWith) => setPairState({ current, compareWith }),
  };

  const op = page.page === 'op' ? ctx.opBySlug.get(page.slug) : undefined;
  const schema = page.page === 'schema' ? ctx.schemaBySlug.get(page.slug) : undefined;
  const notFound = (page.page === 'op' && !op) || (page.page === 'schema' && !schema);

  const content = notFound ? (
    <div className={css.page}>
      <h1 className={css.h1}>Not in {cur.label}</h1>
      <p className={css.lead}>This {page.page === 'op' ? 'endpoint' : 'schema'} doesn’t exist in version {cur.label}. <a className={css.link} href={href({ page: 'overview' })}>Go to the overview</a>.</p>
    </div>
  ) : op ? (
    <>
      <Endpoint op={op} tab={page.page === 'op' ? page.tab : 'docs'} />
      {isPhone ? <div className={css.phoneSamples}><CodeSamples op={op} /></div> : null}
    </>
  ) : schema ? <SchemaPage entry={schema} />
    : page.page === 'changes' ? <Changes />
    : page.page === 'auth' ? <AuthPage />
    : <Overview />;

  const aside = isPhone || notFound ? null : op ? <EndpointAside key={op.key} op={op} /> : schema ? <SchemaAside entry={schema} /> : page.page === 'changes' ? <ChangesAside /> : null;

  const pageMarkdown = () => {
    if (op) return opMarkdown(cur.spec, cur.model, op, index.opChanges.get(op.key) ?? []);
    if (schema) return schemaMarkdown(cur.spec, schema);
    if (page.page === 'changes' && prev) return changesMarkdown(prev.label, cur.label, ctx.changes);
    if (page.page === 'auth') return authMarkdown(cur.model);
    return overviewMarkdown(cur.model, cur.label);
  };
  const download = () => {
    const blob = new Blob([JSON.stringify(cur.spec, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(cur.model.title || 'openapi').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${cur.label}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const openSearch = () => go({ page: 'search', q: '' });

  return (
    <Ctx.Provider value={ctx}>
      <ActionsCtx.Provider value={actions}>
        <Header
          brand={brand}
          theme={props.theme}
          onTheme={props.onTheme}
          onCopy={() => ctx.copyMarkdown(pageMarkdown())}
          onDownload={download}
          onAddVersion={() => fileRef.current?.click()}
          onMenu={isNarrow ? () => setNavOpen(true) : undefined}
          onSearch={openSearch}
        />
        <input ref={fileRef} type="file" accept=".yaml,.yml,.json" className={css.hiddenInput} aria-label="Add a version from a file" tabIndex={-1} onChange={(e) => { const f = e.target.files?.[0]; if (f) void addFile(f); e.target.value = ''; }} />
        <div className={cx(css.body, aside ? css.bodyThree : css.bodyTwo, isNarrow && css.bodyNarrow, isPhone && css.bodyPhone)}>
          {isNarrow ? null : <div className={css.navCol}><Nav route={page} onSearch={openSearch} /></div>}
          <main ref={mainRef} tabIndex={-1} className={css.main} aria-label={op ? op.summary ?? op.key : schema ? schema.name : undefined}>
            {content}
          </main>
          {aside ? <div className={css.asideCol}>{aside}</div> : null}
        </div>
        {isNarrow ? (
          <Drawer title={cur.model.title} open={navOpen} onOpenChange={setNavOpen} className={css.drawer}>
            <Nav route={page} onSearch={() => { setNavOpen(false); openSearch(); }} onNavigate={() => setNavOpen(false)} />
          </Drawer>
        ) : null}
        <SearchDialog open={route.page === 'search'} initial={route.page === 'search' ? route.q : ''} onClose={() => go(lastPage)} />
        <MyEndpointsDialog open={epOpen} onOpenChange={setEpOpen} />
      </ActionsCtx.Provider>
    </Ctx.Provider>
  );
}
