// Home v2 live demo (W-01, WEB-01, WEB-09): OpenAPI / JSON / YAML / Markdown tabs.
// Server-rendered only (no React in the browser, B-13): the OpenAPI tab is rendered live and the other
// tabs into <template data-panel>; src/scripts/islands.ts swaps them into the panel and runs the keyboard.
// The looping animation is CSS only (motion.css). Screen readers get a static summary per tab and the
// animated pieces are aria-hidden, so nothing is announced on every 9 s loop (no live region).

type Mode = 'openapi' | 'json' | 'md';
const tabs: Array<[Mode, string]> = [
  ['openapi', 'OpenAPI'],
  ['json', 'JSON / YAML'],
  ['md', 'Markdown'],
];

const specLines: Array<[string, string, ('rem' | 'add')?]> = [
  ['124', '/v1/payments:'],
  ['125', '  post:'],
  ['126', '    requestBody:'],
  ['127', '      schema:'],
  ['128', '        required: [amount]', 'rem'],
  ['', '        required: [amount, currency]', 'add'],
  ['129', '        properties:'],
  ['130', '          amount:   { type: integer }'],
  ['131', '          currency: { type: string }'],
  ['132', '  get:'],
  ['133', '    parameters:'],
  ['134', '      - name: limit'],
];

function Openapi() {
  return (
    <>
      <p className="sr-only">
        Example: in payments-v2.yaml, POST /v1/payments now requires currency. Specdiff reports it as breaking:
        clients that leave it out get 400 Bad Request. The comparison has 4 breaking and 14 safe changes, and the
        next version is 2.0.0, a major release.
      </p>
      <div className="demo-oa" aria-hidden="true">
        <div className="demo-spec">
          <p className="demo-file">payments-v2.yaml</p>
          <div className="demo-lines">
            <span className="demo-scan" />
            {specLines.map(([n, text, mark], i) => (
              <div key={i} className={`demo-line${mark ? ` demo-${mark}` : ''}`}>
                <span className="demo-ln">{n}</span>
                <span className="demo-code">{mark === 'add' ? <span className="demo-addtext">{text}</span> : text}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="demo-side">
          <div className="demo-counters">
            <div className="demo-counter">
              <span className="sev sev-breaking">
                <span className="sev-sym">!</span>Breaking
              </span>
              <span className="odo">
                <span className="odo-col odo-4">
                  {[0, 1, 2, 3, 4].map((d) => (
                    <span key={d}>{d}</span>
                  ))}
                </span>
              </span>
            </div>
            <div className="demo-counter">
              <span className="sev sev-safe">
                <span className="sev-sym">+</span>Safe
              </span>
              <span className="odo">
                <span className="odo-col odo-14">
                  <span>13</span>
                  <span>14</span>
                </span>
              </span>
            </div>
          </div>
          <div className="demo-card">
            <span className="demo-card-top">
              <span className="method m-post">POST</span>
              <span className="demo-path">/v1/payments</span>
              <span className="sev sev-breaking">
                <span className="sev-sym">!</span>Breaking
              </span>
            </span>
            <span className="demo-card-title">currency is now required</span>
            <span className="demo-card-body">
              Clients that leave it out get 400 Bad Request. Give it a default, or ship this in a major version.
            </span>
          </div>
          <div className="demo-ver">
            <span className="demo-ver-label">Next version</span>
            <span className="demo-ver-box">
              <span className="ver-old">1.6.0</span>
              <span className="ver-new">
                <span className="ver-major">major</span>
                <span className="ver-num">2.0.0</span>
              </span>
            </span>
          </div>
        </div>
      </div>
      <div className="demo-prog" aria-hidden="true">
        <span />
      </div>
    </>
  );
}

const jsonRows: Array<[number, string, string, string?, string?]> = [
  [0, '$', ' { 6 keys }'],
  [1, 'flags', ' matched by key'],
  [2, '[checkout_v2]', ' enabled: false → true', 'changed', '~ changed'],
  [2, '[new_pricing]', ' index 3 → 11', 'moved', '↕ moved'],
  [2, '[beta_banner]', ' { … }', 'removed', '− removed'],
  [1, 'limits.maxUpload', ' "25MB" → 26214400', 'type', 'type changed'],
  [1, 'updatedAt', ' ignored', 'masked', 'masked'],
];

function Json() {
  return (
    <div className="demo-json">
      <ul className="demo-tree" aria-label="Structural changes">
        {jsonRows.map(([depth, key, rest, kind, label], i) => (
          <li key={i} className={`tree-row${kind ? ` tree-${kind}` : ''}`} style={{ paddingLeft: 16 + depth * 20 }}>
            <span className="tree-text">
              <span className="tree-key">{key}</span>
              {rest}
            </span>
            {label ? <span className="tree-label">{label}</span> : null}
          </li>
        ))}
      </ul>
      <div className="demo-json-copy">
        <span className="demo-json-h">4 real changes, not 212 changed lines</span>
        <span className="demo-json-p">
          Key order is ignored, array items are matched by their id, and a moved item is a move. Export the result
          as a JSON Patch.
        </span>
      </div>
    </div>
  );
}

function Markdown() {
  return (
    <div className="demo-md">
      <h3>Running locally</h3>
      <p>
        Install dependencies with{' '}
        <del className="md-del">
          <span className="sr-only">removed: </span>npm install
        </del>{' '}
        <ins className="md-ins">
          <span className="sr-only">added: </span>pnpm install
        </ins>{' '}
        and start the dev server.
      </p>
      <div className="md-warn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 4l9 16H3z" />
          <path d="M12 10v4" />
          <path d="M12 17h.01" />
        </svg>
        <span>
          The heading “Environment variables” was renamed, but README line 12 still links to{' '}
          <code>#environment-variables</code>.
        </span>
      </div>
    </div>
  );
}

export default function DemoTabs() {
  const mode: Mode = 'openapi';
  return (
    <>
      <div className="demo-inner">
        <div className="demo-bar">
          <div role="tablist" aria-label="Demo mode" className="seg">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`demo-tab-${id}`}
                aria-selected={mode === id}
                aria-controls="demo-panel"
                tabIndex={mode === id ? 0 : -1}
                className="seg-tab"
              >
                {label}
              </button>
            ))}
          </div>
          <span className="demo-local">
            <span className="ping-dot" aria-hidden="true" />
            Running in this tab · nothing uploaded
          </span>
        </div>
        <div role="tabpanel" id="demo-panel" aria-labelledby={`demo-tab-${mode}`} tabIndex={0} className="demo-panel">
          <Openapi />
        </div>
      </div>
      <template data-panel="openapi">
        <Openapi />
      </template>
      <template data-panel="json">
        <Json />
      </template>
      <template data-panel="md">
        <Markdown />
      </template>
    </>
  );
}
