// A-12 Rules and settings (SET-01..SET-07, OA-19). One .specdiff.yaml, shared with the CLI.
import { Config, rules, type ConfigInput, type Severity } from '@specdiff/core';
import { Button, Checkbox, RadioCardGroup, SeverityBadge, Switch, TextField, useToast } from '@specdiff/ui';
import * as icons from 'lucide-react';
import { useRef, useState } from 'react';
import { parse, stringify } from 'yaml';
import { useApp, type DiffTheme, type Theme } from '../state/store';
import { download, rulesOn } from './openapi/util';
import css from './Settings.module.css';

type Section = 'rules' | 'ignore' | 'diff' | 'appearance' | 'file';
const SECTIONS: Array<[Section, string]> = [['rules', 'Rules'], ['ignore', 'Ignore paths'], ['diff', 'Diff options'], ['appearance', 'Appearance'], ['file', 'Rule-set file']];
const SEV: Array<[Severity, string]> = [['breaking', 'Breaking'], ['possibly', 'Possibly breaking'], ['safe', 'Safe'], ['docs', 'Docs only']];
const reported = rules.filter((r) => r.reportedAs === 'change' && r.severity);
// The rules reference lists every rule (76); these few aren't changes of their own, so they have no severity to set.
const notSet = rules.filter((r) => !(r.reportedAs === 'change' && r.severity));
const WHY: Record<string, string> = {
  contained: 'Reported as the changes inside it',
  'version-check': 'The version check on the Summary',
  'not-reported': 'Set in Diff options',
};

