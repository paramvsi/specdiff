// A-08 Markdown (MD-01..MD-07): rendered diff with word-level <ins>/<del>, source and side-by-side
// views, outline with change markers, changed links, code blocks as line diffs, broken anchors.
import { Config } from '@specdiff/core';
import type { BlockStatus, MdBlock, MdDiff } from '@specdiff/core/markdown';
import { diffText } from '@specdiff/core/text';
import { SegmentedControl, Tooltip, useToast } from '@specdiff/ui';
import * as icons from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type Ref } from 'react';
import { NARROW, useMedia } from '../../lib/media';
import { VirtualList, type RowSlot, type VirtualListApi } from '../../lib/VirtualList';
import { useCommand } from '../../shell/commands';
import { focusChange, readChangeHash, useNav } from '../../shell/nav';
import { copyChangeLink } from '../changeLink';
import { useApp } from '../../state/store';
import { DiffRows } from '../json/DiffRows';
import { blockLabel, sectionsOf } from './summary';
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

/**
 * X-06: word-level changes are never colour alone. Each <ins>/<del> starts with hidden text ("inserted:",
 * "deleted:") for screen readers; underline / strike-through and the block's + / − gutter are the visible cues.
 * The added markup is fixed text, so the sanitised HTML stays safe.
 */
export function withChangeCues(html: string): string {
  return html
    // A deletion straight before an insertion ("cents" → "the smallest…") reads as two words, not "centsthe".
    .replace(/<\/del><ins>/g, '</del> <ins>')
    .replace(/<ins>/g, '<ins><span class="sd-visually-hidden">inserted: </span>')
    .replace(/<del>/g, '<del><span class="sd-visually-hidden">deleted: </span>');
}

/** Core renders through remark-rehype + rehype-sanitize (GitHub schema + ins/del), so this HTML is safe. */
function Html({ html, className }: { html: string; className?: string | undefined }) {
  return (
    <div
      className={className}
      // eslint-disable-next-line no-restricted-syntax -- sanitised by rehype-sanitize in @specdiff/core/markdown
      dangerouslySetInnerHTML={{ __html: withChangeCues(html) }}
    />
  );
}

const changeIdOf = (i: number) => `m-${i}`;
/** Links as the designs show them: no scheme ("docs.example.com/v1"). */
export const shortUrl = (u: string) => u.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');

/**
 * MD-03: a section's status for the outline: its heading's own status when the heading was added, removed or
 * renamed, else edited when any block up to the next heading changed.
 */
export function sectionStatuses(blocks: MdBlock[]): BlockStatus[] {
  const out: BlockStatus[] = [];
  blocks.forEach((b) => {
    if (b.heading) out.push(b.status);
    else if (b.status !== 'same' && out.length && out[out.length - 1] === 'same') out[out.length - 1] = 'edited';
  });
  return out;
}

