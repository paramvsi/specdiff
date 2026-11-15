import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { PassphraseField } from './PassphraseField';
import { passphraseStrength } from './strength';

afterEach(cleanup);

function Harness() {
  const [v, setV] = useState('');
  return <PassphraseField value={v} onValueChange={setV} />;
}

describe('passphraseStrength', () => {
  it('grades by length and variety', () => {
    expect(passphraseStrength('short').label).toBe('Too short');
    expect(passphraseStrength('abcdefgh').label).toBe('Weak');
    expect(passphraseStrength('abcdefghijkl').label).toBe('Fair');
    expect(passphraseStrength('abcdefghijklmnop').label).toBe('Good');
    expect(passphraseStrength('Correct-Horse-Battery-9').label).toBe('Strong');
  });
});

describe('PassphraseField', () => {
  it('states strength in text and describes the input with it', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText('Passphrase');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const label = document.getElementById(describedBy!)!;
    expect(label.textContent).toBe('Strength: Too short');

    await user.type(input, 'Correct-Horse-Battery-9');
    expect(label.textContent).toBe('Strength: Strong');
  });

  it('Show reveals the passphrase', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText('Passphrase');
    expect(input.getAttribute('type')).toBe('password');
    await user.click(screen.getByRole('button', { name: 'Show' }));
    expect(input.getAttribute('type')).toBe('text');
    expect(screen.getByRole('button', { name: 'Hide' })).toBeTruthy();
  });
});
