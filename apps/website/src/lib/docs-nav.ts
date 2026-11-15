// Docs sidebar (W-02). Order here is also the Previous/Next order.
export interface DocLink {
  label: string;
  href: string;
  /** Extra search words for the sidebar filter. */
  keywords?: string;
}
export const docsNav: Array<{ title: string; links: DocLink[] }> = [
  {
    title: 'Start',
    links: [
      { label: 'Getting started', href: '/docs/', keywords: 'install open compare sample' },
      { label: 'How it works', href: '/docs/how-it-works/', keywords: 'worker parse normalise rules' },
      { label: 'Privacy', href: '/docs/privacy/', keywords: 'upload data offline' },
      { label: 'FAQ', href: '/docs/faq/', keywords: 'cors limits size free' },
    ],
  },
  {
    title: 'Modes',
    links: [
      { label: 'OpenAPI', href: '/docs/openapi/', keywords: 'swagger spec breaking' },
      { label: 'JSON and YAML', href: '/docs/json-yaml/', keywords: 'patch config' },
      { label: 'Markdown', href: '/docs/markdown/', keywords: 'readme anchors' },
      { label: 'Text', href: '/docs/text/', keywords: 'filters mask diff' },
      { label: 'Code (Beta)', href: '/docs/code/', keywords: 'typescript java python tree-sitter' },
    ],
  },
  {
    title: 'Review',
    links: [
      { label: 'Severities', href: '/docs/severities/', keywords: 'breaking possibly safe docs version' },
      { label: 'Review decisions', href: '/docs/review/', keywords: 'accept reject decisions.json' },
      { label: 'Changelog and export', href: '/docs/export/', keywords: 'markdown json html report' },
      { label: 'Share links', href: '/docs/share-links/', keywords: 'passphrase url' },
    ],
  },
  {
    title: 'Packages',
    links: [
      { label: 'Overview', href: '/docs/packages/', keywords: 'npm maven install' },
      { label: 'CLI', href: '/docs/cli/', keywords: 'ci gitlab jenkins shell npx fail-on' },
      { label: 'Pre-commit hook', href: '/docs/pre-commit/', keywords: 'git hook' },
      { label: 'Spring Boot', href: '/docs/spring-boot/', keywords: 'java maven starter' },
      { label: 'React', href: '/docs/react/', keywords: 'component viewer' },
      { label: 'Express and Fastify', href: '/docs/express-fastify/', keywords: 'node middleware' },
      { label: 'Script tag', href: '/docs/embed/', keywords: 'embed mount' },
    ],
  },
  {
    title: 'Reference',
    links: [
      { label: 'Rules reference', href: '/rules/', keywords: 'catalogue' },
      { label: '.specdiff.yaml', href: '/docs/config/', keywords: 'config settings' },
      { label: 'Keyboard shortcuts', href: '/docs/keyboard-shortcuts/', keywords: 'keys' },
      { label: 'Changelog', href: '/changelog/', keywords: 'release rss' },
    ],
  },
];

export const flatDocs = docsNav.flatMap((g) => g.links.map((l) => ({ ...l, group: g.title })));

export function normalise(path: string): string {
  return path.endsWith('/') ? path : `${path}/`;
}
