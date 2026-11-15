import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { IdenticalState } from '../IdenticalState/IdenticalState';
import { ParseErrorState } from './ParseErrorState';

afterEach(cleanup);

describe('ParseErrorState (AComponents)', () => {
  it('drops blank context lines at the ends, so no line number stands alone', () => {
    const { container } = render(
      <ParseErrorState
        title="After isn't valid YAML"
        errorLine={3}
        lines={[
          { number: 1, text: '' },
          { number: 2, text: 'a: 1' },
          { number: 3, text: 'b: [1, 2' },
          { number: 4, text: '' },
          { number: 5, text: '   ' },
        ]}
        hint="A bracket is not closed."
      />,
    );
    const rows = [...container.querySelectorAll('[data-parse-line]')].map((r) => r.getAttribute('data-parse-line'));
    expect(rows).toEqual(['2', '3']);
  });
});

describe('IdenticalState (AComponents)', () => {
  it('says nothing about formatting when none was ignored', () => {
    render(<IdenticalState ignoredLines={0} onShowFormatting={() => {}} />);
    expect(screen.getByText(/The two files mean exactly the same\.$/)).toBeTruthy();
    expect(screen.queryByText(/formatting-only/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show formatting changes' })).toBeNull();
  });
  it('gives the count and the button when formatting was ignored', () => {
    render(<IdenticalState ignoredLines={6} onShowFormatting={() => {}} />);
    expect(screen.getByText(/6 formatting-only lines were ignored\./)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show formatting changes' })).toBeTruthy();
  });
});
