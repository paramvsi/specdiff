// "Runs where you already work." package tabs with a typed terminal (W-01). React island.
// Commands use `specdiff-cli` (docs/10 B-11) and the example counts from docs/10 B-2.
import { Fragment, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

type Pkg = 'cli' | 'hook' | 'spring' | 'react' | 'express' | 'script';
const tabs: Array<[Pkg, string]> = [
  ['cli', 'CLI'],
  ['hook', 'Pre-commit'],
  ['spring', 'Spring Boot'],
  ['react', 'React'],
  ['express', 'Express and Fastify'],
  ['script', 'Script tag'],
];

const K = ({ children }: { children: ReactNode }) => <span className="t-key">{children}</span>;
const S = ({ children }: { children: ReactNode }) => <span className="t-str">{children}</span>;
const C = ({ children }: { children: ReactNode }) => <span className="t-com">{children}</span>;

const WIDE = 'npx specdiff-cli main:openapi.yaml openapi.yaml --ci';
const NARROW = 'npx specdiff-cli a.yaml b.yaml --ci';

function Typed({ text, className }: { text: string; className: string }) {
  return (
    <div className={`term-cmd ${className}`}>
      <span className="t-prompt" aria-hidden="true">
        $
      </span>
      <span className="term-type" style={{ ['--w' as string]: `${text.length}ch`, ['--n' as string]: text.length }}>
        {text}
      </span>
      <span className="term-cursor" aria-hidden="true" />
    </div>
  );
}

function Cli() {
  return (
    <div className="term-body">
      <Typed text={WIDE} className="only-wide" />
      <Typed text={NARROW} className="only-narrow" />
      <div className="term-out t-muted" style={{ animationDelay: '2.6s' }}>
        Comparing main → working tree…
      </div>
      <div className="term-out t-red" style={{ animationDelay: '2.85s' }}>
        ✖ 4 breaking{'  '}? 1 possibly{'  '}+ 14 safe
      </div>
      <div className="term-out t-key" style={{ animationDelay: '3.1s' }}>
        Suggested version: 2.0.0 (major)
      </div>
      <div className="term-out t-muted" style={{ animationDelay: '3.35s' }}>
        Exit code 1<span className="only-wide"> · breaking changes found</span>
      </div>
    </div>
  );
}

const snippets: Record<Exclude<Pkg, 'cli'>, ReactNode> = {
  hook: (
    <>
      <C># .pre-commit-config.yaml</C>
      {'\n'}
      <K>repos</K>:{'\n'}
      {'  - repo: local\n    '}
      <K>hooks</K>:{'\n'}
      {'      - id: specdiff\n        entry: npx specdiff-cli --ci --fail-on breaking\n               '}
      <S>HEAD:openapi.yaml</S> <S>openapi.yaml</S>
      {'\n        language: system\n        pass_filenames: false\n        files: '}
      <S>{'openapi\\.yaml$'}</S>
    </>
  ),
  spring: (
    <>
      {'<'}
      <K>dependency</K>
      {'>\n  <groupId>io.github.paramvsi</groupId>\n  <artifactId>specdiff-spring-boot-starter</artifactId>\n</'}
      <K>dependency</K>
      {'>\n\n'}
      <C># then open http://localhost:8080/specdiff</C>
    </>
  ),
  react: (
    <>
      <K>import</K> {'{ SpecdiffViewer } '}
      <K>from</K> <S>{"'@specdiff/react'"}</S>
      {'\n\n<SpecdiffViewer\n  url='}
      <S>{'"/openapi.json"'}</S>
      {'\n  compareWith='}
      <S>{'"/openapi-1.5.json"'}</S>
      {'\n/>'}
    </>
  ),
  express: (
    <>
      <C>{'// Express'}</C>
      {'\n'}
      <K>import</K> {'{ specdiff } '}
      <K>from</K> <S>{"'@specdiff/express'"}</S>
      {'\napp.use('}
      <S>{"'/docs'"}</S>
      {', specdiff({ spec: '}
      <S>{"'./openapi.yaml'"}</S>
      {' }))\n\n'}
      <C>{'// Fastify'}</C>
      {'\n'}
      <K>import</K> {'{ specdiffFastify } '}
      <K>from</K> <S>{"'@specdiff/express'"}</S>
      {'\nawait app.register(specdiffFastify, { prefix: '}
      <S>{"'/docs'"}</S>
      {', spec: '}
      <S>{"'./openapi.yaml'"}</S>
      {' })'}
    </>
  ),
  script: (
    <>
      {'<'}
      <K>script</K>
      {' src='}
      <S>{'"…/@specdiff/embed"'}</S>
      {'></'}
      <K>script</K>
      {'>\n<'}
      <K>script</K>
      {'>\n  Specdiff.mount(el, { url: '}
      <S>{"'/openapi.json'"}</S>
      {' })\n</'}
      <K>script</K>
      {'>'}
    </>
  ),
};

export default function PackageTabs() {
  const [pkg, setPkg] = useState<Pkg>('cli');
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setPkg(tabs[next]![0]);
    refs.current[next]?.focus();
  };

  return (
    <div className="pk">
      <div role="tablist" aria-label="Package" className="seg">
        {tabs.map(([id, label], i) => (
          <button
            key={id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`pk-tab-${id}`}
            aria-selected={pkg === id}
            aria-controls="pk-panel"
            tabIndex={pkg === id ? 0 : -1}
            className="seg-tab"
            onClick={() => setPkg(id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="term">
        <div className="term-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div role="tabpanel" id="pk-panel" aria-labelledby={`pk-tab-${pkg}`} tabIndex={0} className="term-panel">
          <Fragment key={pkg}>{pkg === 'cli' ? <Cli /> : <pre className="term-pre">{snippets[pkg]}</pre>}</Fragment>
        </div>
      </div>
    </div>
  );
}
