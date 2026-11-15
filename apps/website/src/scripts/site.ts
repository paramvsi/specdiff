// Website bootstrap: one small module for every page (no inline scripts; CSP).
// - theme toggle (data-theme on <html>, persisted in localStorage)
// - copy buttons ([data-copy])
// - pause looping animations off-screen ([data-loop] → .is-paused)
// - React islands ([data-island]) hydrated on demand from ./islands
// - "/" focuses the docs search

type Theme = 'light' | 'dark';
const KEY = 'specdiff-theme';
const root = document.documentElement;
const media = window.matchMedia('(prefers-color-scheme: dark)');

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function current(): Theme {
  const set = root.dataset.theme;
  if (set === 'light' || set === 'dark') return set;
  return media.matches ? 'dark' : 'light';
}

function syncToggles() {
  const dark = current() === 'dark';
  document.querySelectorAll<HTMLElement>('[data-theme-toggle]').forEach((b) => b.setAttribute('aria-pressed', String(dark)));
}

// A stored choice is applied here, after first paint (a module script cannot run earlier without an
// inline script). Visitors who picked the opposite of their system theme see one frame of the system theme.
const saved = stored();
if (saved) root.dataset.theme = saved;
syncToggles();
media.addEventListener('change', syncToggles);

document.addEventListener('click', (e) => {
  const target = e.target instanceof Element ? e.target : null;
  const toggle = target?.closest('[data-theme-toggle]');
  if (toggle) {
    const next: Theme = current() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private mode: the choice lasts for this page only */
    }
    syncToggles();
    return;
  }
  const copy = target?.closest<HTMLElement>('[data-copy]');
  if (copy) {
    const text = copy.dataset.copy ?? document.getElementById(copy.dataset.copyFrom ?? '')?.innerText ?? '';
    void navigator.clipboard?.writeText(text).then(
      () => {
        copy.setAttribute('data-copied', '');
        const label = copy.getAttribute('aria-label') ?? '';
        copy.setAttribute('aria-label', 'Copied');
        window.setTimeout(() => {
          copy.removeAttribute('data-copied');
          copy.setAttribute('aria-label', label);
        }, 1600);
      },
      () => undefined,
    );
  }
});

// Looping animations pause while their section is off-screen (docs/09 motion rules).
const loops = document.querySelectorAll<HTMLElement>('[data-loop]');
if (loops.length && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) entry.target.classList.toggle('is-paused', !entry.isIntersecting);
  });
  loops.forEach((el) => io.observe(el));
}

// React islands: server-rendered by Astro, hydrated here when they come into view (after the page is idle)
// or as soon as someone points at, focuses or touches one. React itself loads only then.
const islands = document.querySelectorAll<HTMLElement>('[data-island]');
if (islands.length) {
  let mod: Promise<typeof import('./islands')> | undefined;
  const hydrate = (el: HTMLElement) => {
    if (el.dataset.hydrated) return;
    el.dataset.hydrated = 'pending';
    mod ??= import('./islands');
    void mod.then((m) => m.hydrate(el));
  };
  const idle = (fn: () => void) =>
    typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(fn, { timeout: 1500 }) : globalThis.setTimeout(fn, 200);
  const seen = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        seen.unobserve(entry.target);
        const island = entry.target.closest<HTMLElement>('[data-island]');
        if (island) idle(() => hydrate(island));
      }
    },
    { rootMargin: '200px' },
  );
  islands.forEach((el) => {
    const now = () => hydrate(el);
    for (const type of ['pointerover', 'focusin', 'touchstart'] as const) el.addEventListener(type, now, { once: true, passive: true });
    // Island wrappers are display: contents (no box), so watch the first element they render.
    seen.observe(el.firstElementChild ?? el);
  });
}

// Docs: "/" focuses the search field; typing filters the sidebar.
const search = document.querySelector<HTMLInputElement>('[data-docs-search]');
if (search) {
  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement | null;
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    e.preventDefault();
    search.focus();
  });
  const groups = document.querySelectorAll<HTMLElement>('[data-docs-group]');
  const status = document.querySelector<HTMLElement>('[data-docs-search-status]');
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    let shown = 0;
    groups.forEach((g) => {
      let any = false;
      g.querySelectorAll<HTMLAnchorElement>('a').forEach((a) => {
        const hit = !q || (a.textContent ?? '').toLowerCase().includes(q) || (a.dataset.keywords ?? '').includes(q);
        a.hidden = !hit;
        if (hit) {
          any = true;
          shown++;
        }
      });
      g.hidden = !any;
    });
    if (status) status.textContent = q ? `${shown} page${shown === 1 ? '' : 's'} match` : '';
  });
}

export {};
