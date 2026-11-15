// Links used across the website. The repository URL is an assumption until the owner publishes it.
export const REPO = 'https://github.com/paramvsi/specdiff';
export const APP = '/app/';
export const SAMPLE = '/app/?sample=openapi'; // WEB-02
export const CLI_PKG = 'specdiff-cli'; // docs/10 B-1, B-11: `npx specdiff` would run someone else's package.

export const footerColumns: Array<{ title: string; links: Array<[string, string]> }> = [
  {
    title: 'Product',
    links: [
      ['Open the app', APP],
      ['Viewer', '/#viewer'],
      ['Packages', '/docs/packages/'],
      ['Changelog', '/changelog/'],
    ],
  },
  {
    title: 'Docs',
    links: [
      ['Getting started', '/docs/'],
      ['OpenAPI mode', '/docs/openapi/'],
      ['Rules reference', '/rules/'],
      ['FAQ', '/docs/faq/'],
    ],
  },
  {
    title: 'Packages',
    links: [
      ['CLI', '/docs/cli/'],
      ['Pre-commit hook', '/docs/pre-commit/'],
      ['Spring Boot', '/docs/spring-boot/'],
      ['React and embed', '/docs/react/'],
    ],
  },
  {
    title: 'Project',
    links: [
      ['GitHub', REPO],
      ['MIT licence', `${REPO}/blob/main/LICENSE`],
      ['Report an issue', `${REPO}/issues`],
      ['Privacy', '/docs/privacy/'],
    ],
  },
];
