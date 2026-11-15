import { Check, RefreshCw, TriangleAlert, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '../../internal/cx';
import css from './Toast.module.css';

export type ToastTone = 'success' | 'info' | 'warning' | 'error';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastProps {
  title: string;
  description?: ReactNode | undefined;
  tone?: ToastTone | undefined;
  action?: ToastAction | undefined;
  /** Shows a Dismiss button. Errors always need one, since they do not time out. */
  onDismiss?: (() => void) | undefined;
  className?: string | undefined;
}

function ToneIcon({ tone }: { tone: ToastTone }) {
  if (tone === 'error') return <b className={css.bang}>!</b>;
  if (tone === 'success')
    return (
      <span className={css.disc}>
        <Check />
      </span>
    );
  if (tone === 'warning') return <TriangleAlert className={css.glyph} />;
  return <RefreshCw className={css.glyph} />;
}

/** A single toast. Errors use role="alert"; everything else role="status". */
export function Toast({ title, description, tone = 'success', action, onDismiss, className }: ToastProps) {
  const isError = tone === 'error';
  return (
    <div role={isError ? 'alert' : 'status'} className={cx(css.toast, css[tone], className)}>
      <span className={css.icon} aria-hidden="true">
        <ToneIcon tone={tone} />
      </span>
      <span className={css.text}>
        <span className={css.title}>{title}</span>
        {description ? <span className={css.description}>{description}</span> : null}
      </span>
      {action ? (
        <button type="button" className={css.action} onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
      {onDismiss ? (
        <button type="button" className={css.dismiss} aria-label="Dismiss" onClick={onDismiss}>
          <X aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
