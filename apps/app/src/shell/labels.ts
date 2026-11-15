import type { CompareResult } from '../worker/protocol';

export function modeLabel(r: Exclude<CompareResult, { kind: 'parse' }>): string {
  if (r.mode === 'openapi') {
    const v = r.report.inputs.after.specVersion ?? '';
    return `${v.startsWith('2') ? 'Swagger' : 'OpenAPI'} ${v.split('.').slice(0, 2).join('.')}`.trim();
  }
  if (r.mode === 'code')
    return `Code: ${'language' in r && r.language ? r.language[0]!.toUpperCase() + r.language.slice(1) : ''}`.trim();
  return { json: 'JSON', yaml: 'YAML', markdown: 'Markdown', text: 'Text' }[r.mode];
}
