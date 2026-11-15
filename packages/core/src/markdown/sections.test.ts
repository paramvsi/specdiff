// AMarkdown round 3: removed and added sections are grouped (never interleaved block by block), GFM tables are
// diffed cell by cell, and the section counts match the document (1 added, 1 removed, 4 edited in the app's sample).
import { describe, expect, it } from 'vitest';
import { diffMarkdown } from './diff';

describe('grouped removed / added runs', () => {
  it('a removed section and an added section are two blocks, not interleaved', () => {
    const x = diffMarkdown(
      '## Auth\n\nKeep this.\n\n## Rate limits\n\n100 requests per second per account.\n',
      '## Auth\n\nKeep this.\n\n## Migrating to v2\n\nSend currency on every create call. Older SDKs need 3.2.\n',
    );
    expect(x.blocks.map((b) => [b.status, b.heading?.text ?? b.type])).toEqual([
      ['same', 'Auth'],
      ['same', 'paragraph'],
      ['removed', 'Rate limits'],
      ['removed', 'paragraph'],
      ['added', 'Migrating to v2'],
      ['added', 'paragraph'],
    ]);
  });
  it('edits inside a hunk still pair, with the unpaired blocks around them grouped', () => {
    const x = diffMarkdown('Alpha beta gamma delta.\n\nOld intro.\n', 'Brand new lead paragraph here.\n\nAlpha beta gamma delta epsilon.\n');
    expect(x.blocks.map((b) => b.status)).toEqual(['added', 'edited', 'removed']);
  });
});

describe('GFM tables, cell by cell', () => {
  const t = (rows: string[][]) => ['| Header | Value |', '| --- | --- |', ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n') + '\n';
  it('a changed value cell is marked in its own cell; the key cell is untouched', () => {
    const x = diffMarkdown(t([['Authorization', 'Bearer'], ['Idempotency-Key', 'Optional']]), t([['Authorization', 'Bearer'], ['Idempotency-Key', 'Required for POST']]));
    const html = x.blocks[0]!.html;
    expect(html).toContain('<td>Idempotency-Key</td>');
    expect(html).toContain('<td><del>Optional</del><ins>Required for POST</ins></td>');
    expect(html).not.toMatch(/Idempotency-<del>|KeyOptional/);
  });
  it('added and removed rows are whole rows', () => {
    const x = diffMarkdown(t([['A', '1'], ['B', '2'], ['D', '4']]), t([['A', '1'], ['C', '3'], ['D', '4']]));
    const html = x.blocks[0]!.html.replace(/\n/g, '');
    expect(html).toContain('<tr><td><del>B</del></td><td><del>2</del></td></tr>');
    expect(html).toContain('<tr><td><ins>C</ins></td><td><ins>3</ins></td></tr>');
    expect(html).toContain('<tr><td>D</td><td>4</td></tr>');
  });
});

describe('round 4: edits stay edits (AMarkdown)', () => {
  it('a sentence appended to a short paragraph is one edited paragraph, not removed + added', () => {
    const x = diffMarkdown(
      'Create a payment with `POST /v1/payments`.\n',
      'Create a payment with `POST /v1/payments`. The `currency` field is required and must be an ISO 4217 code.\n',
    );
    expect(x.blocks.map((b) => b.status)).toEqual(['edited']);
    expect(x.blocks[0]!.html).toContain('<ins>');
    expect(x.blocks[0]!.html).not.toContain('<del>');
  });
  it('two unrelated short paragraphs are still removed + added', () => {
    const x = diffMarkdown('Old intro.\n', 'Brand new lead paragraph here, about something else.\n');
    expect(x.blocks.map((b) => b.status)).toEqual(['removed', 'added']);
  });
  it('a renamed heading whose section body is unchanged is one edited heading, and the anchor check says renamed', () => {
    const x = diffMarkdown(
      '## Environment variables\n\nCopy `.env.example`. See [configuration](#environment-variables).\n',
      '## Configuration\n\nCopy `.env.example`. See [configuration](#environment-variables).\n',
    );
    expect(x.blocks.map((b) => [b.status, b.heading?.text ?? b.type])).toEqual([['edited', 'Configuration'], ['same', 'paragraph']]);
    expect(x.blocks[0]!.heading!.beforeText).toBe('Environment variables');
    expect(x.outline).toEqual([{ depth: 2, text: 'Configuration', slug: 'configuration', status: 'edited' }]);
    expect(x.brokenAnchors).toEqual([{ anchor: 'environment-variables', line: 3, renamedFrom: 'environment-variables', renamedTo: 'configuration' }]);
  });
  it('a heading of another depth is not a rename', () => {
    const x = diffMarkdown('## Setup\n\nBody.\n', '### Other\n\nBody.\n');
    expect(x.blocks.map((b) => b.status)).toEqual(['removed', 'added', 'same']);
  });
});

describe('section counts', () => {
  it("the app's README sample: 1 section added, 1 removed, 4 edited (Configuration is a rename)", () => {
    const d = diffMarkdown(README_BEFORE, README_AFTER);
    expect(d.sections).toEqual({ added: 1, removed: 1, edited: 4 });
    // Grouped: Rate limits (heading + paragraph) removed, then Migrating to v2 added.
    const tail = d.blocks.slice(-4).map((b) => `${b.status} ${b.heading?.text ?? b.type}`);
    expect(tail).toEqual(['removed Rate limits', 'removed paragraph', 'added Migrating to v2', 'added paragraph']);
  });
});

// A copy of the app's README sample (apps/app/src/lib/samples.ts; apps/app/src/screens/markdown/summary.test.ts
// checks the same counts on the real one). Core must not import app files.
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
