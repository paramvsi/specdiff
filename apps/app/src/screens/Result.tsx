import { IdenticalState } from '@specdiff/ui';
import { lazy } from 'react';
import { useApp } from '../state/store';
import { useDecisionToast, useQueuedToasts } from '../state/toasts';
import { TextResult } from './text/TextResult';

const OpenApiResult = lazy(() => import('./openapi/OpenApiResult'));
const JsonResult = lazy(() => import('./json/JsonResult'));
const MarkdownResult = lazy(() => import('./markdown/MarkdownResult'));
const CodeResult = lazy(() => import('./code/CodeResult'));

export function Result() {
  const { result, setScreen, updateConfig } = useApp();
  useDecisionToast();
  useQueuedToasts();
  if (!result || 'kind' in result) return null;
  // X-08: identical specs get the identical state, not a summary of zeros.
  if (result.mode === 'openapi' && result.report.summary.total === 0)
    return <Identical onNew={() => setScreen('compare')} />;
  if (result.mode === 'openapi') return <OpenApiResult />;
  if (result.mode === 'json' || result.mode === 'yaml')
    return 'json' in result ? <JsonResult /> : <TextResult />;
  if (result.mode === 'markdown') return 'markdown' in result ? <MarkdownResult /> : <TextResult />;
  if (result.mode === 'code') return 'code' in result ? <CodeResult /> : <TextResult />;
  if (result.text.identical && !result.text.filters.some((f) => f.hits)) {
    return (
      <>
        <IdenticalState
          ignoredLines={0}
          onShowFormatting={() => {
            updateConfig((c) => ({
              ...c,
              text: { ...c.text, ignoreWhitespace: false, ignoreLineEndings: false },
            }));
            void useApp.getState().compare();
          }}
        />
        <p>
          <button type="button" className="sd-link" onClick={() => setScreen('compare')}>
            New comparison
          </button>
        </p>
      </>
    );
  }
  return <TextResult />;
}

function Identical({ onNew }: { onNew: () => void }) {
  return (
    <>
      <IdenticalState ignoredLines={0} />
      <p>
        <button type="button" className="sd-link" onClick={onNew}>
          New comparison
        </button>
      </p>
    </>
  );
}
