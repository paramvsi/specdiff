// IN-06: reload one side from where it came. URL: fetch again. File: re-read it, or ask for the same file again.
// Pasted text has nowhere to reload from, so the button is not shown for it.
import { Button, useToast } from '@specdiff/ui';
import * as icons from 'lucide-react';
import { useRef, useState } from 'react';
import { canReload, fromFile, reloadSource, type LoadError, type Source } from '../../lib/input';
import { useApp, type Side } from '../../state/store';

export function ReloadButton({
  side,
  onReloaded,
  className,
}: {
  side: Side;
  onReloaded?: ((s: Source) => void) | undefined;
  className?: string | undefined;
}) {
  const src = useApp((s) => s[side]);
  const setSource = useApp((s) => s.setSource);
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  if (!src || !canReload(src)) return null;
  const sideName = side === 'before' ? 'before' : 'after';

  const done = (s: Source) => {
    setSource(side, s);
    toast({ title: `Reloaded ${s.name}`, tone: 'success' });
    onReloaded?.(s);
  };
  const fail = (e: unknown) =>
    toast({
      title: `Couldn't reload ${src.name}`,
      description: (e as LoadError)?.message ?? String(e),
      tone: 'error',
    });

  const reload = async () => {
    setBusy(true);
    try {
      const r = await reloadSource(src);
      if (r === 'pick') {
        toast({
          title: `Choose ${src.name} again`,
          description: "Your browser can't re-read a file on its own. Pick the same file to reload it.",
          tone: 'info',
        });
        input.current?.click();
      } else done(r);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant="secondary"
        className={className}
        icon={<icons.RotateCw size={15} />}
        aria-label={`Reload ${sideName}: ${src.name}`}
        disabled={busy}
        onClick={() => void reload()}
      >
        {busy ? 'Reloading…' : 'Reload'}
      </Button>
      <input
        ref={input}
        type="file"
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            const s = await fromFile(f);
            if (f.name !== src.name && !src.name.startsWith(f.name.replace(/\.zip$/i, '')))
              toast({ title: `You picked ${f.name}`, description: `It replaces ${src.name}.`, tone: 'info' });
            done(s);
          } catch (err) {
            fail(err);
          }
        }}
      />
    </>
  );
}
