export type Severity = 'breaking' | 'possibly' | 'safe' | 'docs';

export const SEVERITY_SYMBOL: Record<Severity, string> = {
  breaking: '!',
  possibly: '?',
  safe: '+',
  docs: '¶',
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  breaking: 'Breaking',
  possibly: 'Possibly breaking',
  safe: 'Safe',
  docs: 'Docs only',
};
