// Sample comparisons for every mode (IN-05). Copy from the designs (ACompare, A03-TextDiff).
import type { Source } from './input';

const fixtures = import.meta.glob<string>('../../../../fixtures/samples/*.{yaml,json}', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const fx = (name: string) => Object.entries(fixtures).find(([p]) => p.endsWith(`/${name}`))?.[1];

const src = (name: string, content: string): Source => ({
  name,
  content,
  size: new Blob([content]).size,
});

const OPENAPI_FALLBACK_L =
  'openapi: 3.1.0\ninfo:\n  title: Payments\n  version: 1.5.0\npaths:\n  /v1/payments:\n    post:\n      requestBody:\n        content:\n          application/json:\n            schema:\n              type: object\n              required: [amount]\n              properties:\n                amount: { type: integer }\n                currency: { type: string }\n      responses:\n        "201": { description: Created }\n';
const OPENAPI_FALLBACK_R = OPENAPI_FALLBACK_L.replace('1.5.0', '2.0.0').replace(
  'required: [amount]',
  'required: [amount, currency]',
);

const log = (pr: boolean) => {
  const lines: string[] = [];
  const t = (i: number) =>
    `2026-11-${pr ? 15 : 14}T09:${String(10 + (i % 50)).padStart(2, '0')}:0${i % 10}.${pr ? 482 : 113}Z`;
  const rid = (i: number) =>
    `req_${(pr ? 'b' : 'a').repeat(2)}${(i * 7919).toString(36).padStart(8, '0')}`;
  for (let i = 1; i <= 40; i++) lines.push(`${t(i)} INFO boot step ${i} ok ${rid(i)}`);
  lines.push(`${t(41)} INFO http listening on :8080 ${rid(41)}`);
  lines.push(pr ? `${t(42)} INFO db pool size 25` : `${t(42)} INFO db pool size 10`);
  lines.push(
    pr
      ? `${t(43)} INFO cache connected: redis-primary:6379`
      : `${t(43)} WARN cache disabled: REDIS_URL not set`,
  );
  lines.push(`${t(44)} INFO loaded 212 routes`);
  lines.push(pr ? `${t(45)} INFO feature flags: checkout_v2` : `${t(45)} INFO feature flags: none`);
  lines.push(`${t(46)} INFO migrations up to date ${rid(46)}`);
  lines.push(
    pr ? `${t(47)} INFO health check ok in 38 ms` : `${t(47)} INFO health check ok in 41 ms`,
  );
  lines.push(`${t(48)} INFO worker queue: payouts`);
  if (pr) lines.push(`${t(49)} INFO worker queue: refunds`);
  for (let i = 50; i < 368; i++) lines.push(`${t(i)} INFO request served ${rid(i)}`);
  return lines.join('\n') + '\n';
};

export interface Sample {
  id: string;
  label: string;
  before: Source;
  after: Source;
}

export function samples(): Sample[] {
  return [
    {
      id: 'openapi',
      label: 'OpenAPI',
      before: src('payments-v1.yaml', fx('payments-v1.yaml') ?? OPENAPI_FALLBACK_L),
      after: src('payments-v2.yaml', fx('payments-v2.yaml') ?? OPENAPI_FALLBACK_R),
    },
    {
      id: 'json',
      label: 'JSON config',
      before: src(
        'config.prod.json',
        '{\n  "region": "me-central-1",\n  "retries": 3,\n  "features": ["refunds", "payouts"]\n}\n',
      ),
      after: src(
        'config.next.json',
        '{\n  "retries": 5,\n  "region": "me-central-1",\n  "features": ["payouts", "refunds", "disputes"]\n}\n',
      ),
    },
    {
      id: 'markdown',
      label: 'Markdown',
      before: src(
        'README.md',
        '# Payments API\n\nCreate a payment with `POST /v1/payments`.\n\nSee the [guide](https://docs.example.com/v1).\n',
      ),
      after: src(
        'README.md (new)',
        '# Payments API\n\nCreate a payment with `POST /v1/payments`.\nThe `currency` field is required.\n\nSee the [guide](https://docs.example.com/v2).\n',
      ),
    },
    {
      id: 'code',
      label: 'TypeScript',
      before: src(
        'client.ts',
        "export async function pay(amount: number) {\n  return api.post('/v1/payments', { amount });\n}\n",
      ),
      after: src(
        'client.ts (new)',
        "export async function pay(amount: number, currency = 'AED') {\n  return api.post('/v1/payments', { amount, currency });\n}\n",
      ),
    },
    {
      id: 'text',
      label: 'Log file',
      before: src('build-main.log', log(false)),
      after: src('build-pr-482.log', log(true)),
    },
  ];
}

/** The filters shown in A-03; the text sample turns them on. */
export const SAMPLE_FILTERS = [
  { name: 'Timestamps', pattern: '\\d{4}-\\d{2}-\\d{2}T[\\d:.]+Z', replace: '‹time›' },
  { name: 'Request IDs', pattern: 'req_[a-z0-9]{8,}', replace: '‹req-id›' },
];
