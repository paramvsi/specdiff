# @specdiff/ui

The React component library of the Specdiff design system: buttons, badges, tabs, dialogs, code panes, empty and error states, and the design tokens. The Specdiff app and the Viewer are built from it. Components use Radix primitives and Lucide icons, keep visible focus, and never show diff or severity by colour alone (`+ − ~ ↕`, `! ? + ¶`).

## Install

```sh
npm install @specdiff/ui react@19 react-dom@19
```

## Usage

Import the styles once (tokens, Geist fonts, base styles), then use the components:

```tsx
import '@specdiff/ui/styles.css';
import { Button, SeverityBadge, Tabs } from '@specdiff/ui';

export function Example() {
  return (
    <>
      <SeverityBadge severity="breaking" />
      <Button variant="brand">Copy changelog</Button>
    </>
  );
}
```

Light and dark follow `data-theme="light" | "dark"` on an ancestor. Colours, spacing and type come from `--sd-*` CSS variables.

## Exports

| Path | |
|---|---|
| `@specdiff/ui` | The components below |
| `@specdiff/ui/styles.css` | Fonts, tokens and base styles. Import once |
| `@specdiff/ui/tokens.css` | Only the `--sd-*` variables |
| `@specdiff/ui/tokens.json` | The same tokens as JSON |

Components, by group:

- **Actions and controls:** `Button` (`brand`, `secondary`, `ghost`, `inverse`, `danger`), `SegmentedControl`, `Tabs`, `Switch`, `Checkbox`, `RadioCardGroup`, `Select`, `TextField`, `PassphraseField` (+ `passphraseStrength`), `DecisionButtons`
- **Badges and chips:** `SeverityBadge`, `MethodChip`, `FileChip`, `ModeBadge`, `ViewerBadge`, `BetaLabel`, `MaskedText`, `Kbd`, `DiffMarker`, `SdkCallChip`, `VisuallyHidden`
- **Data:** `Card`, `StatCard`, `SuggestedVersionCard`, `TreeItem`, `ReviewProgress`, `ProgressBar`, `Skeleton`
- **Diff:** `CodeLine`, `CodePane`
- **Overlays:** `Dialog`, `DialogClose`, `Drawer`, `Menu`, `Tooltip`, `Toast`, `Toaster`, `useToast`, `CommandMenu`, `CommandPalette`
- **Shell and layout:** `Logo`, `LogoMark`, `TopBar`, `ThreePane`
- **States:** `EmptyState`, `IdenticalState`, `ParseErrorState`, `TooLargeState`, `EmptyHistoryState`, `LoadingState`, `DropZone`
- **Other:** `PortalContainerProvider` (where overlays portal to), `SEVERITY_LABEL`, `SEVERITY_SYMBOL`, `icons` (the Lucide icons used)

## Licence

MIT. Geist and Geist Mono are under the SIL Open Font License.
