// Phone nav menu (W-01 phone): a disclosure button that opens the site links. React island.
// The theme button inside carries [data-theme-toggle]; src/scripts/site.ts owns its state and aria-pressed.
import { Menu, Moon, Sun, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const links: Array<[string, string]> = [
  ['Product', '#product'],
  ['Viewer', '#viewer'],
  ['Packages', '#packages'],
  ['Docs', '/docs/'],
  ['Rules', '/rules/'],
  ['Changelog', '/changelog/'],
  ['GitHub', 'https://github.com/paramvsi'],
];

export default function PhoneMenu() {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        className="icon-btn"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        aria-controls="phone-menu"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
      </button>
      <div id="phone-menu" className="pmenu-panel" hidden={!open}>
        <nav aria-label="Main">
          <ul>
            {links.map(([label, href]) => (
              <li key={href}>
                <a href={href} onClick={() => setOpen(false)}>
                  {label}
                </a>
              </li>
            ))}
            <li>
              <button type="button" className="pmenu-theme theme-toggle" data-theme-toggle>
                <Moon className="i-moon" size={16} aria-hidden="true" />
                <Sun className="i-sun" size={16} aria-hidden="true" />
                Dark theme
              </button>
            </li>
          </ul>
        </nav>
      </div>
    </>
  );
}
