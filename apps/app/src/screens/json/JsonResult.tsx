// A-07 JSON / YAML (JS-01..JS-08, JS-10, JS-11, X-11). B-31: the default view is AJson (compare options and
// counts on the left, the changes in the middle, "Changes by path" and Export on the right); the A07 tree,
// side by side and raw text are the middle card's views. The Export tab is A07-JsonExport.
import { Config, type Change, type Kind } from '@specdiff/core';
import { humanPath, stable } from '@specdiff/core/json';
import type { Row } from '@specdiff/core/text';
import {
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
import { VirtualList, type RowSlot, type VirtualListApi } from '../../lib/VirtualList';
import { startTextDiff } from '../../worker/client';
import { useCommand } from '../../shell/commands';
import { focusChange, readChangeHash, useNav } from '../../shell/nav';
import { copyChangeLink } from '../changeLink';
import { useApp } from '../../state/store';
import type { JsonResultData } from '../../worker/protocol';
import { copyText, download } from '../ExportMenu';
import { DiffRows } from './DiffRows';
import { JSON_EXPORTS, jsonExport, type JsonExportKind } from './exports';
import css from './JsonResult.module.css';

type View = 'tree' | 'side' | 'raw';
// Re-running the comparison remounts this screen; keep the view choices across that.
const memo: { tab: string; view: View; format: JsonExportKind; onlyChanges: boolean } = {
  tab: 'diff',
  view: 'tree',
  format: 'patch',
  onlyChanges: true,
};

/** Chip categories: the change kinds, plus null ≠ missing as its own (A-07). */
type ChipKind = Kind | 'nullMissing';
const CHIPS: Array<{ kind: ChipKind; label: string }> = [
  { kind: 'added', label: 'Added' },
  { kind: 'removed', label: 'Removed' },
  { kind: 'changed', label: 'Changed' },
  { kind: 'typeChanged', label: 'Type changed' },
  { kind: 'moved', label: 'Moved' },
  { kind: 'nullMissing', label: 'Null vs missing' },
];
const isNullMissing = (c: Change) =>
  (c.kind === 'removed' && c.before === null) || (c.kind === 'added' && c.after === null);
const chipOf = (c: Change): ChipKind => (isNullMissing(c) ? 'nullMissing' : c.kind);
/** Scalar values in a document ("7 differences in 226 values"). */
function countValues(v: unknown): number {
  if (Array.isArray(v)) return v.reduce<number>((n, x) => n + countValues(x), 0);
  if (v && typeof v === 'object') return Object.values(v).reduce<number>((n, x) => n + countValues(x), 0);
  return v === undefined ? 0 : 1;
}
const SYMBOL_BASE: Record<Kind, string> = {
  added: '+',
  removed: '−',
  changed: '~',
  typeChanged: '~',
  moved: '↕',
  renamed: '~',
};
const SYMBOL = SYMBOL_BASE;
const CHIP_SYMBOL: Record<ChipKind, string> = { ...SYMBOL_BASE, nullMissing: '≠' };
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

/** A path inside a key-matched array item: `$.flags[?(@.key=="x")].enabled` → array, key, value, rest. */
const KEYED = /^(.*?)\[\?\(@\.(\w+)==("?)(.*?)\3\)\](.*)$/;
const INDEX = /^(.*)\[(\d+)\]$/;

/** Read a value at a JSONPath made by core (`.k`, `['k']`, `[n]`, `[?(@.k==v)]`). */
export function valueAt(doc: unknown, path: string): unknown {
  const steps = path.replace(/^\$/, '').match(/\.[^.[\]]+|\['(?:[^'\\]|\\.)*'\]|\[\?\(@\.\w+==(?:"[^"]*"|[^)]*)\)\]|\[\d+\]/g) ?? [];
  let cur: unknown = doc;
  for (const st of steps) {
    if (cur === null || typeof cur !== 'object') return undefined;
    const filter = /^\[\?\(@\.(\w+)==("?)(.*?)\2\)\]$/.exec(st);
    if (filter) {
      cur = Array.isArray(cur)
        ? cur.find((it) => it && typeof it === 'object' && String((it as Record<string, unknown>)[filter[1]!]) === filter[3])
        : undefined;
    } else if (st.startsWith('[') && !st.startsWith("['")) cur = (cur as unknown[])[Number(st.slice(1, -1))];
    else {
      const k = st.startsWith('.') ? st.slice(1) : st.slice(2, -2).replace(/\\(.)/g, '$1');
      cur = (cur as Record<string, unknown>)[k];
    }
  }
  return cur;
}

export interface TreeEntry {
  /** The array (or object) this row sits in. */
  group: string;
  matchKey?: string | undefined;
  /** The row's label: `[key=checkout_v2]` for a keyed item, the key otherwise. */
  label: string;
  /** For changes inside a keyed item: the sub-path (`enabled`). */
  inner?: string | undefined;
  /** For keyed moves: index before → after. */
  move?: { from: number; to: number } | undefined;
}

/** Where a change sits in the A-07 tree: keyed items under their array, shown by key (never by index). */
export function treeEntry(c: Change, data: Pick<JsonResultData, 'before' | 'diff'>): TreeEntry {
  const path = c.jsonPath ?? '$';
  const keyFor = (arr: string) =>
    data.diff.matchKeys[`${arr.replace(/\[[^\]]*\]/g, '[*]')}[*]`] ?? data.diff.matchKeys[`${arr}[*]`];
  const k = KEYED.exec(path);
  if (k) {
    const rest = k[5]!.replace(/^\./, '');
    if (!rest && c.kind === 'moved' && typeof c.before === 'number' && typeof c.after === 'number')
      return { group: k[1]!, matchKey: k[2], label: `[${k[2]}=${k[4]}]`, move: { from: c.before, to: c.after } };
    return { group: k[1]!, matchKey: k[2], label: `[${k[2]}=${k[4]}]`, ...(rest ? { inner: humanPath(`$.${rest}`).replace(/ › /g, '.') } : {}) };
  }
  const ix = INDEX.exec(path);
  const key = ix ? keyFor(ix[1]!) : undefined;
  if (ix && key && c.kind === 'moved' && typeof c.before === 'number' && typeof c.after === 'number') {
    const item = (valueAt(data.before, ix[1]!) as unknown[] | undefined)?.[c.before] as Record<string, unknown> | undefined;
    return { group: ix[1]!, matchKey: key, label: `[${key}=${String(item?.[key] ?? c.before)}]`, move: { from: c.before, to: c.after } };
  }
  // Everything else sits at the top level under its dotted path ("limits.maxUpload"), as in the design.
  return { group: '$', label: humanPath(path).replace(/ › /g, '.') };
}

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

  // X-08: the identical state is Result's (it can show the formatting-only changes).
  if (!data || !result || !('json' in result)) return null;
  const options = Config.parse(settings.config).json;
  const toExport = () => {
    memo.tab = 'export';
    setTab('export');
  };
  const names = { before: before?.name ?? 'before', after: after?.name ?? 'after' };

  return (
    <div className={css.page}>
      <Tabs
        label="JSON result"
        className={css.tabs}
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
                options={options}
                setOptions={(p) => updateConfig((c) => ({ ...c, json: { ...c.json, ...p } }))}
                onAllFormats={toExport}
              />
            ),
          },
          {
            value: 'export',
            label: 'Export',
            content: <ExportTab data={data} names={names} matchKey={options.arrayMatchKey} />,
          },
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
  onAllFormats,
}: {
  data: JsonResultData;
  rawRows: Parameters<typeof DiffRows>[0]['rows'];
  names: { before: string; after: string };
  viewed: Record<string, true>;
  toggleViewed: (id: string) => void;
  options: JsonOptions;
  setOptions: (p: Partial<JsonOptions>) => void;
  onAllFormats: () => void;
}) {
  const { toast } = useToast();
  const [view, setView] = useState<View>(memo.view);
  const [onlyChanges, setOnlyChanges] = useState(memo.onlyChanges);
  const [filter, setFilter] = useState<Set<ChipKind>>(new Set());
  const changeId = useNav((s) => s.changeId);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());

  const fromOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of data.diff.changes) if (c.from) m.set(`${c.kind}|${c.jsonPath}`, c.from);
    return m;
  }, [data]);
  const visible = useMemo(
    () => data.changes.filter((c) => !filter.size || filter.has(chipOf(c))),
    [data, filter],
  );
  const counts = useMemo(() => {
    const n: Record<ChipKind, number> = { added: 0, removed: 0, changed: 0, typeChanged: 0, moved: 0, renamed: 0, nullMissing: 0 };
    for (const c of data.changes) n[chipOf(c)]++;
    return n;
  }, [data]);
  const values = useMemo(() => Math.max(countValues(data.before), countValues(data.after)), [data]);
  const current = Math.max(
    0,
    visible.findIndex((c) => c.id === changeId),
  );
  // Tree (A-07): changes grouped under their container, each group's header once ("flags [ 24 items ] · matched
  // by key"), groups in order of their first change. Keyed items show by key, moves as "index 3 → 11".
  const tree = useMemo(() => {
    const groups = new Map<string, Array<{ c: Change; e: TreeEntry }>>();
    for (const c of visible) {
      const e = treeEntry(c, data);
      const list = groups.get(e.group);
      if (list) list.push({ c, e });
      else groups.set(e.group, [{ c, e }]);
    }
    const out: Array<
      | { type: 'group'; path: string; matchKey?: string | undefined; size: string }
      | { type: 'change'; c: Change; e: TreeEntry }
      | { type: 'context'; key: string; value: string; ignored: boolean }
    > = [];
    for (const [g, list] of groups) {
      if (g !== '$') {
        const v = valueAt(data.after, g) ?? valueAt(data.before, g);
        out.push({ type: 'group', path: g, matchKey: list.find((x) => x.e.matchKey)?.e.matchKey, size: fmt(v) });
      }
      for (const x of list) out.push({ type: 'change', ...x });
    }
    // AJson "Only show changes" off: the top-level keys with no change, as context.
    if (!onlyChanges && data.after && typeof data.after === 'object' && !Array.isArray(data.after)) {
      const touched = new Set(data.changes.map((c) => /^\$(?:\.([^.[]+)|\['((?:[^'\\]|\\.)*)'\])?/.exec(c.jsonPath ?? '$')?.slice(1).find(Boolean)));
      for (const [k, v] of Object.entries(data.after)) {
        if (touched.has(k)) continue;
        const ignored = options.ignoreKeys.includes(k);
        out.push({ type: 'context', key: k, value: ignored ? 'ignored by your rules' : fmt(v), ignored });
      }
    }
    return out;
  }, [visible, data, onlyChanges, options.ignoreKeys]);
  const treeApi = useRef<VirtualListApi>(null);
  const rootKeys =
    data.after && typeof data.after === 'object' && !Array.isArray(data.after)
      ? Object.keys(data.after).length
      : null;


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
      treeApi.current?.scrollToIndex(tree.findIndex((t) => t.type === 'change' && t.c.id === c.id));
      let tries = 0;
      const tick = () => {
        const el = rowRefs.current.get(c.id);
        if (!el && tries++ < 10) return void requestAnimationFrame(tick);
        el?.scrollIntoView({ block: 'nearest' });
        el?.focus({ preventScroll: true });
      };
      requestAnimationFrame(tick);
    },
    [visible, view, tree],
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
      if (c) void copyChangeLink(c.id, toast);
    }, [visible, current, toast]),
  );
  useCommand(
    'mark-viewed',
    useCallback(() => {
      const c = visible[current];
      if (c) toggleViewed(c.id);
    }, [visible, current, toggleViewed]),
  );

  // X-02: the side-by-side line diff runs in a worker; the page stays responsive on large documents.
  const [side, setSide] = useState<{ key: unknown; rows: Row[] } | null>(null);
  const sideKey = useMemo(() => ({ data, order: options.ignoreKeyOrder }), [data, options.ignoreKeyOrder]);
  useEffect(() => {
    if (view !== 'side' || side?.key === sideKey) return;
    const job = startTextDiff(canonical(data.before, options.ignoreKeyOrder), canonical(data.after, options.ignoreKeyOrder));
    let live = true;
    void job.promise.then((rows) => {
      if (live) setSide({ key: sideKey, rows });
    }).catch(() => {});
    return () => {
      live = false;
      job.cancel();
    };
  }, [view, sideKey, side, data, options.ignoreKeyOrder]);
  const sideRows = side?.key === sideKey ? side.rows : null;

  const total = data.changes.length;
  const seen = data.changes.filter((c) => viewed[c.id]).length;
  const dupes = [
    ...data.duplicates.before.map((d) => ({ ...d, file: names.before })),
    ...data.duplicates.after.map((d) => ({ ...d, file: names.after })),
  ];

  const copyExport = async (kind: 'patch' | 'paths') => {
    const f = jsonExport(kind, data, names, options.arrayMatchKey);
    const ok = await copyText(f.content);
    toast(
      ok
        ? { title: kind === 'patch' ? 'JSON Patch copied' : 'JSONPath list copied', description: f.meta, tone: 'success' }
        : { title: 'Couldn’t copy', description: 'Use All export formats → Download instead.', tone: 'error' },
    );
  };

  const copyPath = async (p: string) => {
    const ok = await copyText(p);
    toast(
      ok
        ? { title: 'JSONPath copied', description: p, tone: 'success' }
        : { title: 'Couldn’t copy', description: p, tone: 'error' },
    );
  };

  return (
    <div className={css.diffTab}>
      <header className={css.head}>
        <h1 className={css.h1}>
          {total ? `${total} difference${total === 1 ? '' : 's'}` : 'No differences'}
          {values ? ` in ${values} values` : ''}
        </h1>
        <div className={css.chips} role="group" aria-label="Show only">
          {CHIPS.map((k) => (
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
                {CHIP_SYMBOL[k.kind]}
              </span>
              {k.label} <span className={css.chipCount}>{counts[k.kind]}</span>
            </button>
          ))}
          {values > 0 && (
            <span className={css.chip} data-static="">
              Unchanged <span className={css.chipCount}>{Math.max(0, values - total)}</span>
            </span>
          )}
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
        <div className={css.left}>
          <Options options={options} setOptions={setOptions} data={data} />
          <section className={css.counts} aria-label="Counts">
            <dl>
              {(
                [
                  ['added', counts.added, 'added'],
                  ['removed', counts.removed, 'removed'],
                  ['changed', counts.changed + counts.typeChanged, 'changed'],
                  ['moved', counts.moved, 'moved only'],
                ] as const
              ).map(([kind, n, label]) => (
                <div key={kind} data-kind={kind}>
                  <dt className={css.countLabel}>{label}</dt>
                  <dd className={css.countN}>{n}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

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
                { value: 'raw', label: 'Raw text' },
              ]}
            />
            {view === 'tree' && (
              <Checkbox
                label="Only show changes"
                checked={onlyChanges}
                onCheckedChange={(v) => {
                  memo.onlyChanges = v;
                  setOnlyChanges(v);
                }}
              />
            )}
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
              <VirtualList
                as="ul"
                count={tree.length + (rootKeys !== null ? 1 : 0)}
                estimate={36}
                label="Changes by path, scrollable"
                listLabel="Changes by path"
                listClassName={css.tree}
                apiRef={treeApi}
                render={(i, slot) => {
                  if (rootKeys !== null && i === 0)
                    return (
                      <li key="root" className={css.group} {...slotProps(slot)}>
                        <span className={css.muted}>$</span> {`{ ${rootKeys} key${rootKeys === 1 ? '' : 's'} }`}
                      </li>
                    );
                  const t = tree[i - (rootKeys !== null ? 1 : 0)]!;
                  if (t.type === 'context')
                    return (
                      <li
                        key={`k${t.key}`}
                        className={css.context}
                        {...slotProps(slot, { paddingLeft: 'calc(20px + 16px)' })}
                      >
                        {t.key} <span className={t.ignored ? css.muted : css.size}>{t.value}</span>
                      </li>
                    );
                  return t.type === 'group' ? (
                    <li
                      key={`g${t.path}`}
                      className={css.group}
                      {...slotProps(slot, { paddingLeft: 'calc(20px + 16px)' })}
                    >
                      {humanPath(t.path).replace(/ › /g, '.')} <span className={css.size}>{t.size}</span>
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
                      e={t.e}
                      slot={slot}
                      from={fromOf.get(`${t.c.kind}|${t.c.jsonPath}`)}
                      selected={t.c.id === changeId}
                      viewed={!!viewed[t.c.id]}
                      onViewed={() => toggleViewed(t.c.id)}
                      onCopy={() => void copyPath(t.c.jsonPath ?? '$')}
                      refCb={(el) => {
                        slot?.measure(el);
                        if (el) rowRefs.current.set(t.c.id, el);
                        else rowRefs.current.delete(t.c.id);
                      }}
                    />
                  );
                }}
              />
            ) : (
              <p className={css.none}>
                {total
                  ? 'No changes of the selected kinds.'
                  : 'The documents are equal with these options.'}
              </p>
            ))}
          {view === 'side' && !sideRows && (
            <p className={css.none} role="status">
              Preparing the side-by-side view…
            </p>
          )}
          {view === 'side' && sideRows && (
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

        <div className={css.right}>
          <section className={css.panel} aria-labelledby="json-by-path">
            <h2 id="json-by-path" className={css.panelTitle}>
              Changes by path
            </h2>
            <ul className={css.byPath} aria-label="Changed paths">
              {data.changes.slice(0, BY_PATH_MAX).map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={css.byPathItem}
                    aria-current={c.id === changeId || undefined}
                    onClick={() => go(visible.findIndex((v) => v.id === c.id))}
                  >
                    <span className={css.byPathPath}>
                      <span className={css.dot} data-kind={chipOf(c)} aria-hidden="true" />
                      <code>{c.jsonPath ?? '$'}</code>
                    </span>
                    <span className={css.byPathWhat}>
                      <span className="sd-visually-hidden">{SYMBOL[c.kind]} </span>
                      {describe(c)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {data.changes.length > BY_PATH_MAX && (
              <p className={css.muted}>
                and {data.changes.length - BY_PATH_MAX} more in the tree.
              </p>
            )}
          </section>
          <section className={css.panel} aria-labelledby="json-export">
            <h2 id="json-export" className={css.panelTitle}>
              Export
            </h2>
            <Button
              variant="inverse"
              className={css.exportBtn}
              onClick={() => void copyExport('patch')}
            >
              Copy as JSON Patch
            </Button>
            <Button
              variant="secondary"
              className={css.exportBtn}
              onClick={() => void copyExport('paths')}
            >
              Copy JSONPath list
            </Button>
            <button type="button" className={`sd-link ${css.allFormats}`} onClick={onAllFormats}>
              All export formats
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

const BY_PATH_MAX = 50;

/** AJson "Changes by path": what happened at the path, in words ("changed 3 → 5", "added "disputes""). */
function describe(c: Change): string {
  if (isNullMissing(c)) return c.kind === 'removed' ? 'null → missing' : 'missing → null';
  if (c.kind === 'changed') return c.after === null ? 'set to null' : `changed ${fmt(c.before)} → ${fmt(c.after)}`;
  if (c.kind === 'typeChanged') return `type changed ${typeOf(c.before)} → ${typeOf(c.after)}`;
  if (c.kind === 'added') return `added ${fmt(c.after)}`;
  if (c.kind === 'removed') return 'removed';
  if (c.kind === 'moved' && typeof c.before === 'number' && typeof c.after === 'number')
    return `moved ${c.before} → ${c.after}, not a change`;
  return 'moved, not a change';
}

/** Spread a virtual row's position (and any own style) on a row's root element. */
function slotProps(slot: RowSlot | undefined, style?: React.CSSProperties) {
  return slot
    ? { 'data-index': slot['data-index'], ref: slot.measure, style: { ...slot.style, ...style } }
    : style
      ? { style }
      : {};
}

function ChangeRow({
  c,
  e,
  slot,
  from,
  selected,
  viewed,
  onViewed,
  onCopy,
  refCb,
}: {
  c: Change;
  e: TreeEntry;
  slot: RowSlot | undefined;
  from: string | undefined;
  selected: boolean;
  viewed: boolean;
  onViewed: () => void;
  onCopy: () => void;
  refCb: (el: HTMLLIElement | null) => void;
}) {
  const path = c.jsonPath ?? '$';
  const nullMissing = isNullMissing(c);
  return (
    // tabIndex -1: the row is a focus target for J/K; its controls are the buttons inside.
    <li
      ref={refCb}
      {...(slot ? { 'data-index': slot['data-index'] } : {})}
      className={css.row}
      data-kind={c.kind}
      data-viewed={viewed || undefined}
      aria-current={selected || undefined}
      tabIndex={-1}
      style={{ ...slot?.style, paddingLeft: e.group === '$' ? 'calc(20px + 16px)' : 'calc(2 * 20px + 16px)' }}
    >
      <span className={css.sym} aria-hidden="true">
        {SYMBOL[c.kind]}
      </span>
      <span className={css.main}>
        <span className={css.line}>
          <span className={css.key}>{e.label}</span>{' '}
          {e.inner ? (
            <>
              <span className={css.muted}>{'{ … }'}</span> <span className={css.key}>{e.inner}:</span>{' '}
            </>
          ) : null}
          {e.move ? (
            <span className={css.value}>
              {'{ … }'}{' '}
              <span className={css.muted}>
                index {e.move.from} → {e.move.to}, moved, not a change
              </span>
            </span>
          ) : (
            <Value c={c} from={from} />
          )}
        </span>
      </span>
      <span className={css.meta}>
        {c.kind === 'typeChanged' && (
          <span className={css.detail}>
            {typeOf(c.before)} → {typeOf(c.after)}
          </span>
        )}
        {nullMissing ? <span className={css.nullPill}>null ≠ missing</span> : <DiffMarker kind={MARKER[c.kind]} />}
        {/* A07-JsonTree: one line per change; the JSONPath is in "Changes by path" and on this button (JS-05). */}
        <button
          type="button"
          className={css.copy}
          title={path}
          onClick={(e) => {
            e.stopPropagation();
            onCopy();
          }}
          aria-label={`Copy JSONPath ${path}`}
        >
          <icons.Copy size={13} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={css.viewed}
          aria-pressed={viewed}
          aria-label={`Viewed: ${humanPath(path)}`}
          title="Viewed"
          onClick={(e) => {
            e.stopPropagation();
            onViewed();
          }}
        >
          {viewed ? <icons.CheckSquare size={15} aria-hidden="true" /> : <icons.Square size={15} aria-hidden="true" />}
        </button>
      </span>
    </li>
  );
}

function Value({ c, from }: { c: Change; from: string | undefined }) {
  if (isNullMissing(c))
    return (
      <span className={css.value}>
        {c.kind === 'removed' ? (
          <>
            <del className={css.del}>null</del> → <ins className={css.ins}>(missing)</ins>
          </>
        ) : (
          <>
            <del className={css.del}>(missing)</del> → <ins className={css.ins}>null</ins>
          </>
        )}
      </span>
    );
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
      <h2 id="json-options" className={css.panelTitle}>
        Compare options
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
  matchKey,
}: {
  data: JsonResultData;
  names: { before: string; after: string };
  matchKey: string;
}) {
  const { toast } = useToast();
  const [format, setFormat] = useState<JsonExportKind>(memo.format);
  const file = useMemo(() => jsonExport(format, data, names, matchKey), [format, data, names, matchKey]);
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
          {file.preview ?? file.content}
        </pre>
        {file.preview !== undefined && file.preview !== file.content && (
          <p className="sd-visually-hidden">Long values are shortened in this preview; Copy and Download give the whole file.</p>
        )}
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
