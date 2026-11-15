import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Switch } from './Switch';

afterEach(cleanup);

describe('Switch', () => {
  it('shows its label by default and names the switch with it', () => {
    const { container } = render(<Switch label="Ignore whitespace" />);
    expect(screen.getByRole('switch', { name: 'Ignore whitespace' })).toBeTruthy();
    expect(container.textContent).toBe('Ignore whitespace');
  });

  it('hideLabel keeps the accessible name but renders no visible text', () => {
    const onChange = vi.fn();
    const { container } = render(
      <Switch label="endpoint-removed on" hideLabel checked={false} onCheckedChange={onChange} />,
    );
    const sw = screen.getByRole('switch', { name: 'endpoint-removed on' });
    expect(container.textContent).toBe('');
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
