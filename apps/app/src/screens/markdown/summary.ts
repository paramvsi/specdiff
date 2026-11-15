// Markdown summary of a Markdown comparison (export). Plain text only: tags are stripped from core's HTML.
import type { MdBlock, MdDiff } from '@specdiff/core/markdown';

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'" };
export const plainText = (html: string) =>
  html
    .replace(/<del>[\s\S]*?<\/del>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39|#x27);/g, (_, e: string) => ENT[e] ?? '')
    .replace(/\s+/g, ' ')
    .trim();

const SYM = { added: '+', removed: '−', edited: '~', same: '' } as const;
const WORD = { added: 'Added', removed: 'Removed', edited: 'Edited', same: '' } as const;

export function blockLabel(b: MdBlock): string {
  if (b.heading) return b.heading.text;
  const t = plainText(b.html);
  return t.length > 80 ? `${t.slice(0, 79)}…` : t || b.type;
}

export function mdSummary(d: MdDiff, names: { before: string; after: string }): string {
  const s = d.stats;
  const lines = [
    `# ${names.before} → ${names.after}`,
    '',
    `${s.added} added, ${s.removed} removed, ${s.edited} edited.`,
    '',
  ];
  const changed = d.blocks.filter((b) => b.status !== 'same');
  if (changed.length) {
    lines.push('## Changed blocks', '');
    for (const b of changed) {
      const line = b.lines.after?.[0] ?? b.lines.before?.[0];
      lines.push(`- ${SYM[b.status]} ${WORD[b.status]} ${b.type}${line ? ` (line ${line})` : ''}: ${blockLabel(b)}`);
    }
    lines.push('');
  }
  const links = d.blocks.flatMap((b) => b.links ?? []);
  if (links.length) {
    lines.push('## Links changed', '');
    for (const l of links) lines.push(`- ${l.text || '(no text)'}: ${l.before || '(none)'} → ${l.after}`);
    lines.push('');
  }
  if (d.brokenAnchors.length) {
    lines.push('## Broken anchors', '');
    for (const a of d.brokenAnchors)
      lines.push(`- #${a.anchor} (line ${a.line})${a.renamedTo ? `: heading renamed to #${a.renamedTo}` : ''}`);
    lines.push('');
  }
  return lines.join('\n');
}
