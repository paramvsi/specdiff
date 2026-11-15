import { Button, EmptyState, LogoMark } from '@specdiff/ui';
import { lazy, useState } from 'react';
import { useApp } from '../state/store';
import { useDecisionToast, useQueuedToasts } from '../state/toasts';
import type { CompareResult } from '../worker/protocol';
const TextResult = lazy(() => import('./text/TextResult').then((m) => ({ default: m.TextResult })));

const OpenApiResult = lazy(() => import('./openapi/OpenApiResult'));
const JsonResult = lazy(() => import('./json/JsonResult'));
const MarkdownResult = lazy(() => import('./markdown/MarkdownResult'));
const CodeResult = lazy(() => import('./code/CodeResult'));

type Ok = Exclude<CompareResult, { kind: 'parse' }>;

/**
 * X-08: whether the comparison found nothing. For the structured modes, the formatting-only lines are the
 * lines the raw text diff still sees (key order, indentation, wrapping); for text mode the count is unknown.
 */
export function identical(result: Ok): { formattingLines: number | null } | null {
  const rawLines = (r: Ok) => r.text.stats.added + r.text.stats.removed + r.text.stats.changed;
  if (result.mode === 'openapi' && 'report' in result)
    return result.report.summary.total === 0 ? { formattingLines: rawLines(result) } : null;
  if ('json' in result) {
    const d = result.json;
    return !d.changes.length && !d.duplicates.before.length && !d.duplicates.after.length
      ? { formattingLines: rawLines(result) }
      : null;
  }
  if ('markdown' in result)
    return result.markdown.blocks.every((b) => b.status === 'same') ? { formattingLines: rawLines(result) } : null;
  if ('code' in result) {
    const o = result.code;
    return !('fallback' in o) && o.items.every((i) => i.status === 'same')
      ? { formattingLines: rawLines(result) }
      : null;
  }
  if (result.mode === 'json' || result.mode === 'yaml' || result.mode === 'markdown' || result.mode === 'code')
    return null;
  return result.text.identical && !result.text.filters.some((f) => f.hits) ? { formattingLines: null } : null;
}

export function Result() {
  const { result, setScreen, updateConfig, settings } = useApp();
  // X-08: "Show formatting changes" in a structured mode shows the raw line diff of this same result.
  const [rawFor, setRawFor] = useState<CompareResult | null>(null);
  useDecisionToast();
  useQueuedToasts();
  if (!result || 'kind' in result) return null;
  const same = identical(result);
  if (same && rawFor === result) {
    return (
      <>
        <p>
          <button type="button" className="sd-link" onClick={() => setRawFor(null)}>
            Hide formatting changes
          </button>
        </p>
        <TextResult />
      </>
    );
  }
  if (same) {
    const n = same.formattingLines;
    const t = settings.config.text;
    // Text mode: formatting is what the ignore options hid; nothing to show when none is on.
    const textOptionsOn = !!(t?.ignoreWhitespace || t?.ignoreCase || (t?.ignoreLineEndings ?? true));
    const canShow = n === null ? textOptionsOn : n > 0;
    const onShow =
      n === null
        ? () => {
            updateConfig((c) => ({
              ...c,
              text: { ...c.text, ignoreWhitespace: false, ignoreLineEndings: false, ignoreCase: false },
            }));
            void useApp.getState().compare();
          }
        : () => setRawFor(result);
    return (
      <>
        <EmptyState
          icon={<LogoMark size={40} />}
          title="No differences"
          actions={
            canShow ? (
              <Button variant="secondary" onClick={onShow}>
                Show formatting changes
              </Button>
            ) : undefined
          }
        >
          The two files mean exactly the same.
          {n ? ` ${n} formatting-only ${n === 1 ? 'line was' : 'lines were'} ignored.` : ''}
        </EmptyState>
        <p>
          <button type="button" className="sd-link" onClick={() => setScreen('compare')}>
            New comparison
          </button>
        </p>
      </>
    );
  }
  if (result.mode === 'openapi') return <OpenApiResult />;
  if (result.mode === 'json' || result.mode === 'yaml')
    return 'json' in result ? <JsonResult /> : <TextResult />;
  if (result.mode === 'markdown') return 'markdown' in result ? <MarkdownResult /> : <TextResult />;
  if (result.mode === 'code') return 'code' in result ? <CodeResult /> : <TextResult />;
  return <TextResult />;
}
