// Phone nav menu (W-01 phone): a disclosure button that opens the site links.
// Server-rendered only (no React in the browser, B-13): src/scripts/islands.ts opens and closes it and
// swaps the button icon from the two <template data-icon>s.
// The theme button inside carries [data-theme-toggle]; src/scripts/site.ts owns its state and aria-pressed.
import { Menu, Moon, Sun, X } from 'lucide-react';

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
  return (
    <>
      <button type="button" className="icon-btn" aria-label="Open menu" aria-expanded={false} aria-controls="phone-menu">
        <Menu size={18} aria-hidden="true" />
      </button>
      <div id="phone-menu" className="pmenu-panel" hidden>
        <nav aria-label="Main">
          <ul>
            {links.map(([label, href]) => (
              <li key={href}>
                <a href={href}>{label}</a>
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
      <template data-icon="open">
        <Menu size={18} aria-hidden="true" />
      </template>
      <template data-icon="close">
        <X size={18} aria-hidden="true" />
      </template>
    </>
  );
}
