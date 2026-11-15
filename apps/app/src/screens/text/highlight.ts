// TX-03: syntax highlighting with Shiki's fine-grained core and the JavaScript regex engine (no WASM, no eval:
// the CSP has no 'unsafe-eval'). The highlighter and every grammar load lazily, the first time they are needed.
// Colours come from a CSS-variables theme: each token gets `var(--sd-syn-…)`, defined from --sd-* tokens in
// TextResult.module.css, so light and dark follow the app theme.
import type { HighlighterCore } from 'shiki/core';

type Loader = () => Promise<{ default: unknown }>;

/** 70 grammars; each is its own lazy chunk. */
const LANGS: Record<string, Loader> = {
  'typescript': () => import('shiki/langs/typescript.mjs'),
  'tsx': () => import('shiki/langs/tsx.mjs'),
  'javascript': () => import('shiki/langs/javascript.mjs'),
  'jsx': () => import('shiki/langs/jsx.mjs'),
  'json': () => import('shiki/langs/json.mjs'),
  'jsonc': () => import('shiki/langs/jsonc.mjs'),
  'json5': () => import('shiki/langs/json5.mjs'),
  'yaml': () => import('shiki/langs/yaml.mjs'),
  'toml': () => import('shiki/langs/toml.mjs'),
  'ini': () => import('shiki/langs/ini.mjs'),
  'xml': () => import('shiki/langs/xml.mjs'),
  'html': () => import('shiki/langs/html.mjs'),
  'css': () => import('shiki/langs/css.mjs'),
  'scss': () => import('shiki/langs/scss.mjs'),
  'less': () => import('shiki/langs/less.mjs'),
  'markdown': () => import('shiki/langs/markdown.mjs'),
  'python': () => import('shiki/langs/python.mjs'),
  'java': () => import('shiki/langs/java.mjs'),
  'kotlin': () => import('shiki/langs/kotlin.mjs'),
  'scala': () => import('shiki/langs/scala.mjs'),
  'groovy': () => import('shiki/langs/groovy.mjs'),
  'go': () => import('shiki/langs/go.mjs'),
  'rust': () => import('shiki/langs/rust.mjs'),
  'c': () => import('shiki/langs/c.mjs'),
  'cpp': () => import('shiki/langs/cpp.mjs'),
  'csharp': () => import('shiki/langs/csharp.mjs'),
  'fsharp': () => import('shiki/langs/fsharp.mjs'),
  'swift': () => import('shiki/langs/swift.mjs'),
  'objective-c': () => import('shiki/langs/objective-c.mjs'),
  'php': () => import('shiki/langs/php.mjs'),
  'ruby': () => import('shiki/langs/ruby.mjs'),
  'perl': () => import('shiki/langs/perl.mjs'),
  'lua': () => import('shiki/langs/lua.mjs'),
  'r': () => import('shiki/langs/r.mjs'),
  'julia': () => import('shiki/langs/julia.mjs'),
  'dart': () => import('shiki/langs/dart.mjs'),
  'elixir': () => import('shiki/langs/elixir.mjs'),
  'erlang': () => import('shiki/langs/erlang.mjs'),
  'haskell': () => import('shiki/langs/haskell.mjs'),
  'clojure': () => import('shiki/langs/clojure.mjs'),
  'ocaml': () => import('shiki/langs/ocaml.mjs'),
  'sql': () => import('shiki/langs/sql.mjs'),
  'graphql': () => import('shiki/langs/graphql.mjs'),
  'shellscript': () => import('shiki/langs/shellscript.mjs'),
  'powershell': () => import('shiki/langs/powershell.mjs'),
  'bat': () => import('shiki/langs/bat.mjs'),
  'dockerfile': () => import('shiki/langs/dockerfile.mjs'),
  'make': () => import('shiki/langs/make.mjs'),
  'cmake': () => import('shiki/langs/cmake.mjs'),
  'nginx': () => import('shiki/langs/nginx.mjs'),
  'hcl': () => import('shiki/langs/hcl.mjs'),
  'terraform': () => import('shiki/langs/terraform.mjs'),
  'proto': () => import('shiki/langs/proto.mjs'),
  'diff': () => import('shiki/langs/diff.mjs'),
  'vue': () => import('shiki/langs/vue.mjs'),
  'svelte': () => import('shiki/langs/svelte.mjs'),
  'latex': () => import('shiki/langs/latex.mjs'),
  'zig': () => import('shiki/langs/zig.mjs'),
  'nim': () => import('shiki/langs/nim.mjs'),
  'vb': () => import('shiki/langs/vb.mjs'),
  'matlab': () => import('shiki/langs/matlab.mjs'),
  'solidity': () => import('shiki/langs/solidity.mjs'),
  'prisma': () => import('shiki/langs/prisma.mjs'),
  'astro': () => import('shiki/langs/astro.mjs'),
  'properties': () => import('shiki/langs/properties.mjs'),
  'dotenv': () => import('shiki/langs/dotenv.mjs'),
  'nix': () => import('shiki/langs/nix.mjs'),
  'elm': () => import('shiki/langs/elm.mjs'),
  'crystal': () => import('shiki/langs/crystal.mjs'),
  'gleam': () => import('shiki/langs/gleam.mjs'),
};

