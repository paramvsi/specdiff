# 09 · Design and motion

## Sources of truth, in order

1. `design/Specdiff-Design-System.pdf` — principles, logo, colour (light, dark, diff and severity, accessibility), type, scale, spacing, radius, elevation, layout, icons, motion, components, writing.
2. `design/tokens.css` and `design/tokens.json` — the values. Components use `var(--sd-*)` only.
3. `design/prototypes/**.dc.html` — approved screens (layout, spacing, copy, states).
4. `design/screens/**.jpg` — rendered images of the prototypes, for visual comparison.

When the PDF and a prototype disagree, the PDF wins. Report the difference.

## Porting a prototype to React

The `.dc.html` files come from a design canvas. Read them as HTML with inline styles:

- **Ignore:** `<x-dc>`, `<helmet>`, `support.js`, the `<script type="text/x-dc">` block, `data-props`, `{{holes}}`, `<sc-if>`, `<sc-for>`. In the website v2 prototype these drive the demo tabs, the slider and the package tabs: rebuild that behaviour with React state.
- **Translate** every inline hex to its token (`#ECEEE9` → `--sd-ground`, `#FFFFFF` → `--sd-surface`, `#F6F7F3` → `--sd-raised`, `#DADDD5` → `--sd-line`, `#15171A` → `--sd-ink`, `#565C63` → `--sd-muted`, `#C8F24A` → `--sd-brand`, `#4A6200` → `--sd-brand-ink`, `#EEF9CF` → `--sd-brand-tint`; diff and severity colours map to `--sd-added*`, `--sd-removed*`, `--sd-changed*`, `--sd-breaking*`, `--sd-possibly*`, `--sd-safe*`, `--sd-docs*`, and methods to `--sd-method-*`). `#141619` / `#15171C` / `#FFFFFE` are the inverse surface and on-brand ink: use `--sd-inverse`, `--sd-on-brand`, `--sd-on-inverse`.
- **Extract components** first (buttons, segmented control, severity badge, method chip, file chip, code line, card, dialog, drawer, toast, decision buttons, review progress, passphrase field, Viewer badges, masked text, Beta label) into `@specdiff/ui`, then build screens from them.
- **Keep the copy** exactly, including button labels and error messages. Placeholders such as `[date]` and `[Launch date]` stay until the owner fills them.
- **Dark mode** is the same markup with `[data-theme="dark"]` tokens. The dark images show the expected result.
- **Phone** (390 px) frames are read-only layouts; reuse the desktop components with single-column layout and 44 px targets.

## Severity, diff and accessibility conventions

- Severity badge = coloured pill + symbol: Breaking `!`, Possibly breaking `?`, Safe `+`, Docs only `¶`. In tight lists use the compact chip (11 px, 13 px symbol) from the What-changed list (V-04).
- Diff lines: added blue with `+`, removed orange with `−`, changed purple `~`, moved purple `↕`, type changed in breaking colour with the text "type changed".
- Masked text (TX-08) renders as `‹name›` in a muted pill.
- Viewer badges: New (safe colours), Changed (changed colours), Breaking (breaking colours), Deprecated (possibly colours).
- Focus ring: `--sd-shadow-focus`. Every icon-only button has `aria-label`.

## Motion

**The app stays still.** Only transitions that answer a user action (open, expand, confirm), 120–250 ms with `--sd-ease`.

**The website moves**, all in `design/motion.css` (CSS only, no animation library):

| Element | Keyframes | Duration and timing |
|---|---|---|
| Hero headline words rise in, once | `sdUp` | 0.8 s each, staggered 45 ms, starting at 50 ms |
| Hero side copy, demo panel | `sdUp` | delays 0.45 s and 0.55 s |
| Demo: scan line sweeps the spec | `sdScan` | 9 s loop |
| Demo: removed line tints orange; added line slides in | `sdRem`, `sdAdd` | 9 s loop, at ~15% and ~20% |
| Demo: change card rises; Breaking counter 0→3; Safe 13→14 | `sdCard`, `sdOdo`, `sdOdo14` | 9 s loop |
| Demo: version flips 1.6.0 → 2.0.0 major; progress bar | `sdVerOld`, `sdVerNew`, `sdProg` | 9 s loop |
| Formats strip | `sdMarquee` | 40 s linear, content duplicated once |
| Feature tiles | `sdFade` (3 slides, 3 s apart), `sdDash`, `sdPing`, `sdOut` + `sdPop`, `sdFill`, `sdKey` | 0.9–9 s loops |
| Viewer band: timeline marker travels; badges pop | `sdTravel`, `sdPop` | 7 s loop, badges staggered 0.3 s |
| Package terminal: command types, cursor blinks, output rises | `sdType` (steps = command length), `sdBlink`, `sdUp` | once, 2.2 s, then lines 0.25 s apart |
| CTA logo mark | `sdMarkL`, `sdMarkR` | 1.4 s alternate |

Rules:
- Under `prefers-reduced-motion: reduce`, all animation and transition is off (already in `motion.css`). The page must still read correctly with everything in its final state; make sure initial states are visible without animation.
- Pause looping animations when off-screen (IntersectionObserver toggling `animation-play-state`) to save battery.
- The demo must stay accessible: the live region is not announced on every loop; the tabs are real `role="tab"` buttons.
- Interactive pieces (demo tabs, before/after slider as a real `<input type="range">` with a visible handle, package tabs, FAQ `<details>`) are React islands in Astro.

## Website v2 structure (W-01)

Floating nav (compact on phones) · hero with "New" pill, headline, copy, two CTAs, `npx` command, live demo · formats strip · "31 hunks of YAML. Or 3 things that matter." slider · "Built for the review, not just the diff." feature grid (6 tiles) · Viewer band (inverse) · "Runs where you already work." package tabs · Questions (5) · chartreuse CTA · footer. Exact copy is in `design/prototypes/website/W01v2-Home.dc.html`.
