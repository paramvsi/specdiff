// A-07 JSON / YAML (JS-01..JS-08, JS-10, JS-11, X-11): options, stats with "type changed" as its own
// category, tree / side-by-side / raw views, JSONPath per change, duplicate keys, export panel.
import { Config, type Change, type Kind } from '@specdiff/core';
import { humanPath, stable } from '@specdiff/core/json';
import { diffText } from '@specdiff/core/text';
import {
  IdenticalState,
  Button,
  Checkbox,
  DiffMarker,
  RadioCardGroup,
  SegmentedControl,
  Tabs,
  TextField,
  useToast,
  type DiffKind,
} from '@specdiff/ui';
import * as icons from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCommand } from '../../shell/commands';
import { changeLink, focusChange, readChangeHash, useNav } from '../../shell/nav';
import { useApp } from '../../state/store';
import type { JsonResultData } from '../../worker/protocol';
import { copyText, download } from '../ExportMenu';
import { DiffRows } from './DiffRows';
import { JSON_EXPORTS, jsonExport, type JsonExportKind } from './exports';
import css from './JsonResult.module.css';

type View = 'tree' | 'side' | 'raw';
// Re-running the comparison remounts this screen; keep the view choices across that.
const memo: { tab: string; view: View; format: JsonExportKind } = {
  tab: 'diff',
  view: 'tree',
  format: 'patch',
};

const KINDS: Array<{ kind: Kind; label: string; stat: keyof JsonResultData['diff']['stats'] }> = [
  { kind: 'added', label: 'Added', stat: 'added' },
  { kind: 'removed', label: 'Removed', stat: 'removed' },
  { kind: 'changed', label: 'Changed', stat: 'changed' },
  { kind: 'typeChanged', label: 'Type changed', stat: 'typeChanged' },
  { kind: 'moved', label: 'Moved', stat: 'moved' },
];
const SYMBOL: Record<Kind, string> = {
  added: '+',
  removed: '−',
  changed: '~',
  typeChanged: '~',
  moved: '↕',
  renamed: '~',
};
const MARKER: Record<Kind, DiffKind> = {
  added: 'added',
  removed: 'removed',
  changed: 'changed',
  typeChanged: 'type-changed',
  moved: 'moved',
  renamed: 'changed',
};

const typeOf = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
function fmt(v: unknown): string {
  if (v === undefined) return '(missing)';
  if (Array.isArray(v)) return `[ ${v.length} item${v.length === 1 ? '' : 's'} ]`;
  if (v && typeof v === 'object') return '{ … }';
  const s = JSON.stringify(v);
  return s.length > 80 ? `${s.slice(0, 79)}…` : s;
}
const LAST = /(\.[^.[\]]+|\['(?:[^'\\]|\\.)*'\]|\[[^\]]*\])$/;
const parentOf = (p: string) => p.replace(LAST, '') || '$';
const depthOf = (p: string) => (p.match(/\.[^.[\]]+|\[[^\]]*\]/g) ?? []).length;

function canonical(v: unknown, sortKeys: boolean): string {
  if (!sortKeys) return JSON.stringify(v, null, 2) ?? '';
  return JSON.stringify(JSON.parse(stable(v) === 'undefined' ? 'null' : stable(v)), null, 2);
}

export default function JsonResult() {
  const { result, before, after, settings, updateConfig, compare, viewed, toggleViewed } =
    useApp();
  const data = result && 'json' in result ? result.json : null;
  const [tab, setTab] = useState(memo.tab);

  // Re-run when options change (debounced, like A-03). Compare with the value this screen mounted
  // with, not a "first run" flag: StrictMode runs effects twice, and a re-run remounts this screen.
  const shown = useRef(settings.config.json);
  useEffect(() => {
    if (shown.current === settings.config.json) return;
    shown.current = settings.config.json;
    const t = setTimeout(() => void compare(), 250);
    return () => clearTimeout(t);
  }, [settings.config.json, compare]);

  if (!data || !result || !('json' in result)) return null;
  if (!data.changes.length && !data.duplicates.before.length && !data.duplicates.after.length) {
    return <IdenticalState ignoredLines={0} />;
  }
  const names = { before: before?.name ?? 'before', after: after?.name ?? 'after' };

  return (
    <div className={css.page}>
      <Tabs
        label="JSON result"
        value={tab}
        onValueChange={(t) => {
          memo.tab = t;
          setTab(t);
        }}
        items={[
          {
            value: 'diff',
            label: 'Diff',
            content: (
              <DiffTab
                data={data}
                rawRows={result.text.rows}
                names={names}
                viewed={viewed}
                toggleViewed={toggleViewed}
                options={Config.parse(settings.config).json}
                setOptions={(p) => updateConfig((c) => ({ ...c, json: { ...c.json, ...p } }))}
              />
            ),
          },
          { value: 'export', label: 'Export', content: <ExportTab data={data} names={names} /> },
        ]}
      />
    </div>
  );
}