export default function Settings() {
  const { settings, updateConfig, setSettings } = useApp();
  const [section, setSection] = useState<Section>('rules');
  const config = Config.parse(settings.config);
  return (
    <div className={css.page}>
      <div className={css.layout}>
        <nav aria-label="Settings sections" className={css.nav}>
          {SECTIONS.map(([s, label]) => <button key={s} type="button" className={css.navItem} aria-current={section === s ? 'page' : undefined} onClick={() => setSection(s)}>{label}</button>)}
        </nav>
        <div className={css.content}>
          {section === 'rules' && <Rules config={config} />}
          {section === 'ignore' && <Ignore config={config} />}
          {section === 'diff' && <DiffOptions config={config} />}
          {section === 'appearance' && <Appearance theme={settings.theme} diffTheme={settings.diffTheme} userName={settings.userName} onChange={setSettings} />}
          {section === 'file' && <RuleSetFile config={config} onImport={(c) => updateConfig(() => c)} />}
        </div>
      </div>
    </div>
  );

  function Rules({ config }: { config: Config }) {
    const { toast } = useToast();
    const [q, setQ] = useState('');
    const fileInput = useRef<HTMLInputElement>(null);
    const match = (r: (typeof rules)[number]) => !q || r.id.includes(q.toLowerCase()) || r.area.toLowerCase().includes(q.toLowerCase());
    const list = reported.filter(match);
    const fixed = notSet.filter(match);
    const effective = (id: string, def: Severity) => config.rules[id]?.severity ?? (config.preset === 'sdk' && reported.find((r) => r.id === id)?.preset === 'K→B' ? 'breaking' : def);
    const changed = Object.keys(config.rules).filter((k) => config.rules[k]?.severity || config.rules[k]?.enabled === false).length;
    // Same count as the Summary's "Rules on N of M" (A-04).
    const { on } = rulesOn(config);
    const setRule = (id: string, patch: { severity?: Severity; enabled?: boolean }) => updateConfig((c) => {
      const cur = { ...(c.rules?.[id] ?? {}), ...patch };
      const def = reported.find((r) => r.id === id)!;
      if (cur.severity === def.severity) delete cur.severity;
      if (cur.enabled === true) delete cur.enabled;
      const rulesCfg = { ...(c.rules ?? {}) };
      if (Object.keys(cur).length) rulesCfg[id] = cur; else delete rulesCfg[id];
      return { ...c, rules: rulesCfg };
    });
    return (
      <>
        <header className={css.head}>
          <div>
            <h1 className={css.h1}>Rules</h1>
            <p className={css.lead}>Choose which changes count as breaking. These settings live in <code>.specdiff.yaml</code>, which the CLI and pre-commit hook read too. All {rules.length} rules from the rules reference are listed; {notSet.length} of them aren't changes of their own, so they have no severity to set.</p>
          </div>
          <div className={css.headActions}>
            <Button variant="secondary" icon={<icons.Upload size={15} />} onClick={() => fileInput.current?.click()}>Import .specdiff.yaml</Button>
            <Button variant="secondary" icon={<icons.Download size={15} />} onClick={() => download('specdiff.yaml', toYaml(settings.config), 'application/yaml')}>Export</Button>
            <input ref={fileInput} type="file" hidden accept=".yaml,.yml" onChange={async (e) => {
              const f = e.target.files?.[0]; e.target.value = '';
              if (!f) return;
              const r = readConfig(await f.text());
              if ('error' in r) toast({ title: "That .specdiff.yaml isn't valid", description: r.error, tone: 'error' });
              else { updateConfig(() => r.config); toast({ title: 'Rules imported' }); }
            }} />
          </div>
        </header>
        <RadioCardGroup legend="Strictness" value={config.preset} onValueChange={(p) => updateConfig((c) => ({ ...c, preset: p }))} options={[
          { value: 'wire', title: 'Wire', description: 'Flags what breaks HTTP requests and responses. Right for most public APIs.' },
          { value: 'sdk', title: 'SDK', description: 'Also flags changes that break generated clients: renamed operationIds, schemas and enum names.' },
        ]} />
        <div className={css.tools}>
          <TextField label={`Search ${rules.length} rules`} hideLabel placeholder={`Search ${rules.length} rules`} value={q} onChange={(e) => setQ(e.target.value)} icon={<icons.Search size={15} />} />
          <span className={css.muted}>{on} on · {changed} changed by you</span>
          <Button variant="secondary" disabled={!changed} onClick={() => updateConfig((c) => ({ ...c, rules: {} }))}>Reset to defaults</Button>
        </div>
        <table className={css.table}>
          <thead><tr><th scope="col">Rule</th><th scope="col">Area</th><th scope="col">Default</th><th scope="col">Your severity</th><th scope="col">On</th></tr></thead>
          <tbody>
            {list.map((r) => {
              const enabled = config.rules[r.id]?.enabled !== false;
              const sev = effective(r.id, r.severity!);
              return (
                <tr key={r.id} data-off={!enabled || undefined}>
                  <th scope="row"><code>{r.id}</code>{config.rules[r.id]?.severity && <span className={css.tagChanged}>Changed</span>}{r.preset === 'K→B' && <span className={css.tagSdk}>SDK preset</span>}</th>
                  <td>{r.area}</td>
                  <td><SeverityBadge severity={r.severity!} /></td>
                  <td>
                    <select aria-label={`Severity for ${r.id}`} className={css.select} value={sev} onChange={(e) => setRule(r.id, { severity: e.target.value as Severity })}>
                      {SEV.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </td>
                  <td><Switch label={`${r.id} on`} hideLabel checked={enabled} onCheckedChange={(v) => setRule(r.id, { enabled: v })} /></td>
                </tr>
              );
            })}
            {fixed.map((r) => (
              <tr key={r.id} data-fixed>
                <th scope="row"><code>{r.id}</code></th>
                <td>{r.area}</td>
                <td><span className={css.muted}>No severity</span></td>
                <td colSpan={2}><span className={css.muted}>{WHY[r.reportedAs ?? ''] ?? 'Not configurable'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  }

  function Ignore({ config }: { config: Config }) {
    const [value, setValue] = useState(config.ignore.paths.join('\n'));
    return (
      <>
        <h1 className={css.h1}>Ignore paths</h1>
        <p className={css.lead}>Changes under these paths are not reported. One glob per line. Globs with a <code>/</code> match operation paths (<code>/v1/admin/**</code>); others match any key (<code>x-internal-*</code>).</p>
        <label className={css.area}>
          <span>Paths</span>
          <textarea value={value} onChange={(e) => setValue(e.target.value)} onBlur={() => updateConfig((c) => ({ ...c, ignore: { ...(c.ignore ?? {}), paths: value.split('\n').map((s) => s.trim()).filter(Boolean) } }))} placeholder={'x-internal-*\n/v1/admin/**'} />
        </label>
        <Checkbox label="Ignore vendor extensions (x-*)" checked={config.ignore.extensions} onCheckedChange={(v) => updateConfig((c) => ({ ...c, ignore: { ...(c.ignore ?? {}), extensions: v } }))} />
      </>
    );
  }

  function DiffOptions({ config }: { config: Config }) {
    const o = config.openapi, j = config.json, t = config.text;
    const setO = (p: Partial<typeof o>) => updateConfig((c) => ({ ...c, openapi: { ...(c.openapi ?? {}), ...p } }));
    const setJ = (p: Partial<typeof j>) => updateConfig((c) => ({ ...c, json: { ...(c.json ?? {}), ...p } }));
    const setT = (p: Partial<typeof t>) => updateConfig((c) => ({ ...c, text: { ...(c.text ?? {}), ...p } }));
    return (
      <>
        <h1 className={css.h1}>Diff options</h1>
        <fieldset className={css.group}><legend>OpenAPI</legend>
          <Checkbox label="Treat an inline schema and an equal $ref as the same" checked={o.matchInlineRefs} onCheckedChange={(v) => setO({ matchInlineRefs: v })} />
          <Checkbox label="Header names are case-insensitive" checked={o.caseInsensitiveHeaders} onCheckedChange={(v) => setO({ caseInsensitiveHeaders: v })} />
          <Checkbox label="Flatten allOf before comparing" checked={o.flattenAllOf} onCheckedChange={(v) => setO({ flattenAllOf: v })} />
          <Checkbox label="Merge path-level parameters into operations" checked={o.mergePathParams} onCheckedChange={(v) => setO({ mergePathParams: v })} />
          <Checkbox label="Upgrade Swagger 2.0 and OpenAPI 3.0 to 3.1" checked={o.autoUpgrade} onCheckedChange={(v) => setO({ autoUpgrade: v })} />
          <Checkbox label="Path parameter names matter ({id} → {userId} is a change)" checked={o.includePathParamNames} onCheckedChange={(v) => setO({ includePathParamNames: v })} />
          <Checkbox label="Hide docs-only changes" checked={o.hideDocsOnly} onCheckedChange={(v) => setO({ hideDocsOnly: v })} />
          <Checkbox label="Ignore examples" checked={o.ignoreExamples} onCheckedChange={(v) => setO({ ignoreExamples: v })} />
          <TextField label="Sunset grace period (days)" inputMode="numeric" value={String(o.sunsetGracePeriodDays)} onChange={(e) => setO({ sunsetGracePeriodDays: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
        </fieldset>
        <fieldset className={css.group}><legend>JSON and YAML</legend>
          <Checkbox label="Ignore key order" checked={j.ignoreKeyOrder} onCheckedChange={(v) => setJ({ ignoreKeyOrder: v })} />
          <Checkbox label="Ignore array order" checked={j.ignoreArrayOrder} onCheckedChange={(v) => setJ({ ignoreArrayOrder: v })} />
          <Checkbox label="Treat null and missing as equal" checked={j.nullEqualsMissing} onCheckedChange={(v) => setJ({ nullEqualsMissing: v })} />
          <TextField label="Match array items by (auto tries id, uuid, key)" mono value={j.arrayMatchKey} onChange={(e) => setJ({ arrayMatchKey: e.target.value || 'auto' })} />
          <TextField label="Ignore keys (comma separated)" mono value={j.ignoreKeys.join(', ')} onChange={(e) => setJ({ ignoreKeys: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
          <TextField label="Number tolerance" mono inputMode="decimal" value={String(j.numberTolerance)} onChange={(e) => setJ({ numberTolerance: Number(e.target.value) || 0 })} />
        </fieldset>
        <fieldset className={css.group}><legend>Text</legend>
          <Checkbox label="Ignore whitespace" checked={t.ignoreWhitespace} onCheckedChange={(v) => setT({ ignoreWhitespace: v })} />
          <Checkbox label="Ignore case" checked={t.ignoreCase} onCheckedChange={(v) => setT({ ignoreCase: v })} />
          <Checkbox label="Ignore line endings" checked={t.ignoreLineEndings} onCheckedChange={(v) => setT({ ignoreLineEndings: v })} />
          <p className={css.muted}>Regex filters are edited in the text view’s Filters panel and saved here.</p>
        </fieldset>
        <fieldset className={css.group}><legend>Unicode</legend>
          <Checkbox label="Treat Unicode variants as equal (é typed as one character or as e + accent)" checked={config.unicodeNormalize} onCheckedChange={(v) => updateConfig((c) => ({ ...c, unicodeNormalize: v }))} />
        </fieldset>
      </>
    );
  }
}

function Appearance({ theme, diffTheme, userName, onChange }: { theme: Theme; diffTheme: DiffTheme; userName: string; onChange: (p: { theme?: Theme; diffTheme?: DiffTheme; userName?: string }) => void }) {
  return (
    <>
      <h1 className={css.h1}>Appearance</h1>
      <RadioCardGroup legend="Theme" value={theme} onValueChange={(v) => onChange({ theme: v })} options={[
        { value: 'light', title: 'Light', description: 'Graphite on a sage-grey ground.' },
        { value: 'dark', title: 'Dark', description: 'Stepped dark surfaces.' },
        { value: 'system', title: 'System', description: 'Follow your device.' },
      ]} />
      <RadioCardGroup legend="Diff colours" value={diffTheme} onValueChange={(v) => onChange({ diffTheme: v })} options={[
        { value: 'default', title: 'Default (blue and orange)', description: 'Colour-blind safe across protanopia, deuteranopia and tritanopia.' },
        { value: 'high-contrast', title: 'High contrast', description: 'Deeper colours for low vision.' },
      ]} />
      <TextField label="Your name for review decisions (optional)" hint="Saved in decisions.json as “by”. Stays in this browser." value={userName} onChange={(e) => onChange({ userName: e.target.value })} />
      <p className={css.muted}>Motion follows your system’s reduced-motion setting.</p>
    </>
  );
}

function RuleSetFile({ config, onImport }: { config: Config; onImport: (c: ConfigInput) => void }) {
  const [text, setText] = useState(() => toYaml(config));
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <h1 className={css.h1}>Rule-set file</h1>
      <p className={css.lead}>This is your <code>.specdiff.yaml</code>. Commit it next to your spec; the CLI looks for it in the current folder, then the repository root. Browsers save it as <code>specdiff.yaml</code>: rename it to <code>.specdiff.yaml</code>.</p>
      <label className={css.area}><span>.specdiff.yaml</span><textarea className={css.yaml} value={text} spellCheck={false} onChange={(e) => setText(e.target.value)} /></label>
      {error && <p role="alert" className={css.error}>{error}</p>}
      <div className={css.headActions}>
        <Button variant="brand" onClick={() => { const r = readConfig(text); if ('error' in r) setError(r.error); else { setError(null); onImport(r.config); } }}>Apply</Button>
        <Button variant="secondary" onClick={() => download('specdiff.yaml', text, 'application/yaml')}>Download</Button>
      </div>
    </>
  );
}

export function toYaml(c: ConfigInput | Config): string {
  return stringify({ version: 1, ...c });
}
export function readConfig(text: string): { config: ConfigInput } | { error: string } {
  let raw: unknown;
  try { raw = parse(text) ?? {}; } catch (e) { return { error: (e as Error).message.split('\n')[0]! }; }
  const r = Config.safeParse(raw);
  if (!r.success) return { error: r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ') };
  return { config: raw as ConfigInput };
}
