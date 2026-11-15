// Rules list search and filters (W-03). Rows are server-rendered; this only hides and shows them.
const rows = [...document.querySelectorAll<HTMLTableRowElement>('tr[data-rule]')];
const search = document.querySelector<HTMLInputElement>('[data-rules-search]');
const statusEl = document.querySelector<HTMLElement>('[data-rules-status]');
const sevButtons = [...document.querySelectorAll<HTMLButtonElement>('button[data-sev]')];
const areaButtons = [...document.querySelectorAll<HTMLButtonElement>('button[data-area]')];

let sev = 'all';
let area: string | null = null;

function apply() {
  const q = (search?.value ?? '').trim().toLowerCase();
  let shown = 0;
  for (const row of rows) {
    const ok =
      (sev === 'all' || row.dataset.sev === sev) &&
      (!area || row.dataset.area === area) &&
      (!q || (row.dataset.text ?? '').includes(q));
    row.hidden = !ok;
    if (ok) shown++;
  }
  if (statusEl) {
    const tail = statusEl.querySelector('code')?.outerHTML ?? '<code>.specdiff.yaml</code>';
    statusEl.innerHTML = `Showing ${shown} of ${rows.length}. Severities can be changed per project in ${tail}.`;
  }
}

for (const b of sevButtons)
  b.addEventListener('click', () => {
    sev = b.dataset.sev ?? 'all';
    sevButtons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    apply();
  });
for (const b of areaButtons)
  b.addEventListener('click', () => {
    area = area === b.dataset.area ? null : (b.dataset.area ?? null);
    areaButtons.forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.area === area)));
    apply();
  });
search?.addEventListener('input', apply);

export {};
