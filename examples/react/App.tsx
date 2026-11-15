// Minimal @specdiff/react example. Use it in any React 19 app (Vite, Next.js client component, …).
import '@specdiff/viewer/styles.css'; // tokens and Geist fonts, once
import '@specdiff/react/styles.css'; // SpecdiffDiff styles (published build)
import { SpecdiffDiff, SpecdiffViewer } from '@specdiff/react';

export function ApiReference() {
  return (
    <SpecdiffViewer
      url="/openapi/payments-v2.yaml"
      compareWith="/openapi/payments-v1.yaml"
      theme="system"
      brand={{ name: 'Acme', color: '#1f55c4' }}
    />
  );
}

export function ConfigDiff({ before, after }: { before: string; after: string }) {
  return <SpecdiffDiff before={before} after={after} label="Config changes" />;
}
