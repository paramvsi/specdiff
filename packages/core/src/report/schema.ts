// OUT-11: the published JSON Schema of the JSON report, generated from the Zod schema.
import { z } from 'zod';
import { Report } from '../schemas';

export function reportJsonSchema(): object {
  return { $id: 'https://spec-diff.netlify.app/schema/report-v1.json', title: 'Specdiff report', ...z.toJSONSchema(Report, { target: 'draft-2020-12', unrepresentable: 'any' }) };
}
