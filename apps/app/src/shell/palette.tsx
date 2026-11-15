import { CommandPalette, type CommandGroup } from '@specdiff/ui';
import { useMemo } from 'react';
import { useApp } from '../state/store';
import { run, useOverlays } from './commands';
import { focusChange } from './nav';

export const openPalette = () => useOverlays.getState().set({ palette: true });

export function Palette() {
  const open = useOverlays((s) => s.palette);
  const set = useOverlays((s) => s.set);
  const { result, setScreen, setSettings, settings } = useApp();
  const groups = useMemo<CommandGroup[]>(() => {
    const g: CommandGroup[] = [];
    if (result && 'report' in result) {
      g.push({
        heading: 'Changes',
        items: result.report.changes
          .slice(0, 200)
          .map((c) => ({
            label: `${c.path}`,
            kind: c.ruleId ?? c.kind,
            ...(c.severity ? { severity: c.severity } : {}),
            keywords: [c.jsonPath ?? '', c.ruleId ?? ''],
            onSelect: () => focusChange(c.id),
          })),
      });
      const paths = [
        ...new Set(result.report.changes.map((c) => c.operation?.path).filter(Boolean) as string[]),
      ].sort();
      g.push({
        heading: 'Paths',
        items: paths.map((p) => ({
          label: p,
          kind: 'path',
          onSelect: () =>
            focusChange(result.report.changes.find((c) => c.operation?.path === p)!.id),
        })),
      });
    }
    g.push({
      heading: 'Actions',
      items: [
        { label: 'New comparison', kind: 'action', onSelect: () => setScreen('compare') },
        { label: 'Swap before and after', kind: 'action', onSelect: () => run('swap') },
        { label: 'Share', kind: 'action', onSelect: () => run('share') },
        { label: 'History', kind: 'action', onSelect: () => setScreen('history') },
        { label: 'Saved sources', kind: 'action', onSelect: () => setScreen('saved') },
        { label: 'Keyboard shortcuts', kind: 'action', onSelect: () => set({ shortcuts: true }) },
      ],
    });
    g.push({
      heading: 'Settings',
      items: [
        { label: 'Rules and settings', kind: 'setting', onSelect: () => setScreen('settings') },
        {
          label: `Theme: ${settings.theme === 'dark' ? 'light' : 'dark'}`,
          kind: 'setting',
          onSelect: () => setSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' }),
        },
        {
          label: `Diff colours: ${settings.diffTheme === 'high-contrast' ? 'default' : 'high contrast'}`,
          kind: 'setting',
          onSelect: () =>
            setSettings({
              diffTheme: settings.diffTheme === 'high-contrast' ? 'default' : 'high-contrast',
            }),
        },
      ],
    });
    return g;
  }, [result, setScreen, setSettings, settings, set]);
  return (
    <CommandPalette
      open={open}
      onOpenChange={(o) => set({ palette: o })}
      groups={groups}
      placeholder="Search changes, paths, actions"
      label="Command palette"
    />
  );
}
