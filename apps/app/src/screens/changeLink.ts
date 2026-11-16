// M-20: "Copy link to this change" copies a full share link (what Share makes with "Open on the current
// change" ticked), so it opens the comparison in any tab or browser. The #change= anchor stays for back/forward.
import type { ToastOptions } from '@specdiff/ui';
import { useNav } from '../shell/nav';
import { useApp } from '../state/store';

export async function copyChangeLink(id: string, toast: (t: ToastOptions) => void): Promise<void> {
  const { before, after, result, mode, settings, decisions } = useApp.getState();
  if (!before || !after) return;
  const [{ encodeShare, SHARE_WARN_BYTES }, { comparisonFile, sharePayload }, { copyText, download }] = await Promise.all([
    import('@specdiff/core/share'),
    import('./ShareDialog'),
    import('./ExportMenu'),
  ]);
  // The Share dialog's defaults: rules included, decisions not.
  const input = { before, after, result, mode, settings, decisions, includeRules: true, includeDecisions: false, changeId: id, tab: useNav.getState().tab };
  const link = `${location.origin}${location.pathname}#${await encodeShare(sharePayload(input))}`;
  const ok = await copyText(link);
  if (new Blob([link]).size > SHARE_WARN_BYTES) {
    toast({
      title: 'Link is long',
      description: `Some apps cut links over ${Math.round(SHARE_WARN_BYTES / 1024)} KB.${ok ? ' It is copied; the file always works.' : ''}`,
      tone: 'warning',
      action: { label: 'Download file', onClick: () => { const f = comparisonFile(input); download(f.name, f.content, f.type); } },
    });
    return;
  }
  toast(ok ? { title: 'Link to this change copied' } : { title: 'Could not copy the link', tone: 'error' });
}
