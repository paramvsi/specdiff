// A-02 Parsing (IN-08, X-02): per-file and per-step progress; Cancel terminates the worker.
import { Button, Skeleton } from '@specdiff/ui';
import * as icons from 'lucide-react';
import { useEffect, useRef } from 'react';
import { formatBytes } from '../lib/input';
import { STEPS, useApp } from '../state/store';
import type { Step } from '../worker/protocol';
import css from './Parsing.module.css';

const LABEL: Record<Step, string> = {
  detect: 'Detect format',
  parse: 'Parse',
  resolve: 'Resolve $refs',
  normalise: 'Normalise',
  compare: 'Compare and classify',
};

export function Parsing() {
  const { before, after, progress, cancel, mode } = useApp();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  // OpenAPI shows all five stages (A-02); other modes have no $refs to resolve or versions to normalise.
  const isOpenApi =
    mode === 'openapi' ||
    progress.detect?.detail?.startsWith('OpenAPI') ||
    progress.detect?.detail?.startsWith('Swagger');
  const steps = STEPS.filter((s) => isOpenApi || (s !== 'resolve' && s !== 'normalise'));
  const done = steps.filter((s) => progress[s]?.state === 'done').length;
  const fileState = (side: 'before' | 'after') => {
    // Per file: Before is parsed once the After side starts parsing; After once parsing is done.
    const parsed =
      progress.parse?.state === 'done' ||
      progress.compare?.state === 'done' ||
      (side === 'before' && progress.parse?.side === 'after');
    const running = steps.find((s) => progress[s]?.state === 'running');
    if (parsed && (side === 'before' || !running || running === 'parse'))
      return { pct: 100, status: 'Parsed', ok: true };
    const parsingThis = running === 'parse' && (progress.parse?.side ?? 'before') === side;
    // The file's bar: half for its own parse, the rest for the shared stages after it.
    const pct = Math.round(((done + (parsed || parsingThis ? 0.5 : 0)) / steps.length) * 100);
    return {
      pct: Math.min(99, pct),
      status:
        running === 'resolve'
          ? 'Resolving references…'
          : running && (running !== 'parse' || parsingThis)
            ? `${LABEL[running]}…`
            : 'Waiting…',
      ok: false,
    };
  };
  return (
    <div className={css.wrap}>
      <div className={css.ghost} aria-hidden="true">
        <div className={css.ghostRow}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={css.ghostCard}>
              <Skeleton width="45%" />
              <Skeleton width="20%" height={30} />
            </div>
          ))}
        </div>
        <div className={css.ghostPanes}>
          {[0, 1, 2].map((i) => (
            <div key={i} className={css.ghostCard}>
              {[70, 80, 66, 84, 58, 76].map((w, j) => (
                <Skeleton key={j} width={`${w}%`} />
              ))}
            </div>
          ))}
        </div>
      </div>
      <section className={css.card} aria-labelledby="parsing-title" aria-busy="true">
        <h1 id="parsing-title" ref={heading} tabIndex={-1} className={css.title}>
          Preparing your comparison
        </h1>
        <p className={css.lead}>
          Large specs take a few seconds. The page stays responsive while this runs in the
          background.
        </p>
        {(
          [
            ['before', before],
            ['after', after],
          ] as const
        ).map(([side, src]) => {
          if (!src) return null;
          const f = fileState(side);
          return (
            <div key={side} className={css.file}>
              <div className={css.fileHead}>
                <icons.File size={15} aria-hidden="true" />
                <span className={css.fileName}>{src.name}</span>
                <span className={css.size}>{formatBytes(src.size)}</span>
                <span className={f.ok ? css.ok : css.status}>
                  {f.ok && <icons.Check size={14} aria-hidden="true" />}
                  {f.status}
                </span>
              </div>
              <div
                className={css.bar}
                role="progressbar"
                aria-label={`${src.name} progress`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={f.pct}
              >
                <span className={f.ok ? css.fillOk : css.fill} style={{ width: `${f.pct}%` }} />
              </div>
            </div>
          );
        })}
        <ol className={css.steps}>
          {steps.map((s) => {
            const st = progress[s]?.state ?? 'pending';
            return (
              <li key={s} className={css.step} data-state={st}>
                <span className={css.dot} aria-hidden="true">
                  {st === 'done' ? <icons.Check size={13} /> : null}
                </span>
                <span className={css.stepLabel}>
                  {LABEL[s]}
                  <span className="sd-visually-hidden">
                    {st === 'done' ? ', done' : st === 'running' ? ', in progress' : ', waiting'}
                  </span>
                </span>
                <span className={css.detail}>
                  {progress[s]?.detail ??
                    (s === 'parse' && st === 'done' ? 'both files, positions kept' : '')}
                </span>
              </li>
            );
          })}
        </ol>
        <footer className={css.foot}>
          <span className={css.privacy}>
            <icons.Shield size={13} aria-hidden="true" /> Running in this browser. Nothing is
            uploaded.
          </span>
          <Button variant="secondary" onClick={cancel}>
            Cancel
          </Button>
        </footer>
      </section>
    </div>
  );
}
