import { cx } from '../../internal/cx';
import css from './Logo.module.css';

export interface LogoProps {
  /** Mark size in px (64 / 40 / 26 / 20 / 16). Default 26. */
  size?: number | undefined;
  /** Show the "specdiff" wordmark beside the mark. Default true. */
  wordmark?: boolean | undefined;
  /** On a chartreuse ground the "after" block turns ink and the plus chartreuse. */
  onBrand?: boolean | undefined;
  className?: string | undefined;
}

/** The before/after mark, drawn inline. Below 20px the plus is dropped. */
export function LogoMark({
  size = 26,
  onBrand,
  title,
  className,
}: {
  size?: number | undefined;
  onBrand?: boolean | undefined;
  /** Accessible name; omit for a decorative mark. */
  title?: string | undefined;
  className?: string | undefined;
}) {
  const decorative = !title;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 26 26"
      className={cx(css.mark, onBrand && css.onBrand, className)}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': title })}
      focusable="false"
    >
      <rect x="2" y="5" width="13" height="16" rx="3.5" fill="none" className={css.before} strokeWidth="2" />
      <rect x="11" y="5" width="13" height="16" rx="3.5" className={css.after} />
      {size >= 20 ? (
        <>
          <path d="M14.5 13h6" className={css.plus} strokeWidth="2" strokeLinecap="round" />
          <path d="M17.5 10v6" className={css.plus} strokeWidth="2" strokeLinecap="round" />
        </>
      ) : null}
    </svg>
  );
}

/** Logo: mark plus the lower-case "specdiff" wordmark (Geist Bold, −0.3px). */
export function Logo({ size = 26, wordmark = true, onBrand, className }: LogoProps) {
  if (!wordmark) return <LogoMark size={size} onBrand={onBrand} title="Specdiff" className={className} />;
  return (
    <span
      className={cx(css.logo, onBrand && css.onBrand, className)}
      style={{ gap: Math.round(size / 3), fontSize: Math.round(size * 0.65) }}
    >
      <LogoMark size={size} onBrand={onBrand} />
      <span className={css.wordmark}>specdiff</span>
    </span>
  );
}
