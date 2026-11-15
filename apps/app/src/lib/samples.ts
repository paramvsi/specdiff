// Sample comparisons for every mode (IN-05). Data from the designs (ACompare, A03-TextDiff, A07-JsonTree,
// AMarkdown / A08-MdSideBySide, A-09), so each designed state can be reached from a sample.
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

// A07-JsonTree: flags.prod.json → flags.staging.json. 7 differences in 226 values: a key-matched array (`key`),
// a keyed item changed, removed, added and moved (index 3 → 11), a type change, a change, null vs missing; the
// changed `updatedAt` is an ignored key (the sample turns ignore keys on, see SAMPLE_JSON_OPTIONS).
const FLAG_KEYS = [
  'search_v2', 'checkout_v2', 'dark_mode', 'new_pricing', 'saved_cards', 'apple_pay', 'beta_banner', 'refunds_ui',
  'payouts_daily', 'disputes_inbox', 'invoice_pdf', 'multi_currency', 'fx_quotes', 'risk_scores', 'card_updater',
  'webhooks_v2', 'audit_log', 'sso_login', 'team_roles', 'api_keys_v2', 'usage_alerts', 'tax_ids', 'receipts_email',
  'onboarding_v3',
];
const flag = (key: string, i: number) => ({
  key,
  enabled: key === 'checkout_v2' ? false : i % 3 !== 0,
  owner: ['payments', 'growth', 'platform'][i % 3],
  percent: (i * 5) % 100,
  description: `${key.replace(/_/g, ' ')} rollout`,
  since: `2026-0${(i % 9) + 1}-01`,
  ticket: `PAY-${1200 + i}`,
  env: i % 2 ? 'all' : 'prod',
  kind: i % 4 ? 'release' : 'ops',
});
function flagsDoc(staging: boolean): string {
  const flags = FLAG_KEYS.map(flag);
  const doc: Record<string, unknown> = {
    flags,
    limits: { maxUpload: '25MB', timeoutMs: 30000 },
    rollout: { region: null, percent: 25, stage: 'canary' },
    owners: ['payments', 'growth', 'platform'],
    updatedAt: '2026-11-01T09:00:00Z',
    version: 41,
  };
  if (!staging) return JSON.stringify(doc, null, 2) + '\n';
  const next = flags.filter((f) => f.key !== 'beta_banner' && f.key !== 'new_pricing');
  next.splice(11, 0, flags[3]!); // new_pricing: index 3 → 11
  next.find((f) => f.key === 'checkout_v2')!.enabled = true;
  next.push(flag('fraud_rules_v3', 24));
  return (
    JSON.stringify(
      {
        ...doc,
        flags: next,
        limits: { maxUpload: 26214400, timeoutMs: 45000 },
        rollout: { percent: 25, stage: 'canary' },
        updatedAt: '2026-11-14T17:30:00Z',
      },
      null,
      2,
    ) + '\n'
  );
}

// AMarkdown + A08-MdSideBySide: a renamed heading that breaks an anchor, changed links, a changed code block,
// a GFM table, an added and a removed section.
const README_BEFORE = `# Payments API

## Quick start

Create a payment with \`POST /v1/payments\`.

Amounts are sent in cents, as integers.

Read the full [integration guide](https://docs.example.com/v1) before going live.

\`\`\`bash
curl -X POST https://api.example.com/v1/payments \\
  -d amount=5000
\`\`\`

## Running locally

Install dependencies with npm install and start the dev server. Setup notes are in [setup](docs/setup).

## Environment variables

Copy \`.env.example\` to \`.env\`. See [configuration](#environment-variables).

## Authentication

| Header | Value |
| --- | --- |
| Authorization | Bearer sk_test_… |
| Idempotency-Key | Optional |

## Rate limits

100 requests per second per account.
`;
const README_AFTER = `# Payments API

## Quick start

Create a payment with \`POST /v1/payments\`. The \`currency\` field is required and must be an ISO 4217 code.

Amounts are sent in the smallest currency unit, as integers.

Read the full [integration guide](https://docs.example.com/v2) before going live.

\`\`\`bash
curl -X POST https://api.example.com/v1/payments \\
  -d amount=5000 -d currency=AED
\`\`\`

## Running locally

Install dependencies with pnpm install and start the dev server with pnpm dev. Setup notes are in [setup](docs/getting-started).

## Configuration

Copy \`.env.example\` to \`.env\`. See [configuration](#environment-variables).

## Authentication

| Header | Value |
| --- | --- |
| Authorization | Bearer sk_test_… |
| Idempotency-Key | Required for POST |

## Migrating to v2

Send currency on every create call. Older SDKs need version 3.2 or later.
`;

