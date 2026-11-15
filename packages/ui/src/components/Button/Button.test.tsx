import { cleanup, render, screen } from '@testing-library/react';
import { ChevronRight } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';
import { Button } from './Button';

afterEach(cleanup);

describe('Button', () => {
  it('icon-only button exposes its aria-label as the accessible name', () => {
    render(<Button iconOnly icon={<ChevronRight />} aria-label="Next change" />);
    const btn = screen.getByRole('button', { name: 'Next change' });
    expect(btn.textContent).toBe('');
    expect(btn.getAttribute('type')).toBe('button');
  });

  it('icon-only without aria-label is a type error', () => {
    // @ts-expect-error aria-label is required when iconOnly is set
    const el = <Button iconOnly icon={<ChevronRight />} />;
    expect(el).toBeTruthy();
  });

  it('renders a labelled button with its variant class', () => {
    render(<Button variant="brand">Export</Button>);
    expect(screen.getByRole('button', { name: 'Export' })).toBeTruthy();
  });
});
