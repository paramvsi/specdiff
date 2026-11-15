// Authentication dialog (V-02 Auth, VW-05): API key, bearer, basic, OAuth2 client credentials.
// Tokens stay in memory unless "Remember in this browser" is ticked.
import { Button, Checkbox, Dialog, DialogClose, SegmentedControl, TextField, ViewerBadge } from '@specdiff/ui';
import { KeyRound } from 'lucide-react';
import { useState } from 'react';
import { useViewer } from './context';
import { deref, type Json, type Op } from './model';
import { fetchClientCredentialsToken, type AuthKind, type AuthState } from './request';
import css from './Viewer.module.css';

function schemeFor(spec: Json, op: Op | undefined): Json | undefined {
  const name = Object.keys(op?.security[0] ?? {})[0] ?? Object.keys(spec.components?.securitySchemes ?? {})[0];
  return name ? deref(spec, spec.components?.securitySchemes?.[name]) : undefined;
}

function kindOf(s: Json | undefined): AuthKind {
  if (s?.type === 'apiKey') return 'apiKey';
  if (s?.type === 'oauth2') return 'oauth2';
  if (s?.type === 'http' && s.scheme === 'basic') return 'basic';
  return 'bearer';
}

const OPTIONS: ReadonlyArray<{ value: AuthKind; label: string }> = [
  { value: 'apiKey', label: 'API key' },
  { value: 'bearer', label: 'Bearer' },
  { value: 'basic', label: 'Basic' },
  { value: 'oauth2', label: 'OAuth2' },
];

