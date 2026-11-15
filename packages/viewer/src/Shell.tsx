// Viewer shell: header (brand, title, version picker VW-07, theme, Copy for LLM, Download spec)
// and the left nav (VW-01), virtualised when long.
import { Button, Kbd, Logo, ViewerBadge } from '@specdiff/ui';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, Copy, Download, Menu as MenuIcon, Moon, Search, Sun } from 'lucide-react';
import { useRef } from 'react';
import { useViewer } from './context';
import type { Route } from './hooks';
import type { Op, SchemaEntry } from './model';
import { NavMethod, cx } from './parts';
import type { Brand, ViewerVersion } from './types';
import css from './Viewer.module.css';

type NavRow =
  | { kind: 'top'; label: string; route: Route; count?: number | undefined }
  | { kind: 'group'; label: string }
  | { kind: 'op'; op: Op }
  | { kind: 'schema'; s: SchemaEntry };

const VIRTUAL_FROM = 200;

function isActive(route: Route, row: NavRow): boolean {
  if (row.kind === 'top') return row.route.page === route.page;
  if (row.kind === 'op') return route.page === 'op' && route.slug === row.op.slug;
  if (row.kind === 'schema') return route.page === 'schema' && route.slug === row.s.slug;
  return false;
}

export function Nav({ route, onSearch, onNavigate }: { route: Route; onSearch: () => void; onNavigate?: (() => void) | undefined }) {
  const v = useViewer();
  const m = v.cur.model;
  const changeCount = v.report?.status === 'ready' ? v.report.report.summary.total : undefined;
  const rows: NavRow[] = [
    { kind: 'top', label: 'Overview', route: { page: 'overview' } },
    ...(v.loaded.length > 1 || v.prev || v.compareWith ? [{ kind: 'top' as const, label: 'What changed', route: { page: 'changes' } as Route, count: changeCount }] : []),
    { kind: 'top', label: 'Authentication', route: { page: 'auth' } },
    ...m.tags.flatMap((t): NavRow[] => [{ kind: 'group', label: t.name }, ...t.ops.map((op): NavRow => ({ kind: 'op', op }))]),
    ...(m.schemas.length ? [{ kind: 'group' as const, label: 'Schemas' }, ...m.schemas.map((s): NavRow => ({ kind: 'schema', s }))] : []),
  ];
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtual = rows.length > VIRTUAL_FROM;
  // eslint-disable-next-line react-hooks/incompatible-library
  const virt = useVirtualizer({ count: virtual ? rows.length : 0, getScrollElement: () => scrollRef.current, estimateSize: (i) => (rows[i]?.kind === 'group' ? 40 : 35), overscan: 12 });

  const renderRow = (row: NavRow) => {
    const active = isActive(route, row);
    if (row.kind === 'group') return <p className={css.navGroup}>{row.label}</p>;
    const href = row.kind === 'top' ? v.href(row.route) : row.kind === 'op' ? v.href({ page: 'op', slug: row.op.slug, tab: 'docs' }) : v.href({ page: 'schema', slug: row.s.slug });
    const dim = row.kind === 'op' && v.myEndpoints && !v.myEndpoints.has(row.op.key);
    const badge = row.kind === 'op' ? v.index.ops.get(row.op.key) : row.kind === 'schema' ? v.index.schemas.get(row.s.name) : undefined;
    return (
      <a
        href={href}
        className={cx(css.navItem, active && (row.kind === 'top' ? css.navTopActive : css.navActive), dim && css.navDim, row.kind === 'schema' && css.navSchema)}
        aria-current={active ? 'page' : undefined}
        onClick={onNavigate}
      >
        {row.kind === 'op' ? <NavMethod method={row.op.method} /> : null}
        <span className={css.navLabel}>{row.kind === 'top' ? row.label : row.kind === 'op' ? row.op.summary ?? row.op.path : row.s.name}</span>
        {row.kind === 'top' && row.count !== undefined ? <span className={css.navCount}>{row.count}</span> : null}
        {badge ? <ViewerBadge kind={badge} className={css.navBadge} /> : null}
      </a>
    );
  };

  return (
    <nav className={css.nav} aria-label="API reference">
      <button type="button" className={css.navSearch} onClick={onSearch} aria-keyshortcuts="/">
        <Search aria-hidden="true" size={14} />
        <span>Search</span>
        <Kbd>/</Kbd>
      </button>
      <div ref={scrollRef} className={cx(css.navScroll, virtual && css.navScrollVirtual)}>
        {virtual ? (
          <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
            {virt.getVirtualItems().map((it) => (
              <div key={it.key} data-index={it.index} ref={virt.measureElement} style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${it.start}px)` }}>
                {renderRow(rows[it.index]!)}
              </div>
            ))}
          </div>
        ) : (
          rows.map((row, i) => <div key={i}>{renderRow(row)}</div>)
        )}
      </div>
    </nav>
  );
}

const safeColor = (c: string | undefined) => (c && /^(#[0-9a-f]{3,8}|rgb\([\d\s.,%]+\)|hsl\([\d\s.,%deg]+\))$/i.test(c.trim()) ? c.trim() : undefined);

/** Brand colour as CSS variables (VW-12). Text on the brand colour is picked for contrast. */
export function brandStyle(brand: Brand | undefined): Record<string, string> {
  const c = safeColor(brand?.color);
  if (!c) return {};
  let dark = true;
  const hex = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(c)?.[1];
  if (hex) {
    const full = hex.length === 3 ? hex.split('').map((x) => x + x).join('') : hex;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)) as [number, number, number];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    dark = (lum + 0.05) / 0.05 < 1.05 / (lum + 0.05); // white text has more contrast
  }
  return {
    '--sd-brand': c,
    '--sd-on-brand': dark ? 'var(--sd-on-inverse)' : 'var(--sd-ink)',
    '--sd-brand-tint': `color-mix(in srgb, ${c} 14%, var(--sd-surface))`,
  };
}

function BrandMark({ brand }: { brand: Brand | undefined }) {
  if (brand?.logo) return <img src={brand.logo} alt={brand.name ?? ''} className={css.brandLogo} />;
  if (brand?.name) return <span className={css.brandInitial} aria-hidden="true">{brand.name.trim().charAt(0).toUpperCase()}</span>;
  return <Logo size={24} />;
}

export function Header({ brand, theme, onTheme, onCopy, onDownload, onAddVersion, onMenu, onSearch }: {
  brand: Brand | undefined;
  theme: 'light' | 'dark';
  onTheme: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onAddVersion: (() => void) | undefined;
  onMenu: (() => void) | undefined;
  onSearch: () => void;
}) {
  const v = useViewer();
  const title = v.cur.model.title;
  const newestFirst = [...v.versions].reverse();
  // Short labels so the closed picker reads "2.0.0" like the design; details stay in the timeline.
  // Version numbers read "v2.0.0" like the design; other labels ("main") stay as they are.
  const vLabel = (label: string) => (/^\d/.test(label) ? `v${label}` : label);
  const optionLabel = (x: ViewerVersion) => (x.error ? `${vLabel(x.label)} (failed to load)` : vLabel(x.label));
  const ADD = '\u0000add';
  const NONE = '\u0000none';
  const curPicker = (
    <span className={css.pickerWrap}>
      <select
        className={cx(css.picker, css.versionStrong)}
        aria-label="Version"
        value={v.cur.label}
        onChange={(e) => {
          if (e.target.value === ADD) { onAddVersion?.(); return; }
          const label = e.target.value;
          v.setPair(label, v.prev?.label === label ? undefined : v.prev?.label);
        }}
      >
        {newestFirst.map((x) => <option key={x.label} value={x.label} disabled={!x.spec}>{optionLabel(x)}</option>)}
        {onAddVersion ? <option value={ADD}>+ Add a version…</option> : null}
      </select>
      <ChevronDown aria-hidden="true" size={14} className={css.pickerChevron} />
    </span>
  );
  const comparePicker = (
    <span className={css.pickerWrap}>
      <select
        className={css.picker}
        aria-label="Compared with"
        value={v.prev?.label ?? (v.compareWith && v.versions.some((x) => x.label === v.compareWith) ? v.compareWith : NONE)}
        onChange={(e) => v.setPair(v.cur.label, e.target.value === NONE ? undefined : e.target.value)}
      >
        {/* A failed version stays selected (V-01 error) under its plain label; the banner explains it. */}
        {newestFirst.filter((x) => x.label !== v.cur.label).map((x) => <option key={x.label} value={x.label} disabled={!x.spec}>{x.label === v.compareWith && !x.spec ? vLabel(x.label) : optionLabel(x)}</option>)}
        <option value={NONE}>Nothing</option>
      </select>
      <ChevronDown aria-hidden="true" size={14} className={css.pickerChevron} />
    </span>
  );

  if (v.isPhone) {
    return (
      <header className={css.phoneHeader}>
        <Button iconOnly icon={<MenuIcon />} aria-label="Open navigation" onClick={onMenu} className={css.touch} />
        <span className={css.phoneTitle}>{title}</span>
        {v.versions.length > 1 ? curPicker : null}
        <Button iconOnly icon={<Search />} aria-label="Search" onClick={onSearch} className={css.touch} />
      </header>
    );
  }
  return (
    <header className={css.header}>
      <div className={css.headerLeft}>
        {onMenu ? <Button iconOnly icon={<MenuIcon />} aria-label="Open navigation" onClick={onMenu} /> : null}
        <span className={css.brand}>
          <BrandMark brand={brand} />
        </span>
        {!brand?.name && !brand?.logo ? <span className={css.headerDivider} aria-hidden="true" /> : null}
        <span className={css.headerTitle}>{brand?.name ? `${brand.name} · ${title}` : title}</span>
      </div>
      <div className={css.headerRight}>
        {curPicker}
        {v.versions.length > 1 ? (
          <>
            <span className={css.muted} aria-hidden="true">compared with</span>
            {comparePicker}
          </>
        ) : null}
        <Button iconOnly icon={theme === 'dark' ? <Sun /> : <Moon />} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={onTheme} />
        <Button icon={<Copy />} onClick={onCopy}>Copy for LLM</Button>
        <Button icon={<Download />} onClick={onDownload}>Download spec</Button>
      </div>
    </header>
  );
}
