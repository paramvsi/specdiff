// O-03 Keyboard shortcuts (SET-07, X-05). Keys exactly as the design.
import { Button, Dialog, Kbd } from '@specdiff/ui';
import { useOverlays } from './commands';
import css from './Shortcuts.module.css';

const GROUPS: Array<[string, Array<[string, string[]]>]> = [
  [
    'Move around',
    [
      ['Next change', ['J']],
      ['Previous change', ['K']],
      ['Next to review', ['N']],
      ['Go to line', ['⌘', 'G']],
      ['Open command palette', ['⌘', 'K']],
    ],
  ],
  [
    'Review',
    [
      ['Accept change', ['A']],
      ['Reject change', ['R']],
      ['Mark as viewed', ['V']],
      ['Explain this change', ['E']],
      ['Copy link to change', ['⇧', 'C']],
    ],
  ],
  [
    'View',
    [
      ['Split / unified', ['⇧', 'U']],
      ['Word wrap', ['⌥', 'Z']],
      ['Show unchanged lines', ['⇧', 'E']],
      ['Summary · Workspace · Raw', ['1', '2', '3']],
      ['Toggle filters', ['F']],
    ],
  ],
  [
    'Files',
    [
      ['Swap before and after', ['⇧', 'S']],
      ['Open file', ['⌘', 'O']],
      ['Load from URL', ['⌘', '⇧', 'O']],
      ['Share', ['⌘', '⇧', 'S']],
      ['Show this sheet', ['?']],
    ],
  ],
];

export function Shortcuts() {
  const open = useOverlays((s) => s.shortcuts);
  const set = useOverlays((s) => s.set);
  if (!open) return null;
  return (
    <Dialog
      open
      title="Keyboard shortcuts"
      description="Single keys work when focus isn’t in a text field."
      onOpenChange={(o) => set({ shortcuts: o })}
      actions={
        <Button variant="secondary" onClick={() => set({ shortcuts: false })}>
          Close
        </Button>
      }
    >
      <div className={css.grid}>
        {GROUPS.map(([title, rows]) => (
          <section key={title} aria-labelledby={`sc-${title}`}>
            <h3 id={`sc-${title}`} className={css.h3}>
              {title}
            </h3>
            <dl className={css.list}>
              {rows.map(([label, keys]) => (
                <div key={label} className={css.row}>
                  <dt>{label}</dt>
                  <dd>
                    {keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <p className={css.note}>On Windows and Linux, use Ctrl instead of ⌘.</p>
    </Dialog>
  );
}