export default function MarkdownResult() {
  const { result, before, after, viewed, toggleViewed } = useApp();
  const { toast } = useToast();
  const md = result && 'markdown' in result ? result.markdown : null;
  const [view, setView] = useState<View>(memo.view);
  // M-16: below 720 px two columns are too narrow; Side by side becomes a Before / After toggle.
  const narrow = useMedia(NARROW);
  const [side, setSide] = useState<'before' | 'after'>('after');
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

  const listApi = useRef<VirtualListApi>(null);
  const jump = useCallback(
    (i: number) => {
      if (view === 'source') {
        memo.view = 'rendered';
        setView('rendered');
      }
      listApi.current?.scrollToIndex(i);
      let tries = 0;
      const tick = () => {
        const el = document.getElementById(blockId(i));
        if (!el && tries++ < 10) return void requestAnimationFrame(tick);
        el?.scrollIntoView({ block: 'center' });
        el?.focus({ preventScroll: true });
      };
      requestAnimationFrame(tick);
    },
    [view],
  );
  // The change id this screen last navigated to; others come from outside (the command palette).
  const handled = useRef<string | null>(useNav.getState().changeId);
  const go = useCallback(
    (d: number) => {
      if (!changed.length) return;
      const n = (current + d + changed.length) % changed.length;
      setCurrent(n);
      handled.current = changeIdOf(changed[n]!);
      focusChange(changeIdOf(changed[n]!)); // X-12
      jump(changed[n]!);
    },
    [changed, current, jump],
  );
  // The palette (and other screens) call focusChange(id): follow it here too.
  useEffect(
    () =>
      useNav.subscribe((st) => {
        const id = st.changeId;
        if (!id || id === handled.current || !id.startsWith('m-')) return;
        handled.current = id;
        const k = changed.indexOf(Number(id.slice(2)));
        if (k < 0) return;
        setCurrent(k);
        jump(changed[k]!);
      }),
    [changed, jump],
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
  useCommand('copy-link', useCallback(() => { if (at !== undefined) void copyChangeLink(changeIdOf(at), toast); }, [at, toast]));
  useEffect(() => {
    const id = readChangeHash();
    const i = id?.startsWith('m-') ? Number(id.slice(2)) : -1;
    if (i < 0) return;
    const el = document.getElementById(blockId(i));
    el?.scrollIntoView({ block: 'center' });
    el?.focus({ preventScroll: true });
  }, []);

  // X-08: the identical state is Result's (it can show the formatting-only changes).
  if (!md || !result || !changed.length) return null;
  const seen = changed.filter((i) => viewed[changeIdOf(i)]).length;
  const names = { before: before?.name ?? 'before', after: after?.name ?? 'after' };
  const links = md.blocks.flatMap((b) => b.links ?? []);
  const codes = md.blocks.filter((b) => b.code && b.status === 'edited').length;
  const headingBlocks = md.blocks.flatMap((b, i) => (b.heading ? [i] : []));
  const sectionStatus = sectionStatuses(md.blocks);
  // The outline item of the section that holds the current change (AMarkdown: highlighted).
  const currentSection = at === undefined ? -1 : headingBlocks.filter((h) => h <= at).length - 1;
  const goToLine = (line: number) => {
    const k = md.blocks.findIndex((b) => b.lines.after && line >= b.lines.after[0] && line <= b.lines.after[1]);
    if (k >= 0) jump(k);
  };

  return (
    <div className={css.page} data-view={view}>
      <nav className={css.outline} aria-labelledby="md-outline">
        <h2 id="md-outline" className={css.label}>
          Outline
        </h2>
        {md.outline.length ? (
          <ul className={css.outlineList}>
            {md.outline.map((h, k) => {
              // core builds the outline from the heading blocks, in order.
              const i = headingBlocks[k] ?? 0;
              const st = sectionStatus[k] ?? h.status;
              return (
                <li key={`${h.slug}-${k}`}>
                  <button
                    type="button"
                    className={css.outlineItem}
                    data-status={st}
                    aria-current={k === currentSection ? 'location' : undefined}
                    style={{ paddingLeft: `calc(${h.depth - 1} * 14px + 10px)` }}
                    onClick={() => jump(i)}
                  >
                    <span className={css.dot} data-status={st} aria-hidden="true">
                      {STATUS_SYM[st]}
                    </span>
                    <span className={st === 'removed' ? css.struck : undefined}>{h.text}</span>
                    {st !== 'same' && <span className="sd-visually-hidden"> ({STATUS_WORD[st]})</span>}
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
            value={narrow && view === 'side' ? side : view}
            onValueChange={(v: View | 'before' | 'after') => {
              const next: View = v === 'before' || v === 'after' ? 'side' : v;
              if (v === 'before' || v === 'after') setSide(v);
              memo.view = next;
              setView(next);
            }}
            options={[
              { value: 'rendered', label: 'Rendered' },
              { value: 'source', label: 'Source' },
              ...(narrow
                ? [{ value: 'before' as const, label: 'Before' }, { value: 'after' as const, label: 'After' }]
                : [{ value: 'side' as const, label: 'Side by side' }]),
            ]}
          />
          <span className={css.hint}>word-level highlights</span>
        </div>
        {view === 'rendered' && (
          <VirtualList
            count={md.blocks.length}
            estimate={60}
            label="Rendered Markdown, scrollable"
            className={css.docScroll}
            listClassName={css.doc}
            apiRef={listApi}
            render={(i, slot) => (
              <Block
                key={i}
                b={md.blocks[i]!}
                i={i}
                slot={slot}
                viewed={!!viewed[changeIdOf(i)]}
                onViewed={() => toggleViewed(changeIdOf(i))}
              />
            )}
          />
        )}
        {view === 'side' && <SideBySide md={md} apiRef={listApi} {...(narrow ? { only: side } : {})} />}
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
        <section className={`${css.panel} ${css.summary}`} aria-labelledby="md-summary">
          <h2 id="md-summary" className={css.label}>
            Summary
          </h2>
          <dl className={css.stats}>
            {(
              [
                // AMarkdown: counts are sections (a heading and its blocks); older saved results only have blocks.
                ...(sectionsOf(md)
                  ? ([
                      ['Sections added', sectionsOf(md)!.added],
                      ['Sections removed', sectionsOf(md)!.removed],
                      ['Sections edited', sectionsOf(md)!.edited],
                    ] as const)
                  : ([
                      ['Blocks added', md.stats.added],
                      ['Blocks removed', md.stats.removed],
                      ['Blocks edited', md.stats.edited],
                    ] as const)),
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
                {k === 0 && (
                  <p className={css.checkTitle}>
                    {md.brokenAnchors.length} broken anchor{md.brokenAnchors.length === 1 ? '' : 's'}
                  </p>
                )}
                <p>
                  <code>#{a.anchor}</code> is linked from line {a.line}, but{' '}
                  {a.renamedTo ? (
                    <>that heading was renamed to {headingText(md, a.renamedTo)}.</>
                  ) : a.renamedFrom ? (
                    'that heading was removed.'
                  ) : (
                    'no heading has that anchor.'
                  )}
                </p>
                <button type="button" className={css.checkLink} onClick={() => goToLine(a.line)}>
                  Go to the link
                </button>
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
                      {l.text && <span className="sd-visually-hidden">{l.text}: </span>}
                      <code>{l.before ? shortUrl(l.before) : '(none)'}</code> → <code>{shortUrl(l.after)}</code>
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
                <p>Shown as a line diff in Rendered and Source view.</p>
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

const headingText = (md: MdDiff, slug: string) => md.outline.find((h) => h.slug === slug)?.text ?? `#${slug}`;

/**
 * MD-04: a changed link is marked in the text (wavy underline) and shows "Link changed · before → after" in a
 * tooltip on hover or focus (Escape hides it, WCAG 1.4.13). Links the rendered HTML has no <a> for (images)
 * keep a chip with the same tooltip.
 */
function useLinkTips(b: MdBlock, i: number) {
  const root = useRef<HTMLDivElement | null>(null);
  const [inline, setInline] = useState<number[]>([]);
  const [open, setOpen] = useState<{ k: number; left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || !b.links?.length) return;
    const anchors = [...el.querySelectorAll<HTMLAnchorElement>('a[href]')];
    const found: number[] = [];
    b.links.forEach((l, k) => {
      const a = anchors.find((x) => x.getAttribute('href') === l.after && (x.dataset.linkChanged ?? String(k)) === String(k));
      if (!a) return;
      a.dataset.linkChanged = String(k);
      a.setAttribute('aria-describedby', `${blockId(i)}-link-${k}`);
      found.push(k);
    });
    setInline(found);
  }, [b, i]);
  const show = (t: EventTarget) => {
    const a = t instanceof Element ? t.closest<HTMLElement>('[data-link-changed]') : null;
    const box = root.current?.parentElement;
    if (!a || !box) return;
    const r = a.getBoundingClientRect(), o = box.getBoundingClientRect();
    setOpen({ k: Number(a.dataset.linkChanged), left: Math.max(0, r.left - o.left), top: r.bottom - o.top + 6 });
  };
  const handlers = {
    onMouseOver: (e: MouseEvent) => show(e.target),
    onMouseOut: (e: MouseEvent) => { if (e.target instanceof Element && e.target.closest('[data-link-changed]')) setOpen(null); },
    onFocus: (e: FocusEvent) => show(e.target),
    onBlur: () => setOpen(null),
    onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(null); } },
  };
  return { root, inline, open, handlers };
}

function Block({ b, i, slot, viewed, onViewed }: { b: MdBlock; i: number; slot?: RowSlot | undefined; viewed: boolean; onViewed: () => void }) {
  const { root: tipRoot, inline: tipInline, open: tipOpen, handlers: tipHandlers } = useLinkTips(b, i);
  return (
    // tabIndex -1: outline and J/K move focus here.
    <div
      id={blockId(i)}
      className={css.block}
      data-status={b.status}
      tabIndex={-1}
      {...tipHandlers}
      {...(slot ? { ref: slot.measure, 'data-index': slot['data-index'], style: slot.style } : {})}
    >
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
      {b.code && b.status === 'edited' ? (
        <CodeDiff code={b.code} />
      ) : (
        <div ref={tipRoot}>
          <Html html={b.html} className={css.md} />
        </div>
      )}
      {b.links?.map((l, k) =>
        tipInline.includes(k) ? (
          <span key={k}>
            {/* The link's description: plain words, always in the DOM (aria-describedby). */}
            <span id={`${blockId(i)}-link-${k}`} hidden>
              Link changed from {l.before ? shortUrl(l.before) : 'none'} to {shortUrl(l.after)}
            </span>
            <span
              role="tooltip"
              className={css.linkTip}
              hidden={tipOpen?.k !== k}
              style={tipOpen?.k === k ? { left: tipOpen.left, top: tipOpen.top } : undefined}
            >
              <span className={css.linkTipTitle}>Link changed</span>
              <span className={css.tip}>
                <span className={css.tipBefore}>{l.before ? shortUrl(l.before) : '(none)'}</span> →{' '}
                <span className={css.tipAfter}>{shortUrl(l.after)}</span>
              </span>
            </span>
          </span>
        ) : (
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
        ),
      )}
    </div>
  );
}

function CodeDiff({ code }: { code: NonNullable<MdBlock['code']> }) {
  const rows = useMemo(
    () => diffText(code.before, code.after, Config.parse({}).text).rows,
    [code],
  );
  return (
    <pre
      className={css.code}
      aria-label={`Code block${code.lang ? ` (${code.lang})` : ''}, line diff`}
      // Long lines scroll sideways; the block must be reachable by keyboard (axe scrollable-region-focusable).
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
    >
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

function SideBySide({ md, apiRef, only }: { md: MdDiff; apiRef: Ref<VirtualListApi>; only?: 'before' | 'after' }) {
  return (
    <VirtualList
      count={md.blocks.length}
      estimate={60}
      label={only ? `${only === 'before' ? 'Before' : 'After'}, scrollable` : 'Side by side, scrollable'}
      className={css.docScroll}
      listClassName={css.sbs}
      apiRef={apiRef}
      render={(i, slot) => {
        const b = md.blocks[i]!;
        const marked = b.status === 'edited' && !b.code;
        const left = b.status === 'added' ? '' : marked ? leftMarks(b) : (b.beforeHtml ?? b.html);
        const right = b.status === 'removed' ? '' : marked ? rightMarks(b) : b.html;
        return (
          <div
            key={i}
            id={`sbs-${blockId(i)}`}
            className={css.sbsRow}
            data-status={b.status}
            {...(only ? { 'data-only': only } : {})}
            {...(slot ? { ref: slot.measure, 'data-index': slot['data-index'], style: slot.style } : {})}
          >
            <div className={css.sbsCell} data-side="before">
              {left && b.status !== 'same' && (
                <span className={css.sbsGutter} aria-hidden="true">
                  {b.status === 'edited' ? '~' : '−'}
                </span>
              )}
              {left ? <Html html={left} className={css.md} /> : null}
            </div>
            <div className={css.sbsCell} data-side="after">
              {right && b.status !== 'same' && (
                <span className={css.sbsGutter} aria-hidden="true">
                  {b.status === 'edited' ? '~' : '+'}
                </span>
              )}
              {right ? <Html html={right} className={css.md} /> : null}
            </div>
            {b.status !== 'same' && (
              <span className="sd-visually-hidden">
                {STATUS_WORD[b.status]} {b.type}: {blockLabel(b)}
              </span>
            )}
          </div>
        );
      }}
    />
  );
}

// The edited block's html marks both insertions and deletions; split them per side.
const leftMarks = (b: MdBlock) => b.html.replace(/<ins>[\s\S]*?<\/ins>/g, '');
const rightMarks = (b: MdBlock) => b.html.replace(/<del>[\s\S]*?<\/del>/g, '');
