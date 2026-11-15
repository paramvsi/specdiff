// A03-Patch (TX-12): open a pasted unified patch or `git diff` output as a text comparison.
import { looksLikePatch, parseUnifiedPatch, type PatchFile } from '@specdiff/core/text/patch';
import { Button } from '@specdiff/ui';
import * as icons from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Source } from '../../lib/input';
import { useApp } from '../../state/store';
import css from './PatchPanel.module.css';

export { looksLikePatch };

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

function toSource(name: string, content: string, patch: PatchFile['beforeSide']): Source {
  return { name, content, size: new Blob([content]).size, origin: { kind: 'paste' }, patch };
}

export function PatchPanel({ initial, onClose }: { initial: string; onClose: () => void }) {
  const { setSource, setMode, compare } = useApp();
  const [patch, setPatch] = useState(initial);
  const [pick, setPick] = useState(0);
  const parsed = useMemo((): { files: PatchFile[]; error?: string } => {
    if (!looksLikePatch(patch)) return { files: [] };
    try {
      return { files: parseUnifiedPatch(patch) };
    } catch (e) {
      return { files: [], error: e instanceof Error ? e.message : String(e) };
    }
  }, [patch]);
  const files = parsed.files;
  const file = files[Math.min(pick, files.length - 1)];
  const hunks = files.reduce((n, f) => n + f.hunks, 0);
  const isGit = /^diff --git /m.test(patch);

  const show = async () => {
    if (!file) return;
    const oldName = file.oldName && file.oldName !== '/dev/null' ? file.oldName : file.name;
    setSource('before', toSource(oldName, file.before, file.beforeSide));
    setSource('after', toSource(file.name, file.after, file.afterSide));
    setMode('text');
    await compare();
  };

  return (
    <div className={css.page}>
      <div className={css.top}>
        <h1 className={css.h1}>Open a patch</h1>
        <Button variant="secondary" icon={<icons.ChevronLeft size={15} />} onClick={onClose}>
          Back
        </Button>
      </div>
      <div className={css.grid}>
        <div className={css.card}>
          <label htmlFor="sd-patch" className={css.cardHead}>
            Pasted patch
          </label>
          <textarea
            id="sd-patch"
            className={css.patch}
            spellCheck={false}
            value={patch}
            placeholder={'Paste the output of git diff, or any unified diff'}
            onChange={(e) => {
              setPatch(e.target.value);
              setPick(0);
            }}
          />
        </div>
        <aside className={css.side} aria-labelledby="sd-patch-title">
          {files.length ? (
            <>
              <h2 id="sd-patch-title" className={css.h2}>
                This looks like a {isGit ? 'git patch' : 'patch'}
              </h2>
              <p className={css.lead}>
                {plural(files.length, 'file')}, {plural(hunks, 'hunk')}. A patch only holds the changed
                lines, so Specdiff can show it as a text diff. For an OpenAPI comparison with
                severities, it needs the full files.
              </p>
              {files.length > 1 && (
                <fieldset className={css.files}>
                  <legend>Choose a file</legend>
                  {files.map((f, i) => (
                    <label key={`${f.name}-${i}`} className={css.file}>
                      <input
                        type="radio"
                        name="sd-patch-file"
                        checked={i === pick}
                        onChange={() => setPick(i)}
                      />
                      <span className={css.fileName}>{f.name}</span>
                      <span className={css.counts}>
                        <span className={css.add}>+{f.added}</span>{' '}
                        <span className={css.del}>−{f.removed}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}
              <Button variant="brand" className={css.wide} onClick={() => void show()}>
                Show as text diff
              </Button>
              <Button variant="secondary" className={css.wide} onClick={onClose}>
                Compare full files instead
              </Button>
              <p className={css.terminal}>
                From a terminal:{' '}
                <code>
                  npx specdiff-cli HEAD~1:{file?.name} {file?.name}
                </code>
              </p>
            </>
          ) : (
            <>
              <h2 id="sd-patch-title" className={css.h2}>
                {patch.trim() ? "This doesn't look like a patch" : 'Paste a patch'}
              </h2>
              <p className={css.lead}>
                {parsed.error ??
                  'Paste the output of git diff or diff -u: file headers (--- and +++) followed by hunks that start with @@.'}
              </p>
              <Button variant="secondary" className={css.wide} onClick={onClose}>
                Compare full files instead
              </Button>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
