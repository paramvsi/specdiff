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

  it('matches words, not scattered letters, and keeps same-label items apart', async () => {
    const user = userEvent.setup();
    const first = vi.fn();
    const second = vi.fn();
    const groups: CommandGroup[] = [
      {
        heading: 'Changes',
        items: [
          { label: 'Endpoint removed', kind: 'change', keywords: ['/v1/refunds'], onSelect: first },
          { label: 'Endpoint removed', kind: 'change', keywords: ['/v1/payouts'], onSelect: second },
          { label: 'Descriptions updated', kind: 'docs' },
        ],
      },
      { heading: 'Settings', items: [{ label: 'Diff colours: high contrast', kind: 'setting' }] },
    ];
    render(<CommandPalette open onOpenChange={() => {}} groups={groups} />);
    expect(screen.getAllByRole('option')).toHaveLength(4);
    const input = screen.getByRole('combobox');
    // Fuzzy subsequences ("dcs" is in "Diff colours: high contrast") must not match.
    await user.type(input, 'descr');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      expect.stringContaining('Descriptions updated'),
    ]);
    await user.clear(input);
    await user.type(input, 'dcs');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    // Keywords match too, and two items with one label stay separate.
    await user.clear(input);
    await user.type(input, 'payouts');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await user.keyboard('{Enter}');
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});
