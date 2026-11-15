import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toast } from './Toast';
import { TOAST_DURATION_MS, Toaster, useToast, type ToastOptions } from './Toaster';

afterEach(cleanup);

describe('Toast', () => {
  it('uses role status for success and alert for errors', () => {
    render(
      <>
        <Toast title="Changelog copied" />
        <Toast tone="error" title="Couldn't parse After: line 12, unexpected indent" />
      </>,
    );
    expect(screen.getByRole('status').textContent).toContain('Changelog copied');
    expect(screen.getByRole('alert').textContent).toContain("Couldn't parse After");
  });
});

describe('Toaster', () => {
  afterEach(() => vi.useRealTimers());

  let api: ReturnType<typeof useToast> | undefined;
  function Grab() {
    api = useToast();
    return null;
  }
  const show = (o: ToastOptions) => act(() => void api?.toast(o));

  it('auto-dismisses after 4 s; errors persist until dismissed', () => {
    vi.useFakeTimers();
    render(
      <Toaster>
        <Grab />
      </Toaster>,
    );
    show({ title: 'Link copied' });
    show({ title: "Couldn't read payments-v2.yaml", tone: 'error' });
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();

    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS));
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('alert')).toBeTruthy();

    act(() => screen.getByRole('button', { name: 'Dismiss' }).click());
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
