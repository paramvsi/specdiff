import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { CodePane, type CodePaneRow } from './CodePane';

afterEach(cleanup);

const hidden = Array.from({ length: 24 }, (_, i) => ({
  kind: 'context' as const,
  number: 6 + i,
  content: `    line${6 + i}: x`,
}));

const rows: CodePaneRow[] = [
  { kind: 'context', number: 3, content: '  requestBody:' },
  { kind: 'removed', number: 4, content: '    required: [amount]' },
  {
    kind: 'added',
    number: 4,
    content: [{ text: '    required: [amount, ' }, { text: 'currency', highlight: true }, { text: ']' }],
  },
  { kind: 'collapsed', lines: hidden },
];

describe('CodePane', () => {
  it('shows +n / −n counts in the header', () => {
    const { container } = render(<CodePane fileName="payments-v2.yaml" rows={rows} />);
    expect(container.textContent).toContain('+1');
    expect(container.textContent).toContain('−1');
    expect(screen.getByText('1 added, 1 removed')).toBeTruthy();
  });

  it('collapsed context row expands to reveal the hidden lines', async () => {
    const user = userEvent.setup();
    render(<CodePane fileName="payments-v2.yaml" rows={rows} />);
    expect(screen.queryByText('line6: x', { exact: false })).toBeNull();
    await user.click(screen.getByRole('button', { name: /24 unchanged lines/ }));
    expect(screen.queryByRole('button', { name: /unchanged lines/ })).toBeNull();
    expect(screen.getByText('line6: x', { exact: false })).toBeTruthy();
    expect(screen.getByText('line29: x', { exact: false })).toBeTruthy();
  });

  it('marks word highlights and pairs colour with gutter symbols', () => {
    const { container } = render(<CodePane fileName="f" rows={rows} />);
    expect(container.querySelector('mark')?.textContent).toBe('currency');
    expect(screen.getByText('Added:', { exact: false })).toBeTruthy();
    expect(screen.getByText('Removed:', { exact: false })).toBeTruthy();
  });
});
