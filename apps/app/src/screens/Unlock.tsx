// O-10 Unlock shared link (OUT-09). Decryption happens in this tab; the passphrase is never sent.
import { decodeShare, ShareError } from '@specdiff/core/share';
import { Button, TextField } from '@specdiff/ui';
import * as icons from 'lucide-react';
import { useState } from 'react';
import { openPayload, usePending } from '../shell/boot';
import { useApp } from '../state/store';
import css from './Unlock.module.css';

export default function Unlock() {
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unlock = async () => {
    if (!pass || busy) return;
    setBusy(true);
    setError(null);
    try {
      const payload = await decodeShare(usePending.hash, pass);
      usePending.hash = '';
      history.replaceState(null, '', location.pathname + location.search);
      await openPayload(payload);
    } catch (e) {
      setError(
        e instanceof ShareError && e.code === 'wrong-passphrase'
          ? 'That passphrase didn’t unlock it. Check for extra spaces.'
          : 'This link is damaged or incomplete, so it can’t be opened. Ask for a new link.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={css.page}>
      <section className={css.card} aria-labelledby="unlock-title">
        <div className={css.inner}>
          <span className={css.icon} aria-hidden="true">
            <icons.Lock size={18} />
          </span>
          <h1 id="unlock-title" className={css.h1}>
            This comparison is locked
          </h1>
          <p className={css.lead}>
            Whoever shared the link set a passphrase. Ask them for it; it isn’t stored anywhere
            else.
          </p>
          <form
            className={css.form}
            onSubmit={(e) => {
              e.preventDefault();
              void unlock();
            }}
          >
            <TextField
              label="Passphrase"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              error={error ?? undefined}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- the only task on this screen
              autoFocus
            />
            <p role="alert" className="sd-visually-hidden">
              {error}
            </p>
            <div className={css.actions}>
              <Button
                variant="brand"
                type="submit"
                icon={<icons.Lock size={15} />}
                disabled={!pass || busy}
              >
                {busy ? 'Unlocking…' : 'Unlock'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  usePending.hash = '';
                  history.replaceState(null, '', location.pathname);
                  useApp.getState().setScreen('compare');
                }}
              >
                Open the app
              </Button>
            </div>
          </form>
        </div>
        <p className={css.foot}>
          <icons.Shield size={13} aria-hidden="true" /> Decrypted in this browser. The passphrase is
          never sent.
        </p>
      </section>
    </div>
  );
}