export function AuthDialog({ open, onOpenChange, op }: { open: boolean; onOpenChange: (o: boolean) => void; op?: Op }) {
  const v = useViewer();
  const { spec } = v.cur;
  const scheme = schemeFor(spec, op);
  const oauthScheme = Object.values<Json>(spec.components?.securitySchemes ?? {}).map((s) => deref(spec, s)).find((s) => s?.type === 'oauth2');
  const apiKeyScheme = Object.values<Json>(spec.components?.securitySchemes ?? {}).map((s) => deref(spec, s)).find((s) => s?.type === 'apiKey');
  const cc = oauthScheme?.flows?.clientCredentials ?? {};
  const scopes = Object.keys(cc.scopes ?? {});
  const prevScopes = new Set(Object.keys(Object.values<Json>(v.prev?.spec.components?.securitySchemes ?? {}).map((s) => deref(v.prev!.spec, s)).find((s) => s?.type === 'oauth2')?.flows?.clientCredentials?.scopes ?? {}));

  const fresh = (): AuthState => ({
    kind: v.auth?.kind ?? kindOf(scheme),
    apiKey: v.auth?.apiKey ?? { name: apiKeyScheme?.name ?? 'X-API-Key', in: apiKeyScheme?.in ?? 'header', value: '' },
    bearer: v.auth?.bearer ?? '',
    basic: v.auth?.basic ?? { user: '', pass: '' },
    oauth2: v.auth?.oauth2 ?? { tokenUrl: cc.tokenUrl ?? '', clientId: '', clientSecret: '', scopes },
  });
  const [s, setS] = useState<AuthState>(fresh);
  const [remember, setRemember] = useState(v.remembered);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) { setS(fresh()); setRemember(v.remembered); setError(undefined); }
  }

  const save = async () => {
    setError(undefined);
    let next = s;
    if (s.kind === 'oauth2' && s.oauth2) {
      setBusy(true);
      try {
        next = { ...s, oauth2: { ...s.oauth2, token: await fetchClientCredentialsToken(s.oauth2) } };
      } catch (e) {
        setError(e instanceof Error && !/fetch/i.test(e.message) ? e.message : 'The token request was blocked or failed. Check the token URL and its CORS settings.');
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    // Keep only the chosen method.
    const kept: AuthState = { kind: next.kind, ...(next.kind === 'apiKey' ? { apiKey: next.apiKey! } : next.kind === 'bearer' ? { bearer: next.bearer! } : next.kind === 'basic' ? { basic: next.basic! } : { oauth2: next.oauth2! }) };
    v.setAuth(kept, remember);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Authentication"
      description="Used for Try it requests from this page."
      className={css.authDialog}
      actions={
        <>
          <DialogClose asChild><Button>Cancel</Button></DialogClose>
          <Button variant="brand" icon={s.kind === 'oauth2' ? <KeyRound /> : undefined} onClick={() => void save()} disabled={busy}>
            {s.kind === 'oauth2' ? (busy ? 'Getting token…' : 'Get token') : 'Save'}
          </Button>
        </>
      }
    >
      <div className={css.formStack}>
        <SegmentedControl label="Authentication method" options={OPTIONS} value={s.kind} onValueChange={(kind) => setS((x) => ({ ...x, kind }))} />
        {s.kind === 'apiKey' ? (
          <>
            <TextField label="Header or query name" mono value={s.apiKey?.name ?? ''} onChange={(e) => setS((x) => ({ ...x, apiKey: { ...x.apiKey!, name: e.target.value } }))} hint={`Sent in the ${s.apiKey?.in ?? 'header'}.`} />
            <TextField label="API key" mono type="password" autoComplete="off" value={s.apiKey?.value ?? ''} onChange={(e) => setS((x) => ({ ...x, apiKey: { ...x.apiKey!, value: e.target.value } }))} />
          </>
        ) : null}
        {s.kind === 'bearer' ? <TextField label="Token" mono type="password" autoComplete="off" value={s.bearer ?? ''} onChange={(e) => setS((x) => ({ ...x, bearer: e.target.value }))} /> : null}
        {s.kind === 'basic' ? (
          <>
            <TextField label="Username" mono autoComplete="off" value={s.basic?.user ?? ''} onChange={(e) => setS((x) => ({ ...x, basic: { ...x.basic!, user: e.target.value } }))} />
            <TextField label="Password" mono type="password" autoComplete="off" value={s.basic?.pass ?? ''} onChange={(e) => setS((x) => ({ ...x, basic: { ...x.basic!, pass: e.target.value } }))} />
          </>
        ) : null}
        {s.kind === 'oauth2' ? (
          <>
            <TextField label="Token URL" mono value={s.oauth2?.tokenUrl ?? ''} onChange={(e) => setS((x) => ({ ...x, oauth2: { ...x.oauth2!, tokenUrl: e.target.value } }))} />
            <TextField label="Client ID" mono autoComplete="off" value={s.oauth2?.clientId ?? ''} onChange={(e) => setS((x) => ({ ...x, oauth2: { ...x.oauth2!, clientId: e.target.value } }))} />
            <TextField label="Client secret" mono type="password" autoComplete="off" value={s.oauth2?.clientSecret ?? ''} onChange={(e) => setS((x) => ({ ...x, oauth2: { ...x.oauth2!, clientSecret: e.target.value } }))} />
            {scopes.length ? (
              <fieldset className={css.fieldset}>
                <legend className={css.formLabel}>Scopes</legend>
                {scopes.map((sc) => (
                  <span key={sc} className={css.scopeRow}>
                    <Checkbox
                      label={sc}
                      checked={s.oauth2?.scopes.includes(sc) ?? false}
                      onCheckedChange={(c) => setS((x) => ({ ...x, oauth2: { ...x.oauth2!, scopes: c ? [...x.oauth2!.scopes, sc] : x.oauth2!.scopes.filter((y) => y !== sc) } }))}
                    />
                    {v.prev && !prevScopes.has(sc) ? <ViewerBadge kind="new" /> : null}
                  </span>
                ))}
              </fieldset>
            ) : null}
          </>
        ) : null}
        <div className={css.rememberBox}>
          <Checkbox label="Remember in this browser" checked={remember} onCheckedChange={setRemember} />
          <p className={css.rememberText}>Stored unencrypted in local storage. Anyone using this browser profile can read it. Off by default.</p>
        </div>
        {error ? <p className={css.errorSmall} role="alert"><span aria-hidden="true">! </span>{error}</p> : null}
      </div>
    </Dialog>
  );
}
