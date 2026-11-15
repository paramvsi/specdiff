import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { DecisionButtons, type Decision } from './DecisionButtons';

afterEach(cleanup);

function Harness() {
  const [v, setV] = useState<Decision>(null);
  return <DecisionButtons value={v} onChange={setV} />;
}

describe('DecisionButtons', () => {
  it('toggles aria-pressed between accept, reject and none', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const accept = screen.getByRole('button', { name: 'Accept' });
    const reject = screen.getByRole('button', { name: 'Reject' });
    expect(accept.getAttribute('aria-pressed')).toBe('false');
    expect(reject.getAttribute('aria-pressed')).toBe('false');

    await user.click(accept);
    expect(screen.getByRole('button', { name: 'Accepted' }).getAttribute('aria-pressed')).toBe('true');
    expect(reject.getAttribute('aria-pressed')).toBe('false');

    await user.click(reject);
    expect(screen.getByRole('button', { name: 'Rejected' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Accept' }).getAttribute('aria-pressed')).toBe('false');

    await user.click(screen.getByRole('button', { name: 'Rejected' }));
    expect(screen.getByRole('button', { name: 'Reject' }).getAttribute('aria-pressed')).toBe('false');
  });
});
