// OUT-10: ask for the changelog feed's URL (its Atom id and self link) and title. Remembered in this browser.
import { Button, Dialog, TextField } from '@specdiff/ui';
import { useState } from 'react';
import { isHttpUrl, lastFeed, rememberFeed } from './exports';

export function FeedDialog({ defaultTitle, onDone, onCancel }: { defaultTitle: string; onDone: (feed: { url: string; title: string }) => void; onCancel: () => void }) {
  const last = lastFeed();
  const [url, setUrl] = useState(last.url);
  const [title, setTitle] = useState(last.title || defaultTitle);
  const [tried, setTried] = useState(false);
  const bad = !isHttpUrl(url.trim());
  const submit = () => {
    setTried(true);
    if (bad) return;
    const feed = { url: url.trim(), title: title.trim() || defaultTitle };
    rememberFeed(feed);
    onDone(feed);
  };
  return (
    <Dialog open title="Changelog feed" description="Publish changelog.xml next to your docs. Feed readers use its URL to tell new releases apart." onOpenChange={(o) => { if (!o) onCancel(); }}
      actions={<><Button variant="ghost" onClick={onCancel}>Cancel</Button><Button variant="brand" onClick={submit}>Download changelog.xml</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sd-space-3)' }}>
        <TextField label="Feed URL" mono inputMode="url" placeholder="https://docs.example.com/changelog.xml" value={url} onChange={(e) => setUrl(e.target.value)} error={tried && bad ? 'Enter an http or https URL.' : undefined} />
        <TextField label="Feed title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </form>
    </Dialog>
  );
}
