import { describe, expect, it } from 'vitest';
import { Config } from '../schemas';
import { diffText } from './diff';
import { layoutPatch, looksLikePatch, parseUnifiedPatch } from './patch';

const opts = Config.parse({}).text;

const GIT = `diff --git a/openapi.yaml b/openapi.yaml
index 3f1c2ab..9e04d71 100644
--- a/openapi.yaml
+++ b/openapi.yaml
@@ -127,3 +127,3 @@ paths:
       schema:
-            required: [amount]
+            required: [amount, currency]
       type: object
@@ -140,2 +140,3 @@ components:
 x
+y
 z
diff --git a/README.md b/README.md
index 1111111..2222222 100644
--- a/README.md
+++ b/README.md
@@ -1,2 +1,2 @@
 # Payments
-Old intro
+New intro
`;

describe('looksLikePatch (TX-12)', () => {
  it('detects git diff and plain unified diff output', () => {
    expect(looksLikePatch(GIT)).toBe(true);
    expect(looksLikePatch('--- before.txt\t2026-11-14\n+++ after.txt\t2026-11-15\n@@ -1 +1 @@\n-a\n+b\n')).toBe(true);
  });

  it('does not misfire on normal text', () => {
    const texts = [
      '# Title\n\n---\n\nSome text\n+++ not a header\n',
      'apiVersion: v1\n---\nkind: Pod\n',
      'We discussed @@ -1,2 +1,2 @@ in the meeting.\n',
      '- item one\n+ item two\n- item three\n',
      '2026-11-14T09:12:00Z INFO boot ok\n2026-11-14T09:12:01Z INFO done\n',
      '',
    ];
    for (const t of texts) expect(looksLikePatch(t), t).toBe(false);
  });
});

describe('parseUnifiedPatch', () => {
  it('splits a multi-file git diff and rebuilds before/after hunks with real line numbers', () => {
    const files = parseUnifiedPatch(GIT);
    expect(files.map((f) => [f.name, f.hunks, f.added, f.removed])).toEqual([
      ['openapi.yaml', 2, 2, 1],
      ['README.md', 1, 1, 1],
    ]);
    const f = files[0]!;
    expect(f.before).toBe('      schema:\n            required: [amount]\n      type: object\nx\nz\n');
    expect(f.after).toBe('      schema:\n            required: [amount, currency]\n      type: object\nx\ny\nz\n');
    expect(f.beforeSide.lines).toEqual([127, 128, 129, 140, 141]);
    expect(f.afterSide.lines).toEqual([127, 128, 129, 140, 141, 142]);
    expect(f.beforeSide.hunks).toEqual([{ at: 0, skipped: 126 }, { at: 3, skipped: 10 }]);
  });

  it('handles "\\ No newline at end of file" and new files', () => {
    const p = 'diff --git a/b.txt b/b.txt\nnew file mode 100644\n--- /dev/null\n+++ b/b.txt\n@@ -0,0 +1,2 @@\n+one\n+two\n\\ No newline at end of file\n';
    const [f] = parseUnifiedPatch(p);
    expect(f!.name).toBe('b.txt');
    expect(f!.before).toBe('');
    expect(f!.after).toBe('one\ntwo\n');
    expect(f!.afterSide.lines).toEqual([1, 2]);
  });

  it('A03-Patch: a hunk whose header counts more lines than it holds (a trimmed paste) is read as it is', () => {
    const text = 'diff --git a/openapi.yaml b/openapi.yaml\nindex 3f1c2ab..9e04d71 100644\n--- a/openapi.yaml\n+++ b/openapi.yaml\n@@ -127,3 +127,3 @@\n-            required: [amount]\n+            required: [amount, currency]\n';
    const [f, ...rest] = parseUnifiedPatch(text);
    expect(rest).toEqual([]);
    expect(f).toMatchObject({ name: 'openapi.yaml', hunks: 1, added: 1, removed: 1, before: '            required: [amount]\n', after: '            required: [amount, currency]\n' });
    expect(f!.beforeSide.lines).toEqual([127]);
    // A second file after a short hunk is still its own file.
    const two = parseUnifiedPatch(text + '--- a/b.txt\n+++ b/b.txt\n@@ -1,2 +1,2 @@\n-x\n+y\n');
    expect(two.map((x) => [x.name, x.added, x.removed])).toEqual([['openapi.yaml', 1, 1], ['b.txt', 1, 1]]);
  });
  it('throws a readable error on a malformed hunk', () => {
    expect(() => parseUnifiedPatch('--- a\n+++ b\n@@ -1,1 +1,1 @@\n-a\n+b\n@@ -9,2 +9,2 @@\nnope\n')).toThrow(/can't be read/);
  });
});

describe('layoutPatch', () => {
  it('renumbers rows and adds folds for the lines the patch leaves out', () => {
    const f = parseUnifiedPatch(GIT)[0]!;
    const d = layoutPatch(diffText(f.before, f.after, opts), f.beforeSide, f.afterSide);
    expect(d.rows[0]!.left!.n).toBe(127);
    expect(d.rows.at(-1)!.right!.n).toBe(142);
    expect(d.gaps).toEqual([
      { row: 0, before: 126, after: 126 },
      { row: 3, before: 10, after: 10 },
    ]);
  });
});
