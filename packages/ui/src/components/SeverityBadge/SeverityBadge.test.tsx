import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SeverityBadge } from './SeverityBadge';

afterEach(cleanup);

describe('SeverityBadge', () => {
  it.each([
    ['breaking', '!', 'Breaking'],
    ['possibly', '?', 'Possibly breaking'],
    ['safe', '+', 'Safe'],
    ['docs', '¶', 'Docs only'],
  ] as const)('%s renders symbol %s and label %s', (severity, symbol, label) => {
    const { container } = render(<SeverityBadge severity={severity} />);
    expect(container.textContent).toBe(`${symbol}${label}`);
  });

  it('compact dot keeps the label for screen readers', () => {
    const { container } = render(<SeverityBadge severity="breaking" compact />);
    expect(container.textContent).toBe('Breaking');
  });
});