// A-09: PaymentService.java (PR). One logic change (currency no longer defaults to USD), one move
// (validateCurrency), a local rename (amount → amt, 4 uses) and a reformatted method (no logic change).
const JAVA_BEFORE = `package com.acme.payments;

import java.util.Objects;

public class PaymentService {
  private static final long MIN_AMOUNT = 50;
  private final Gateway gateway;

  public PaymentService(Gateway gateway) {
    this.gateway = gateway;
  }

  public Payment create(PaymentRequest req) {
    var currency = req.currency() != null ? req.currency() : "USD";
    validateCurrency(currency);
    return gateway.charge(req.amount(), currency, req.source());
  }

  void checkAmount(PaymentRequest req) {
    var amount = req.amount();
    if (amount < MIN_AMOUNT) {
      throw new InvalidAmountException(amount);
    }
    audit("amount ok", amount);
  }

  public Refund refund(Payment payment, long amount, String reason) { if (amount <= 0) { throw new InvalidAmountException(amount); } if (amount > payment.amount()) { throw new InvalidAmountException(amount); } var refund = new Refund(payment.id(), amount, reason); gateway.refund(refund); audit("refund", amount); return refund; }

  private void audit(String what, long amount) {
    System.out.println(what + ": " + amount);
  }

  void validateCurrency(String currency) {
    if (currency.length() != 3) {
      throw new InvalidCurrencyException(currency);
    }
  }
}
`;
const JAVA_AFTER = `package com.acme.payments;

import java.util.Objects;

public class PaymentService {
  private static final long MIN_AMOUNT = 50;
  private final Gateway gateway;

  public PaymentService(Gateway gateway) {
    this.gateway = gateway;
  }

  void validateCurrency(String currency) {
    if (currency.length() != 3) {
      throw new InvalidCurrencyException(currency);
    }
  }

  public Payment create(PaymentRequest req) {
    var currency = Objects.requireNonNull(req.currency());
    validateCurrency(currency);
    return gateway.charge(req.amount(), currency, req.source());
  }

  void checkAmount(PaymentRequest req) {
    var amt = req.amount();
    if (amt < MIN_AMOUNT) {
      throw new InvalidAmountException(amt);
    }
    audit("amount ok", amt);
  }

  public Refund refund(Payment payment, long amount, String reason) {
    if (amount <= 0) {
      throw new InvalidAmountException(amount);
    }
    if (amount > payment.amount()) {
      throw new InvalidAmountException(amount);
    }
    var refund = new Refund(payment.id(), amount, reason);
    gateway.refund(refund);
    audit("refund", amount);
    return refund;
  }

  private void audit(String what, long amount) {
    System.out.println(what + ": " + amount);
  }
}
`;

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
      before: src('flags.prod.json', flagsDoc(false)),
      after: src('flags.staging.json', flagsDoc(true)),
    },
    {
      id: 'markdown',
      label: 'Markdown',
      before: src('README.md', README_BEFORE),
      after: src('README.md (edited)', README_AFTER),
    },
    {
      id: 'code',
      label: 'Java',
      before: src('PaymentService.java', JAVA_BEFORE),
      after: src('PaymentService.java (PR)', JAVA_AFTER),
    },
    {
      id: 'text',
      label: 'Log file',
      before: src('build-main.log', log(false)),
      after: src('build-pr-482.log', log(true)),
    },
  ];
}

/** A07-JsonTree's options: these keys are ignored (the sample's `updatedAt` changes but is not a difference). */
export const SAMPLE_JSON_IGNORE_KEYS = ['updatedAt', 'requestId'];

/** The filters shown in A-03; the text sample turns them on. */
export const SAMPLE_FILTERS = [
  { name: 'Timestamps', pattern: '\\d{4}-\\d{2}-\\d{2}T[\\d:.]+Z', replace: '‹time›' },
  { name: 'Request IDs', pattern: 'req_[a-z0-9]{8,}', replace: '‹req-id›' },
];
