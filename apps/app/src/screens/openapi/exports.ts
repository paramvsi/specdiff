// OpenAPI exports for the top-bar Export menu (OUT-03). The OpenAPI result screen fills these in;
// until then every kind returns null and the menu says the export isn't available.
export type OpenApiExportKind = 'markdown' | 'json' | 'html';

export const OPENAPI_EXPORTS: ReadonlyArray<{ kind: OpenApiExportKind; label: string }> = [
  { kind: 'markdown', label: 'Changelog (.md)' },
  { kind: 'json', label: 'JSON report (.json)' },
  { kind: 'html', label: 'HTML report (.html)' },
];

export interface OpenApiExportFile {
  name: string;
  content: string;
  type: string;
}

export function exportOpenApi(kind: OpenApiExportKind): OpenApiExportFile | null {
  void kind;
  return null;
}