const EXT: Record<string, string> = {
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'tsx', js: 'javascript', mjs: 'javascript',
  cjs: 'javascript', jsx: 'jsx', json: 'json', jsonc: 'jsonc', json5: 'json5', yaml: 'yaml', yml: 'yaml',
  toml: 'toml', ini: 'ini', cfg: 'ini', conf: 'ini', xml: 'xml', svg: 'xml', xsd: 'xml', plist: 'xml',
  html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less', md: 'markdown', markdown: 'markdown',
  mdx: 'markdown', py: 'python', pyi: 'python', java: 'java', kt: 'kotlin', kts: 'kotlin', scala: 'scala',
  sc: 'scala', groovy: 'groovy', gradle: 'groovy', go: 'go', rs: 'rust', c: 'c', h: 'c', cc: 'cpp',
  cpp: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp', cs: 'csharp', fs: 'fsharp', fsx: 'fsharp', swift: 'swift',
  m: 'objective-c', mm: 'objective-c', php: 'php', rb: 'ruby', pl: 'perl', pm: 'perl', lua: 'lua', r: 'r',
  jl: 'julia', dart: 'dart', ex: 'elixir', exs: 'elixir', erl: 'erlang', hrl: 'erlang', hs: 'haskell',
  clj: 'clojure', cljs: 'clojure', edn: 'clojure', ml: 'ocaml', mli: 'ocaml', sql: 'sql', graphql: 'graphql',
  gql: 'graphql', sh: 'shellscript', bash: 'shellscript', zsh: 'shellscript', ps1: 'powershell',
  psm1: 'powershell', bat: 'bat', cmd: 'bat', dockerfile: 'dockerfile', mk: 'make', cmake: 'cmake',
  nginx: 'nginx', hcl: 'hcl', tf: 'terraform', tfvars: 'terraform', proto: 'proto', diff: 'diff',
  patch: 'diff', vue: 'vue', svelte: 'svelte', tex: 'latex', zig: 'zig', nim: 'nim', vb: 'vb',
  sol: 'solidity', prisma: 'prisma', astro: 'astro', properties: 'properties', env: 'dotenv', nix: 'nix',
  elm: 'elm', cr: 'crystal', gleam: 'gleam',
};

const NAMES: Record<string, string> = {
  dockerfile: 'dockerfile', makefile: 'make', gnumakefile: 'make', 'cmakelists.txt': 'cmake',
  '.env': 'dotenv', gemfile: 'ruby', rakefile: 'ruby', jenkinsfile: 'groovy',
};

/** Core's code-mode language names (`@specdiff/core/detect`) that differ from Shiki ids. */
const DETECTED: Record<string, string> = { shell: 'shellscript' };

export const LANGUAGE_COUNT = Object.keys(LANGS).length;

/** Highlighting turns itself off above these, to keep scrolling smooth. */
export const MAX_ROWS = 5000;
export const MAX_BYTES = 2 * 1024 * 1024;

/** The Shiki language for a file name (extension first, then well-known names), or the detected code language. */
export function languageFor(name: string | undefined, detected?: string): string | null {
  const base = (name ?? '').toLowerCase().replace(/\s*\([^)]*\)$/, '').split('/').pop() ?? '';
  if (NAMES[base]) return NAMES[base]!;
  const ext = base.includes('.') ? base.split('.').pop()! : '';
  const byExt = EXT[ext];
  if (byExt) return byExt;
  const d = detected ? (DETECTED[detected] ?? detected) : null;
  return d && LANGS[d] ? d : null;
}

export interface Token {
  content: string;
  /** A `var(--sd-syn-…)` reference, never a raw colour. */
  color?: string;
}

let core: Promise<HighlighterCore> | null = null;
function highlighter(): Promise<HighlighterCore> {
  core ??= Promise.all([import('shiki/core'), import('shiki/engine/javascript')]).then(
    ([{ createHighlighterCore, createCssVariablesTheme }, { createJavaScriptRegexEngine }]) =>
      createHighlighterCore({
        themes: [createCssVariablesTheme({ name: 'sd', variablePrefix: '--sd-syn-', fontStyle: false })],
        langs: [],
        // forgiving: a pattern the JS engine can't translate fails to match instead of throwing.
        engine: createJavaScriptRegexEngine({ forgiving: true }),
      }),
  );
  return core;
}

/** Tokenise text as one file in `lang`; one array of tokens per line. */
export async function tokenize(lang: string, text: string): Promise<Token[][]> {
  const load = LANGS[lang];
  if (!load) return [];
  const h = await highlighter();
  if (!h.getLoadedLanguages().includes(lang)) {
    const mod = await load();
    await h.loadLanguage(mod.default as Parameters<HighlighterCore['loadLanguage']>[0]);
  }
  return h.codeToTokensBase(text, { lang, theme: 'sd' }).map((line) =>
    line.map((t) => (t.color?.startsWith('var(--sd-syn-') ? { content: t.content, color: t.color } : { content: t.content })),
  );
}
