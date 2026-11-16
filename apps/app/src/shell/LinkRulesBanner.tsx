// M-14: a share link's rules apply to that comparison only. This says so, and offers to go back to
// mine or to keep theirs.
import { Button, useToast } from '@specdiff/ui';
import * as icons from 'lucide-react';
import { useApp } from '../state/store';
import css from './LinkRulesBanner.module.css';

export function LinkRulesBanner() {
  const { savedConfig, screen, restoreMyConfig, keepLinkConfig, compare } = useApp();
  const { toast } = useToast();
  if (!savedConfig || screen !== 'result') return null;
  return (
    <div role="status" className={css.banner}>
      <icons.Share2 size={15} aria-hidden="true" />
      <span className={css.text}>Using the sender's rules</span>
      <span className={css.actions}>
        <Button variant="ghost" onClick={() => { restoreMyConfig(); void compare(); }}>Use my rules</Button>
        <Button variant="secondary" onClick={() => { keepLinkConfig(); toast({ title: 'Saved as your rules', tone: 'success' }); }}>Save theirs as mine</Button>
      </span>
    </div>
  );
}
