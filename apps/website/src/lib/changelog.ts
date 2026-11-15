// Specdiff's own changelog (W-06, WEB-06). Dates stay as placeholders until the owner fills them (D-13).
export interface Release {
  version: string;
  /** ISO date once known; until then the placeholder text from the design. */
  date: string;
  latest?: boolean;
  sections: Array<{ title: string; items: string[] }>;
}

export const releases: Release[] = [
  {
    version: '1.0.0',
    date: '[Launch date]',
    latest: true,
    sections: [
      {
        title: 'Added',
        items: [
          'Web app with OpenAPI, JSON / YAML, Markdown and text modes',
          'Code mode for TypeScript, JavaScript, Java and Python (Beta)',
          'Version-aware Viewer with Try it and per-endpoint history',
          'CLI, pre-commit hook, Spring Boot starter, React, Express and Fastify packages',
        ],
      },
      { title: 'Privacy', items: ['Share links can be locked with a passphrase'] },
    ],
  },
  {
    version: '0.9.0',
    date: '[Beta date]',
    sections: [
      { title: 'Added', items: ['Review decisions saved to .specdiff/decisions.json', 'Wire and SDK strictness presets'] },
      { title: 'Fixed', items: ['Recursive schemas reported once per cycle'] },
    ],
  },
];

/** True when the date is a real ISO date rather than a placeholder. */
export const hasDate = (r: Release) => /^\d{4}-\d{2}-\d{2}$/.test(r.date);
