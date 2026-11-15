// Swagger 2.0 / OpenAPI 3.0 → 3.1 for display (the Viewer). Comparisons upgrade inside compareOpenApi.
import { upgrade } from '@scalar/openapi-parser';

export function upgradeSpec<T extends object>(doc: T): Record<string, unknown> {
  return upgrade(structuredClone(doc) as Record<string, unknown>).specification as unknown as Record<string, unknown>;
}
