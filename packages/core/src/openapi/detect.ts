// Cheap OpenAPI detection without a full parse (used to pick the mode before a worker parses).

const YAML_KEY = /^(?:["']?)(openapi|swagger)(?:["']?)[ \t]*:[ \t]*["']?([0-9]+(?:\.[0-9]+)*)/m;
const JSON_KEY = /"(openapi|swagger)"\s*:\s*"?([0-9]+(?:\.[0-9]+)*)/;

export function detectOpenApi(content: string): { isOpenApi: boolean; specVersion?: string } {
  const head = content.trimStart();
  const m = head.startsWith('{') ? JSON_KEY.exec(content) : YAML_KEY.exec(content);
  if (!m || !m[2]) return { isOpenApi: false };
  const version = m[2];
  if (m[1] === 'swagger' && !version.startsWith('2')) return { isOpenApi: false };
  if (m[1] === 'openapi' && !version.startsWith('3')) return { isOpenApi: false };
  return { isOpenApi: true, specVersion: version };
}
