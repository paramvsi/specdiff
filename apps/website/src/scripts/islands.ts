// Island behaviour in plain TypeScript (B-13: no framework in the browser). Loaded on demand by ./site.ts.
// Astro server-renders each island's markup (src/islands/*.tsx, React on the server only); the tab
// contents that are not showing are in <template data-panel> / <template data-icon> next to it.

/** Tabs with roving tabindex: click, ArrowLeft/ArrowRight (wrapping), Home and End. */
function tabs(el: HTMLElement, prefix: string) {
  const list = [...el.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const panel = el.querySelector<HTMLElement>('[role="tabpanel"]');
  if (!panel) return;
  const idOf = (tab: HTMLButtonElement) => tab.id.slice(prefix.length);
  let current = idOf(list.find((t) => t.getAttribute('aria-selected') === 'true') ?? list[0]!);

  const select = (id: string) => {
    if (id === current) return;
    const tpl = el.querySelector<HTMLTemplateElement>(`template[data-panel="${id}"]`);
    if (!tpl) return;
    current = id;
    for (const tab of list) {
      const on = idOf(tab) === id;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
    }
    panel.setAttribute('aria-labelledby', prefix + id);
    // A fresh copy each time, so the CSS animations in it start over (as a remount did).
    panel.replaceChildren(tpl.content.cloneNode(true));
  };

  list.forEach((tab, i) => {
    tab.addEventListener('click', () => select(idOf(tab)));
    tab.addEventListener('keydown', (e) => {
      let next = -1;
      if (e.key === 'ArrowRight') next = (i + 1) % list.length;
      else if (e.key === 'ArrowLeft') next = (i - 1 + list.length) % list.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = list.length - 1;
      if (next < 0) return;
      e.preventDefault();
      select(idOf(list[next]!));
      list[next]!.focus();
    });
  });
}

/** Before/after slider: the range input moves the clip and the handle. */
function slider(el: HTMLElement) {
  const input = el.querySelector<HTMLInputElement>('.ba-input');
  const right = el.querySelector<HTMLElement>('.ba-right');
  const handle = el.querySelector<HTMLElement>('.ba-handle');
  if (!input || !right || !handle) return;
  input.addEventListener('input', () => {
    const pos = Number(input.value);
    right.style.clipPath = `inset(0 0 0 ${pos}%)`;
    handle.style.left = `${pos}%`;
    input.setAttribute('aria-valuetext', `${pos}% git diff, ${100 - pos}% Specdiff`);
  });
}

/** Phone menu: a disclosure button; Escape closes it and returns focus, a link click closes it. */
function phoneMenu(el: HTMLElement) {
  const button = el.querySelector<HTMLButtonElement>('button[aria-controls="phone-menu"]');
  const panel = el.querySelector<HTMLElement>('#phone-menu');
  const icon = (name: string) =>
    el.querySelector<HTMLTemplateElement>(`template[data-icon="${name}"]`)?.content;
  if (!button || !panel) return;
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    set(false);
    button.focus();
  };
  const set = (open: boolean) => {
    button.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    button.setAttribute('aria-expanded', String(open));
    const svg = icon(open ? 'close' : 'open');
    if (svg) button.replaceChildren(svg.cloneNode(true));
    panel.hidden = !open;
    if (open) document.addEventListener('keydown', onKey);
    else document.removeEventListener('keydown', onKey);
  };
  button.addEventListener('click', () => set(button.getAttribute('aria-expanded') !== 'true'));
  panel.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => set(false)));
}

const registry: Record<string, (el: HTMLElement) => void> = {
  demo: (el) => tabs(el, 'demo-tab-'),
  slider,
  packages: (el) => tabs(el, 'pk-tab-'),
  'phone-menu': phoneMenu,
};

export function hydrate(el: HTMLElement) {
  const init = registry[el.dataset.island ?? ''];
  if (!init) return;
  init(el);
  el.dataset.hydrated = 'true';
}
