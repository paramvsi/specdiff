import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CommandPalette, type CommandGroup } from './CommandPalette';

afterEach(cleanup);

beforeAll(() => {
  // jsdom lacks these; cmdk calls them.
  Element.prototype.scrollIntoView ??= function () {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe('CommandPalette', () => {
  it('filters items as you type and runs the selected one on Enter', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const groups: CommandGroup[] = [
      { heading: 'Changes', items: [{ label: 'currency now required', kind: 'change', severity: 'breaking' }] },
      { heading: 'Paths', items: [{ label: '$.components.schemas.Currency', kind: 'path' }] },
      { heading: 'Actions', items: [{ label: 'Toggle ignore whitespace', kind: 'action', onSelect: onToggle }] },
    ];
    render(<CommandPalette open onOpenChange={() => {}} groups={groups} />);
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeTruthy();
    expect(screen.getAllByRole('option')).toHaveLength(3);

    const input = screen.getByRole('combobox');
    await user.type(input, 'curr');
    const labels = screen.getAllByRole('option').map((o) => o.textContent);
    expect(labels).toHaveLength(2);
    expect(labels.join('|')).not.toContain('Toggle ignore whitespace');

    await user.clear(input);
    await user.type(input, 'whitespace');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await user.keyboard('{Enter}');
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
