// A-08 Markdown (MD-01..MD-07): rendered diff with word-level <ins>/<del>, source and side-by-side
// views, outline with change markers, changed links, code blocks as line diffs, broken anchors.
import { Config } from '@specdiff/core';
import type { BlockStatus, MdBlock, MdDiff } from '@specdiff/core/markdown';
import { diffText } from '@specdiff/core/text';
import { IdenticalState, SegmentedControl, Tooltip, useToast } from '@specdiff/ui';
import * as icons from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCommand } from '../../shell/commands';
import { changeLink, focusChange, readChangeHash } from '../../shell/nav';
import { useApp } from '../../state/store';
import { DiffRows } from '../json/DiffRows';
import { blockLabel } from './summary';
import css from './MarkdownResult.module.css';

type View = 'rendered' | 'source' | 'side';
const memo: { view: View } = { view: 'rendered' };

const STATUS_SYM: Record<BlockStatus, string> = { added: '+', removed: '−', edited: '~', same: '' };
const STATUS_WORD: Record<BlockStatus, string> = {
  added: 'added',
  removed: 'removed',
  edited: 'edited',
  same: 'unchanged',
};
const blockId = (i: number) => `md-block-${i}`;

/** Core renders through remark-rehype + rehype-sanitize (GitHub schema + ins/del), so this HTML is safe. */
function Html({ html, className }: { html: string; className?: string | undefined }) {
  return (
    <div
      className={className}
      // eslint-disable-next-line no-restricted-syntax -- sanitised by rehype-sanitize in @specdiff/core/markdown
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

const changeIdOf = (i: number) => `m-${i}`;

export default function MarkdownResult() {
  const { result, before, after, viewed, toggleViewed } = useApp();
  const { toast } = useToast();
  const md = result && 'markdown' in result ? result.markdown : null;
  const [view, setView] = useState<View>(memo.view);
  // X-12: start on the block named in the URL hash (#change=m-<n>), if it changed.
  const [current, setCurrent] = useState(() => {
    const id = readChangeHash();
    const i = id?.startsWith('m-') ? Number(id.slice(2)) : -1;
    const changedNow = md ? md.blocks.map((b, k) => (b.status === 'same' ? -1 : k)).filter((k) => k >= 0) : [];
    return changedNow.indexOf(i);
  });
  const changed = useMemo(
    () => (md ? md.blocks.map((b, i) => (b.status === 'same' ? -1 : i)).filter((i) => i >= 0) : []),
    [md],
  );

  const jump = useCallback(
    (i: number) => {
      if (view === 'source') {
        memo.view = 'rendered';
        setView('rendered');
      }
      requestAnimationFrame(() => {
        const el = document.getElementById(blockId(i));
        el?.scrollIntoView({ block: 'center' });
        el?.focus({ preventScroll: true });
      });
    },
    [view],
  );
  const go = useCallback(
    (d: number) => {
      if (!changed.length) return;
      const n = (current + d + changed.length) % changed.length;
      setCurrent(n);
      focusChange(changeIdOf(changed[n]!)); // X-12
      jump(changed[n]!);
    },
    [changed, current, jump],
  );
  useCommand(
    'next-change',
    useCallback(() => go(1), [go]),
  );
  useCommand(
    'prev-change',
    useCallback(() => go(-1), [go]),
  );
  // X-11: mark the current changed block as viewed; X-12: copy a link to it, open the linked one on load.
  const at = current >= 0 ? changed[current] : changed[0];
  useCommand('mark-viewed', useCallback(() => { if (at !== undefined) toggleViewed(changeIdOf(at)); }, [at, toggleViewed]));
  useCommand('copy-link', useCallback(() => { if (at !== undefined) void navigator.clipboard?.writeText(changeLink(changeIdOf(at))).then(() => toast({ title: 'Link to this change copied' })); }, [at, toast]));
  useEffect(() => {
    const id = readChangeHash();
    const i = id?.startsWith('m-') ? Number(id.slice(2)) : -1;
    if (i < 0) return;
    const el = document.getElementById(blockId(i));
    el?.scrollIntoView({ block: 'center' });
    el?.focus({ preventScroll: true });
  }, []);

  if (!md || !result) return null;
  if (!changed.length) return <IdenticalState ignoredLines={0} />;
  const seen = changed.filter((i) => viewed[changeIdOf(i)]).length;
  const names = { before: before?.name ?? 'before', after: after?.name ?? 'after' };
  const links = md.blocks.flatMap((b) => b.links ?? []);
  const codes = md.blocks.filter((b) => b.code && b.status === 'edited').length;
  const headingBlocks = md.blocks.flatMap((b, i) => (b.heading ? [i] : []));

  return (
    <div className={css.page}>
      <nav className={css.outline} aria-labelledby="md-outline">
        <h2 id="md-outline" className={css.label}>
          Outline
        </h2>
        {md.outline.length ? (
          <ul className={css.outlineList}>
            {md.outline.map((h, k) => {
              // core builds the outline from the heading blocks, in order.
              const i = headingBlocks[k] ?? 0;
              return (
                <li key={`${h.slug}-${k}`}>
                  <button
                    type="button"
                    className={css.outlineItem}
                    data-status={h.status}
                    style={{ paddingLeft: `calc(${h.depth - 1} * 14px + 10px)` }}
                    onClick={() => jump(i)}
                  >
                    <span className={css.dot} data-status={h.status} aria-hidden="true">
                      {STATUS_SYM[h.status]}
                    </span>
                    <span className={h.status === 'removed' ? css.struck : undefined}>{h.text}</span>
                    {h.status !== 'same' && (
                      <span className="sd-visually-hidden"> ({STATUS_WORD[h.status]})</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={css.muted}>No headings.</p>
        )}
      </nav>

      <section className={css.card} aria-label="Markdown differences">
        <div className={css.toolbar}>
          <SegmentedControl
            label="View"
            value={view}
            onValueChange={(v) => {
              memo.view = v;
              setView(v);
            }}
            options={[
              { value: 'rendered', label: 'Rendered' },
              { value: 'source', label: 'Source' },
              { value: 'side', label: 'Side by side' },
            ]}
          />
          <span className={css.hint}>word-level highlights</span>
        </div>
        {view === 'rendered' && (
          <div className={css.doc}>
            {md.blocks.map((b, i) => (
              <Block key={i} b={b} i={i} viewed={!!viewed[changeIdOf(i)]} onViewed={() => toggleViewed(changeIdOf(i))} />
            ))}
          </div>
        )}
        {view === 'side' && <SideBySide md={md} />}
        {view === 'source' && (
          <DiffRows
            rows={'text' in result ? result.text.rows : []}
            beforeName={names.before}
            afterName={names.after}
            label={`Source: ${names.before} and ${names.after}`}
          />
        )}
      </section>

      <aside className={css.side}>
        <section className={css.panel} aria-labelledby="md-summary">
          <h2 id="md-summary" className={css.label}>
            Summary
          </h2>
          <dl className={css.stats}>
            {(
              [
                ['Blocks added', md.stats.added],
                ['Blocks removed', md.stats.removed],
                ['Blocks edited', md.stats.edited],
                ['Links changed', links.length],
                ['Code blocks changed', codes],
                ['Viewed', `${seen} of ${changed.length}`],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className={css.panel} aria-labelledby="md-checks">
          <h2 id="md-checks" className={css.checksTitle}>
            Checks
          </h2>
          {md.brokenAnchors.map((a, k) => (
            <div key={k} className={css.check} data-tone="breaking">
              <icons.TriangleAlert size={14} aria-hidden="true" />
              <div>
                <p className={css.checkTitle}>Broken anchor</p>
                <p>
                  <code>#{a.anchor}</code> is linked from line {a.line}, but{' '}
                  {a.renamedTo ? (
                    <>
                      that heading was renamed from <code>#{a.renamedFrom ?? a.anchor}</code> to{' '}
                      <code>#{a.renamedTo}</code>.
                    </>
                  ) : a.renamedFrom ? (
                    'that heading was removed.'
                  ) : (
                    'no heading has that anchor.'
                  )}
                </p>
              </div>
            </div>
          ))}
          {links.length > 0 && (
            <div className={css.check}>
              <icons.Link size={14} aria-hidden="true" />
              <div>
                <p className={css.checkTitle}>
                  {links.length} link{links.length === 1 ? '' : 's'} changed
                </p>
                <ul className={css.linkList}>
                  {links.map((l, k) => (
                    <li key={k}>
                      {l.text && <span>{l.text}: </span>}
                      <code>{l.before || '(none)'}</code> → <code>{l.after}</code>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          {codes > 0 && (
            <div className={css.check}>
              <icons.Code size={14} aria-hidden="true" />
              <div>
                <p className={css.checkTitle}>
                  {codes} code block{codes === 1 ? '' : 's'} changed
                </p>
                <p>Shown as a line diff in Rendered view.</p>
              </div>
            </div>
          )}
          {!md.brokenAnchors.length && !links.length && !codes && (
            <p className={css.muted}>No broken anchors, changed links or code blocks.</p>
          )}
        </section>
      </aside>
    </div>
  );
}

function Block({ b, i, viewed, onViewed }: { b: MdBlock; i: number; viewed: boolean; onViewed: () => void }) {
  return (
    // tabIndex -1: outline and J/K move focus here.
    <div id={blockId(i)} className={css.block} data-status={b.status} tabIndex={-1}>
      {b.status !== 'same' && (
        <span className={css.gutter} aria-hidden="true">
          {STATUS_SYM[b.status]}
        </span>
      )}
      {b.status !== 'same' && (
        <span className="sd-visually-hidden">
          {b.status === 'edited' ? 'Edited' : b.status === 'added' ? 'Added' : 'Removed'} {b.type}:
        </span>
      )}
      {b.status !== 'same' && (
        <button type="button" className={css.viewedBtn} aria-pressed={viewed} onClick={onViewed}>
          {viewed ? <icons.CheckSquare size={14} aria-hidden="true" /> : <icons.Square size={14} aria-hidden="true" />} Viewed
        </button>
      )}
      {b.code && b.status === 'edited' ? <CodeDiff code={b.code} /> : <Html html={b.html} className={css.md} />}
      {b.links?.map((l, k) => (
        <Tooltip
          key={k}
          content={
            <span className={css.tip}>
              Link changed
              <br />
              <span className={css.tipBefore}>{l.before || '(none)'}</span> →{' '}
              <span className={css.tipAfter}>{l.after}</span>
            </span>
          }
        >
          <button type="button" className={css.linkChip}>
            <icons.Link size={12} aria-hidden="true" /> Link changed: {l.text || l.after}
            <span className="sd-visually-hidden">
              , from {l.before || 'none'} to {l.after}
            </span>
          </button>
        </Tooltip>
      ))}
    </div>
  );
}

function CodeDiff({ code }: { code: NonNullable<MdBlock['code']> }) {
  const rows = useMemo(
    () => diffText(code.before, code.after, Config.parse({}).text).rows,
    [code],
  );
  return (
    <pre className={css.code} aria-label={`Code block${code.lang ? ` (${code.lang})` : ''}, line diff`}>
      {rows.flatMap((r, k) => {
        const text = (s: NonNullable<typeof r.left>) => s.segs.map((x) => x.text).join('');
        if (r.type === 'same') return [<span key={k} className={css.codeLine}>{'  '}{text(r.left!)}{'\n'}</span>];
        const out = [];
        if (r.left)
          out.push(
            <span key={`${k}d`} className={css.codeLine} data-kind="del">
              {'− '}
              {text(r.left)}
              <span className="sd-visually-hidden"> (removed)</span>
              {'\n'}
            </span>,
          );
        if (r.right)
          out.push(
            <span key={`${k}a`} className={css.codeLine} data-kind="add">
              {'+ '}
              {text(r.right)}
              <span className="sd-visually-hidden"> (added)</span>
              {'\n'}
            </span>,
          );
        return out;
      })}
    </pre>
  );
}

function SideBySide({ md }: { md: MdDiff }) {
  return (
    <div className={css.sbs}>
      {md.blocks.map((b, i) => {
        const marked = b.status === 'edited' && !b.code;
        const left = b.status === 'added' ? '' : marked ? leftMarks(b) : (b.beforeHtml ?? b.html);
        const right = b.status === 'removed' ? '' : marked ? rightMarks(b) : b.html;
        return (
          <div key={i} className={css.sbsRow} data-status={b.status}>
            <div className={css.sbsCell} data-side="before">
              {left ? <Html html={left} className={css.md} /> : null}
            </div>
            <div className={css.sbsCell} data-side="after">
              {right ? <Html html={right} className={css.md} /> : null}
            </div>
            {b.status !== 'same' && (
              <span className="sd-visually-hidden">
                {STATUS_WORD[b.status]} {b.type}: {blockLabel(b)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// The edited block's html marks both insertions and deletions; split them per side.
const leftMarks = (b: MdBlock) => b.html.replace(/<ins>[\s\S]*?<\/ins>/g, '');
const rightMarks = (b: MdBlock) => b.html.replace(/<del>[\s\S]*?<\/del>/g, '');
