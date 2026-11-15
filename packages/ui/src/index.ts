// @specdiff/ui — React components for Specdiff. Styles: import '@specdiff/ui/styles.css' once.

export { PortalContainerProvider } from './internal/portal';
export { SEVERITY_LABEL, SEVERITY_SYMBOL, type Severity } from './internal/severity';

// Actions and controls
export { Button, type ButtonProps, type ButtonVariant } from './components/Button/Button';
export {
  SegmentedControl,
  type SegmentedControlProps,
  type SegmentedOption,
} from './components/SegmentedControl/SegmentedControl';
export { Tabs, type TabsProps, type TabItem } from './components/Tabs/Tabs';
export { Switch, type SwitchProps } from './components/Switch/Switch';
export { Checkbox, type CheckboxProps } from './components/Checkbox/Checkbox';
export {
  RadioCardGroup,
  type RadioCardGroupProps,
  type RadioCardOption,
} from './components/RadioCard/RadioCard';
export { Select, type SelectProps, type SelectOption } from './components/Select/Select';
export { TextField, type TextFieldProps } from './components/TextField/TextField';
export {
  PassphraseField,
  type PassphraseFieldProps,
} from './components/PassphraseField/PassphraseField';
export {
  passphraseStrength,
  type Strength,
  type StrengthLabel,
} from './components/PassphraseField/strength';
export {
  DecisionButtons,
  type Decision,
  type DecisionButtonsProps,
} from './components/DecisionButtons/DecisionButtons';

// Badges and chips
export { SeverityBadge, type SeverityBadgeProps } from './components/SeverityBadge/SeverityBadge';
export { MethodChip, type HttpMethod } from './components/MethodChip/MethodChip';
export { FileChip } from './components/FileChip/FileChip';
export { ModeBadge, type ModeBadgeProps } from './components/ModeBadge/ModeBadge';
export { ViewerBadge, type ViewerBadgeKind } from './components/ViewerBadge/ViewerBadge';
export { BetaLabel } from './components/BetaLabel/BetaLabel';
export { MaskedText } from './components/MaskedText/MaskedText';
export { Kbd } from './components/Kbd/Kbd';
export { DiffMarker, type DiffKind } from './components/DiffMarker/DiffMarker';
export { SdkCallChip } from './components/SdkCallChip/SdkCallChip';
export { VisuallyHidden } from './components/VisuallyHidden/VisuallyHidden';

// Data
export { Card, type CardProps } from './components/Card/Card';
export {
  StatCard,
  SuggestedVersionCard,
  type StatCardProps,
  type SuggestedVersionCardProps,
} from './components/StatCard/StatCard';
export { TreeItem, type TreeItemProps } from './components/TreeItem/TreeItem';
export { ReviewProgress, type ReviewProgressProps } from './components/ReviewProgress/ReviewProgress';
export { ProgressBar, type ProgressBarProps } from './components/ProgressBar/ProgressBar';
export { Skeleton, type SkeletonProps } from './components/Skeleton/Skeleton';

// Diff
export {
  CodeLine,
  type CodeLineData,
  type CodeLineKind,
  type CodeLineProps,
  type CodeSegment,
} from './components/CodeLine/CodeLine';
export {
  CodePane,
  type CodePaneProps,
  type CodePaneRow,
  type CollapsedRows,
} from './components/CodePane/CodePane';

// Overlays
export { Dialog, DialogClose, type DialogProps } from './components/Dialog/Dialog';
export { Drawer, type DrawerProps } from './components/Drawer/Drawer';
export { Menu, type MenuItem, type MenuProps } from './components/Menu/Menu';
export { Tooltip, type TooltipProps } from './components/Tooltip/Tooltip';
export {
  Toast,
  type ToastAction,
  type ToastProps,
  type ToastTone,
} from './components/Toast/Toast';
export {
  Toaster,
  useToast,
  TOAST_DURATION_MS,
  type ToastOptions,
} from './components/Toast/Toaster';
export {
  CommandMenu,
  CommandPalette,
  type CommandGroup,
  type CommandItem,
  type CommandMenuProps,
  type CommandPaletteProps,
} from './components/CommandPalette/CommandPalette';

// Shell and layout
export { Logo, LogoMark, type LogoProps } from './components/Logo/Logo';
export { TopBar, type TopBarProps } from './components/TopBar/TopBar';
export { ThreePane, type ThreePaneProps } from './components/ThreePane/ThreePane';

// States
export { EmptyState, type EmptyStateProps } from './components/EmptyState/EmptyState';
export {
  IdenticalState,
  type IdenticalStateProps,
} from './components/IdenticalState/IdenticalState';
export {
  ParseErrorState,
  type ParseErrorStateProps,
  type SourceLine,
} from './components/ParseErrorState/ParseErrorState';
export { TooLargeState, type TooLargeStateProps } from './components/TooLargeState/TooLargeState';
export {
  EmptyHistoryState,
  type EmptyHistoryStateProps,
} from './components/EmptyHistoryState/EmptyHistoryState';
export {
  LoadingState,
  type LoadingSide,
  type LoadingStateProps,
} from './components/LoadingState/LoadingState';
export { DropZone, type DropZoneProps } from './components/DropZone/DropZone';

// Icons (Lucide)
export * as icons from './icons';