type JsonOptions = Config['json'];

function DiffTab({
  data,
  rawRows,
  names,
  viewed,
  toggleViewed,
  options,
  setOptions,
}: {
  data: JsonResultData;
  rawRows: Parameters<typeof DiffRows>[0]['rows'];
  names: { before: string; after: string };
  viewed: Record<string, true>;
  toggleViewed: (id: string) => void;
  options: JsonOptions;
  setOptions: (p: Partial<JsonOptions>) => void;
}) {
  const { toast } = useToast();
  const [view, setView] = useState<View>(memo.view);
  const [filter, setFilter] = useState<Set<Kind>>(new Set());
  const changeId = useNav((s) => s.changeId);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());

  const fromOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of data.diff.changes) if (c.from) m.set(`${c.kind}|${c.jsonPath}`, c.from);
    return m;
  }, [data]);
  const visible = useMemo(
    () => data.changes.filter((c) => !filter.size || filter.has(c.kind)),
    [data, filter],
  );
  const current = Math.max(
    0,
    visible.findIndex((c) => c.id === changeId),
  );

  const go = useCallback(
    (i: number) => {
      if (!visible.length) return;
      const n = (i + visible.length) % visible.length;
      const c = visible[n]!;
      focusChange(c.id); // X-12: #change=<id>
      if (view !== 'tree') {
        memo.view = 'tree';
        setView('tree');
      }
      requestAnimationFrame(() => {
        const el = rowRefs.current.get(c.id);
        el?.scrollIntoView({ block: 'nearest' });
        el?.focus({ preventScroll: true });
      });
    },
    [visible, view],
  );
  useCommand(
    'next-change',
    useCallback(() => go(changeId ? current + 1 : 0), [go, current, changeId]),
  );
  useCommand(
    'prev-change',
    useCallback(() => go(current - 1), [go, current]),
  );
  // X-12: open the change in the URL hash once, on first render.
  const linked = useRef(false);
  useEffect(() => {
    if (linked.current) return;
    linked.current = true;
    const id = readChangeHash();
    if (!id || !visible.some((c) => c.id === id)) return;
    useNav.getState().set({ changeId: id });
    requestAnimationFrame(() => {
      const el = rowRefs.current.get(id);
      el?.scrollIntoView({ block: 'nearest' });
      el?.focus({ preventScroll: true });
    });
  }, [visible]);
  useCommand(
    'copy-link',
    useCallback(() => {
      const c = visible[current];
      if (c) void navigator.clipboard?.writeText(changeLink(c.id)).then(() => toast({ title: 'Link to this change copied' }));
    }, [visible, current, toast]),
  );
  useCommand(
    'mark-viewed',
    useCallback(() => {
      const c = visible[current];
      if (c) toggleViewed(c.id);
    }, [visible, current, toggleViewed]),
  );

  const sideRows = useMemo(
    () =>
      view === 'side'
        ? diffText(
            canonical(data.before, options.ignoreKeyOrder),
            canonical(data.after, options.ignoreKeyOrder),
            Config.parse({}).text,
          ).rows
        : [],
    [view, data, options.ignoreKeyOrder],
  );

  const total = data.changes.length;
  const seen = data.changes.filter((c) => viewed[c.id]).length;
  const dupes = [
    ...data.duplicates.before.map((d) => ({ ...d, file: names.before })),
    ...data.duplicates.after.map((d) => ({ ...d, file: names.after })),
  ];

  const copyPath = async (p: string) => {
    const ok = await copyText(p);
    toast(
      ok
        ? { title: 'JSONPath copied', description: p, tone: 'success' }
        : { title: 'Couldn’t copy', description: p, tone: 'error' },
    );
  };

  // Tree: changes in document order, with a header row each time the parent container changes.
  const tree: Array<
    { type: 'group'; path: string; matchKey?: string } | { type: 'change'; c: Change }
  > = [];
  let lastParent = '';
  for (const c of visible) {
    const p = parentOf(c.jsonPath ?? '$');
    if (p !== lastParent && p !== '$') {
      const general = p.replace(/\[[^\]]*\]/g, '[*]');
      const key = data.diff.matchKeys[`${p}[*]`] ?? data.diff.matchKeys[`${general}[*]`];
      tree.push({ type: 'group', path: p, ...(key ? { matchKey: key } : {}) });
    }
    lastParent = p;
    tree.push({ type: 'change', c });
  }

  return (
    <div className={css.diffTab}>
      <header className={css.head}>
        <h1 className={css.h1}>
          {total ? `${total} difference${total === 1 ? '' : 's'}` : 'No differences'}
        </h1>
        <div className={css.chips} role="group" aria-label="Show only">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              className={css.chip}
              data-kind={k.kind}
              aria-pressed={filter.has(k.kind)}
              onClick={() => {
                const f = new Set(filter);
                if (f.has(k.kind)) f.delete(k.kind);
                else f.add(k.kind);
                setFilter(f);
              }}
            >
              <span aria-hidden="true" className={css.chipSym}>
                {SYMBOL[k.kind]}
              </span>
              {k.label} <span className={css.chipCount}>{data.diff.stats[k.stat]}</span>
            </button>
          ))}
        </div>
      </header>

      {dupes.length > 0 && (
        <section className={css.dupes} aria-labelledby="dupes-title">
          <h2 id="dupes-title" className={css.dupesTitle}>
            <icons.TriangleAlert size={15} aria-hidden="true" /> Duplicate keys
          </h2>
          <ul>
            {dupes.map((d, i) => (
              <li key={i}>
                <code>{d.key}</code> appears twice in{' '}
                <code>{d.path === '$' ? 'the root object' : humanPath(d.path)}</code> in {d.file},
                line {d.line}. The last value wins.
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className={css.body}>
        <section className={css.card} aria-label="Differences">
          <div className={css.toolbar}>
            <SegmentedControl
              label="View"
              value={view}
              onValueChange={(v) => {
                memo.view = v;
                setView(v);
              }}
              options={[
                { value: 'tree', label: 'Tree' },
                { value: 'side', label: 'Side by side' },
                { value: 'raw', label: 'Raw' },
              ]}
            />
            <span className={css.progress}>
              {seen} of {total} viewed
            </span>
            <div className={css.nav}>
              <Button
                variant="secondary"
                iconOnly
                icon={<icons.ChevronUp size={16} />}
                aria-label="Previous change"
                aria-keyshortcuts="K"
                disabled={!visible.length}
                onClick={() => go(current - 1)}
              />
              <span className={css.pos} aria-live="polite">
                {visible.length && changeId ? current + 1 : 0} / {visible.length}
              </span>
              <Button
                variant="secondary"
                iconOnly
                icon={<icons.ChevronDown size={16} />}
                aria-label="Next change"
                aria-keyshortcuts="J"
                disabled={!visible.length}
                onClick={() => go(changeId ? current + 1 : 0)}
              />
            </div>
          </div>

          {view === 'tree' &&
            (tree.length ? (
              <ul className={css.tree} aria-label="Changes by path">
                {tree.map((t) =>
                  t.type === 'group' ? (
                    <li
                      key={`g${t.path}`}
                      className={css.group}
                      style={{ paddingLeft: `calc(${depthOf(t.path) - 1} * 20px + 16px)` }}
                    >
                      {humanPath(t.path)}
                      {t.matchKey && (
                        <span className={css.muted}>
                          {' '}
                          · matched by <strong>{t.matchKey}</strong>
                        </span>
                      )}
                    </li>
                  ) : (
                    <ChangeRow
                      key={t.c.id}
                      c={t.c}
                      from={fromOf.get(`${t.c.kind}|${t.c.jsonPath}`)}
                      selected={t.c.id === changeId}
                      viewed={!!viewed[t.c.id]}
                      onViewed={() => toggleViewed(t.c.id)}
                      onCopy={() => void copyPath(t.c.jsonPath ?? '$')}
                      refCb={(el) => {
                        if (el) rowRefs.current.set(t.c.id, el);
                        else rowRefs.current.delete(t.c.id);
                      }}
                    />
                  ),
                )}
              </ul>
            ) : (
              <p className={css.none}>
                {total
                  ? 'No changes of the selected kinds.'
                  : 'The documents are equal with these options.'}
              </p>
            ))}
          {view === 'side' && (
            <DiffRows
              rows={sideRows}
              beforeName={names.before}
              afterName={names.after}
              label={`Side by side: ${names.before} and ${names.after}`}
            />
          )}
          {view === 'raw' && (
            <DiffRows
              rows={rawRows}
              beforeName={names.before}
              afterName={names.after}
              label={`Raw text: ${names.before} and ${names.after}`}
            />
          )}
        </section>

        <Options options={options} setOptions={setOptions} data={data} />
      </div>
    </div>
  );
}

function ChangeRow({
  c,
  from,
  selected,
  viewed,
  onViewed,
  onCopy,
  refCb,
}: {
  c: Change;
  from: string | undefined;
  selected: boolean;
  viewed: boolean;
  onViewed: () => void;
  onCopy: () => void;
  refCb: (el: HTMLLIElement | null) => void;
}) {
  const path = c.jsonPath ?? '$';
  const nullMissing =
    (c.kind === 'removed' && c.before === null) || (c.kind === 'added' && c.after === null);
  return (
    // tabIndex -1: the row is a focus target for J/K; its controls are the buttons inside.
    <li
      ref={refCb}
      className={css.row}
      data-kind={c.kind}
      data-viewed={viewed || undefined}
      aria-current={selected || undefined}
      tabIndex={-1}
      style={{ paddingLeft: `calc(${depthOf(path) - 1} * 20px + 16px)` }}
    >
      <span className={css.sym} aria-hidden="true">
        {SYMBOL[c.kind]}
      </span>
      <span className={css.main}>
        <span className={css.line}>
          <span className={css.key}>{humanPath(path).split(' › ').pop()}</span>{' '}
          <Value c={c} from={from} />
        </span>
        <span className={css.path}>
          <code>{path}</code>
          <button
            type="button"
            className={css.copy}
            onClick={(e) => {
              e.stopPropagation();
              onCopy();
            }}
            aria-label={`Copy JSONPath ${path}`}
          >
            <icons.Copy size={13} aria-hidden="true" />
          </button>
        </span>
      </span>
      <span className={css.meta}>
        {c.kind === 'typeChanged' && (
          <span className={css.detail}>
            {typeOf(c.before)} → {typeOf(c.after)}
          </span>
        )}
        {nullMissing && <span className={css.nullPill}>null ≠ missing</span>}
        <DiffMarker kind={MARKER[c.kind]} />
        <button
          type="button"
          className={css.viewed}
          aria-pressed={viewed}
          aria-label={`Viewed: ${humanPath(path)}`}
          onClick={(e) => {
            e.stopPropagation();
            onViewed();
          }}
        >
          {viewed ? <icons.CheckSquare size={15} aria-hidden="true" /> : <icons.Square size={15} aria-hidden="true" />}
          Viewed
        </button>
      </span>
    </li>
  );
}

function Value({ c, from }: { c: Change; from: string | undefined }) {
  if (c.kind === 'changed' || c.kind === 'typeChanged')
    return (
      <span className={css.value}>
        <del className={css.del}>{fmt(c.before)}</del> → <ins className={css.ins}>{fmt(c.after)}</ins>
      </span>
    );
  if (c.kind === 'added')
    return (
      <span className={css.value}>
        <ins className={css.ins}>{fmt(c.after)}</ins>
      </span>
    );
  if (c.kind === 'removed')
    return (
      <span className={css.value}>
        <del className={css.del}>{fmt(c.before)}</del>
      </span>
    );
  return (
    <span className={css.value}>
      {fmt(c.after)}{' '}
      <span className={css.muted}>moved from {from ? humanPath(from) : 'another position'}, not a change</span>
    </span>
  );
}

function Options({
  options,
  setOptions,
  data,
}: {
  options: JsonOptions;
  setOptions: (p: Partial<JsonOptions>) => void;
  data: JsonResultData;
}) {
  const [matchKey, setMatchKey] = useState(options.arrayMatchKey === 'auto' ? '' : options.arrayMatchKey);
  const [ignore, setIgnore] = useState(options.ignoreKeys.join(', '));
  const [tol, setTol] = useState(options.numberTolerance ? String(options.numberTolerance) : '');
  const tolNum = Number(tol || '0');
  const tolError = Number.isFinite(tolNum) && tolNum >= 0 ? undefined : 'Enter a number, e.g. 0.01.';
  const detected = Object.entries(data.diff.matchKeys);
  const commit = () => {
    const keys = ignore
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const p: Partial<JsonOptions> = {};
    if ((matchKey.trim() || 'auto') !== options.arrayMatchKey) p.arrayMatchKey = matchKey.trim() || 'auto';
    if (keys.join(',') !== options.ignoreKeys.join(',')) p.ignoreKeys = keys;
    if (!tolError && tolNum !== options.numberTolerance) p.numberTolerance = tolNum;
    if (Object.keys(p).length) setOptions(p);
  };
  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commit();
  };
  return (
    <aside className={css.options} aria-labelledby="json-options">
      <h2 id="json-options" className={css.h2}>
        Options
      </h2>
      <div>
        <TextField
          label="Match array items by"
          mono
          value={matchKey}
          placeholder="auto"
          onChange={(e) => setMatchKey(e.target.value)}
          onBlur={commit}
          onKeyDown={onEnter}
          hint={
            options.arrayMatchKey === 'auto'
              ? detected.length
                ? `Auto-detected: ${detected.map(([p, k]) => `${k} for ${humanPath(p.replace(/\[\*\]$/, ''))}`).join('; ')}.`
                : 'Auto: tried id, uuid, key and name. No array has one that is unique in every item, so items match by position.'
              : `Arrays match on ${options.arrayMatchKey} where every item has a unique one. Leave empty for auto.`
          }
        />
      </div>
      <Checkbox
        label="Ignore key order"
        checked={options.ignoreKeyOrder}
        onCheckedChange={(v) => setOptions({ ignoreKeyOrder: v })}
      />
      <Checkbox
        label="Ignore array order"
        checked={options.ignoreArrayOrder}
        onCheckedChange={(v) => setOptions({ ignoreArrayOrder: v })}
      />
      <Checkbox
        label="Treat null and missing as equal"
        checked={options.nullEqualsMissing}
        onCheckedChange={(v) => setOptions({ nullEqualsMissing: v })}
      />
      <TextField
        label="Ignore keys"
        mono
        value={ignore}
        placeholder="updatedAt, requestId"
        onChange={(e) => setIgnore(e.target.value)}
        onBlur={commit}
        onKeyDown={onEnter}
        hint="Comma-separated, at any depth."
      />
      <TextField
        label="Number tolerance"
        mono
        inputMode="decimal"
        value={tol}
        placeholder="0"
        onChange={(e) => setTol(e.target.value)}
        onBlur={commit}
        onKeyDown={onEnter}
        error={tolError}
        hint="100.00 always equals 100. A tolerance of 0.01 also treats 100.004 as 100."
      />
    </aside>
  );
}

function ExportTab({
  data,
  names,
}: {
  data: JsonResultData;
  names: { before: string; after: string };
}) {
  const { toast } = useToast();
  const [format, setFormat] = useState<JsonExportKind>(memo.format);
  const file = useMemo(() => jsonExport(format, data, names), [format, data, names]);
  return (
    <div className={css.exportTab}>
      <RadioCardGroup
        legend="Export format"
        options={JSON_EXPORTS}
        value={format}
        onValueChange={(v) => {
          memo.format = v;
          setFormat(v);
        }}
        className={css.formats}
      />
      <section className={css.preview} aria-label="Export preview">
        <div className={css.previewHead}>
          <span className={css.previewName}>
            {file.name} · {file.meta}
          </span>
          <Button
            variant="secondary"
            icon={<icons.Copy size={15} />}
            onClick={async () => {
              const ok = await copyText(file.content);
              toast(
                ok
                  ? { title: 'Copied', description: file.name, tone: 'success' }
                  : { title: 'Couldn’t copy', description: 'Use Download instead.', tone: 'error' },
              );
            }}
          >
            Copy
          </Button>
          <Button
            variant="brand"
            icon={<icons.Download size={15} />}
            onClick={() => download(file.name, file.content, file.type)}
          >
            Download
          </Button>
        </div>
        <pre
          className={css.code}
          // Scrollable content must be reachable by keyboard (axe scrollable-region-focusable).
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
          aria-label={`${file.name} preview`}
        >
          {file.content}
        </pre>
        {file.verified !== undefined && (
          <p className={css.verify} data-ok={file.verified && !file.lossy}>
            {file.verified && !file.lossy ? (
              <>
                <icons.Check size={14} aria-hidden="true" /> Applying this patch to {names.before}{' '}
                gives {names.after} exactly.
              </>
            ) : (
              <>
                <icons.TriangleAlert size={14} aria-hidden="true" />
                {file.lossy
                  ? ' Lossy: the new document sets values to null, and in a Merge Patch null deletes a key. Use JSON Patch for an exact result.'
                  : ` Applying this patch to ${names.before} doesn’t give ${names.after} exactly.`}
              </>
            )}
          </p>
        )}
      </section>
    </div>
  );
}
