import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Button } from '../Button/Button';
import { Dialog } from './Dialog';

afterEach(cleanup);

describe('Dialog', () => {
  it('opens from its trigger, traps focus, closes on Esc and returns focus', async () => {
    const user = userEvent.setup();
    render(
      <Dialog
        title="Share comparison"
        trigger={<Button>Share</Button>}
        actions={<Button variant="brand">Copy link</Button>}
      >
        Both files go into the link.
      </Dialog>,
    );
    const trigger = screen.getByRole('button', { name: 'Share' });
    await user.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Share comparison' });
    expect(dialog.contains(document.activeElement)).toBe(true);

    // Tab cycles within the dialog.
    for (let i = 0; i < 4; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
