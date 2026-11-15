import { useState } from 'react';
import tokens from '@specdiff/ui/tokens.json';
import css from './DesignSystem.module.css';
import { Components } from './Components';

type Theme = 'light' | 'dark';
const colorNames = Object.keys(tokens.color.light);

function Swatches({ theme }: { theme: Theme }) {
  return (
    <div data-theme={theme} className={css.swatches}>
      <h3 className={css.h3}>{theme === 'light' ? 'Light' : 'Dark'}</h3>
      <ul className={css.grid}>
        {colorNames.map((n) => (
          <li key={n} className={css.swatch}>
            <span
              className={css.chip}
              style={{ background: `var(--sd-${n})` }}
              aria-hidden="true"
            />
            <code>--sd-{n}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function DesignSystem() {
  const [theme, setTheme] = useState<Theme>('light');
  return (
    <div data-theme={theme} className={css.page}>
      <header className={css.header}>
        <h1 className={css.h1}>Design system</h1>
        <button
          type="button"
          className={css.toggle}
          aria-pressed={theme === 'dark'}
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        >
          Theme: {theme}
        </button>
      </header>
      <main>
        <section aria-labelledby="ds-colour">
          <h2 id="ds-colour" className={css.h2}>
            Colour
          </h2>
          <div className={css.two}>
            <Swatches theme="light" />
            <Swatches theme="dark" />
          </div>
        </section>
        <section aria-labelledby="ds-type">
          <h2 id="ds-type" className={css.h2}>
            Type scale
          </h2>
          <ul className={css.list}>
            {Object.entries(tokens.type).map(([name, t]) => (
              <li key={name} className={css.typeRow}>
                <code className={css.meta}>
                  {name} · {t.size} / {t.line} / {t.weight}
                </code>
                <span
                  style={{
                    fontFamily: `var(--sd-font-${t.family})`,
                    fontSize: t.size,
                    lineHeight: t.line,
                    fontWeight: t.weight,
                    letterSpacing: 'tracking' in t ? t.tracking : undefined,
                  }}
                >
                  Request field is now required
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="ds-space">
          <h2 id="ds-space" className={css.h2}>
            Spacing
          </h2>
          <ul className={css.list}>
            {Object.keys(tokens.space).map((k) => (
              <li key={k} className={css.typeRow}>
                <code className={css.meta}>--sd-space-{k}</code>
                <span
                  className={css.bar}
                  style={{ width: `var(--sd-space-${k})` }}
                  aria-hidden="true"
                />
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="ds-radius">
          <h2 id="ds-radius" className={css.h2}>
            Radius and shadow
          </h2>
          <ul className={css.grid}>
            {Object.keys(tokens.radius).map((k) => (
              <li key={k} className={css.swatch}>
                <span
                  className={css.box}
                  style={{ borderRadius: `var(--sd-radius-${k})` }}
                  aria-hidden="true"
                />
                <code>--sd-radius-{k}</code>
              </li>
            ))}
            {Object.keys(tokens.shadow).map((k) => (
              <li key={k} className={css.swatch}>
                <span
                  className={css.box}
                  style={{ boxShadow: `var(--sd-shadow-${k})` }}
                  aria-hidden="true"
                />
                <code>--sd-shadow-{k}</code>
              </li>
            ))}
          </ul>
        </section>
        <Components />
      </main>
    </div>
  );
}
