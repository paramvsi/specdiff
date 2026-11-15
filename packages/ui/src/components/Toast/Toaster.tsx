import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Toast, type ToastAction, type ToastTone } from './Toast';
import css from './Toast.module.css';

export interface ToastOptions {
  title: string;
  description?: ReactNode | undefined;
  tone?: ToastTone | undefined;
  action?: ToastAction | undefined;
}

interface ToastEntry extends ToastOptions {
  id: number;
}

interface ToastApi {
  /** Shows a toast. Non-errors close after 4 s; errors stay until dismissed. Returns its id. */
  toast: (options: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Auto-dismiss delay for non-error toasts. */
export const TOAST_DURATION_MS = 4000;

/** Provides `useToast()` and renders the toaster (bottom centre) after its children. */
export function Toaster({ children }: { children?: ReactNode }) {
  const [toasts, setToasts] = useState<ReadonlyArray<ToastEntry>>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setToasts((list) => list.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    (options: ToastOptions) => {
      const id = nextId.current++;
      setToasts((list) => [...list, { ...options, id }]);
      if (options.tone !== 'error') {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), TOAST_DURATION_MS),
        );
      }
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const t of map.values()) clearTimeout(t);
      map.clear();
    };
  }, []);

  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={css.viewport}>
        {toasts.map((t) => (
          <Toast
            key={t.id}
            title={t.title}
            description={t.description}
            tone={t.tone}
            action={
              t.action
                ? {
                    label: t.action.label,
                    onClick: () => {
                      t.action?.onClick();
                      dismiss(t.id);
                    },
                  }
                : undefined
            }
            onDismiss={t.tone === 'error' ? () => dismiss(t.id) : undefined}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Access the toaster. Must be used inside <Toaster>. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <Toaster>');
  return ctx;
}
