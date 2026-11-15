// "31 hunks of YAML. Or 3 things that matter." before/after slider (W-01). React island.
// A real <input type="range"> drives the split; the visible handle follows it and shows its focus ring.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

type Row = [string, 'hunk' | 'ctx' | 'rem' | 'add'];
const diff: Row[] = [
  ['@@ -127,3 +127,4 @@ paths./v1/payments.post', 'hunk'],
  ['             required:', 'ctx'],
  ['-              - amount', 'rem'],
  ['+              - amount', 'add'],
  ['+              - currency', 'add'],
  ['@@ -203,7 +204,7 @@ components.schemas', 'hunk'],
  ['-  PaymentState:', 'rem'],
  ['+  PaymentStatus:', 'add'],
  ['@@ -412,9 +413,6 @@', 'hunk'],
  ['-          last4:', 'rem'],
  ['-            type: string', 'rem'],
  ["-            pattern: '^[0-9]{4}$'", 'rem'],
  ['+          fingerprint:', 'add'],
  ['+            type: string', 'add'],
  ['@@ -488,12 +486,12 @@', 'hunk'],
  ['-      tags: [payments, cards]', 'rem'],
  ['+      tags: [cards, payments]', 'add'],
  ['@@ 26 more hunks @@', 'hunk'],
];

type Finding = { sev: 'breaking' | 'docs' | 'safe'; sym: string; label: string; title: string; note: string };
const findings: Finding[] = [
  { sev: 'breaking', sym: '!', label: 'Breaking', title: 'currency is now required', note: 'POST /v1/payments · clients without it get 400' },
  { sev: 'breaking', sym: '!', label: 'Breaking', title: 'Card.last4 removed', note: 'Shared schema, reported once · 3 endpoints' },
  { sev: 'docs', sym: '¶', label: 'Docs only', title: 'Tags reordered', note: 'No effect on clients · hidden from the changelog' },
  { sev: 'safe', sym: '+', label: 'Safe', title: 'fingerprint added', note: 'New optional response field' },
];

export default function BeforeAfter() {
  const [pos, setPos] = useState(46);
  return (
    <div className="ba">
      <div className="ba-left">
        {diff.map(([text, kind], i) => (
          <div key={i} className={`ba-row ba-${kind}`}>
            {text}
          </div>
        ))}
      </div>
      <div className="ba-right" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
        <ul className="ba-cards">
          {findings.map((f) => (
            <li key={f.title} className="ba-card">
              <span className="ba-card-top">
                <span className={`sev sev-${f.sev}`}>
                  <span className="sev-sym" aria-hidden="true">
                    {f.sym}
                  </span>
                  {f.label}
                </span>
                <span className="ba-card-title">{f.title}</span>
              </span>
              <span className="ba-card-note">{f.note}</span>
            </li>
          ))}
        </ul>
      </div>
      <span className="ba-tag ba-tag-git" aria-hidden="true">
        git diff
      </span>
      <span className="ba-tag ba-tag-sd" aria-hidden="true">
        specdiff
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Compare git diff with Specdiff"
        aria-valuetext={`${pos}% git diff, ${100 - pos}% Specdiff`}
        className="ba-input"
      />
      <span className="ba-handle" aria-hidden="true" style={{ left: `${pos}%` }}>
        <span className="ba-knob">
          <ChevronLeft size={14} />
          <ChevronRight size={14} />
        </span>
      </span>
    </div>
  );
}
