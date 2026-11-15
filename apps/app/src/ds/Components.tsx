import { useState, type ReactNode } from 'react';
import {
  BetaLabel,
  Button,
  Card,
  Checkbox,
  CodeLine,
  CodePane,
  CommandMenu,
  CommandPalette,
  DecisionButtons,
  Dialog,
  DialogClose,
  DiffMarker,
  Drawer,
  DropZone,
  EmptyHistoryState,
  FileChip,
  IdenticalState,
  Kbd,
  LoadingState,
  Logo,
  MaskedText,
  Menu,
  MethodChip,
  ModeBadge,
  ParseErrorState,
  PassphraseField,
  PortalContainerProvider,
  ProgressBar,
  RadioCardGroup,
  ReviewProgress,
  SdkCallChip,
  SegmentedControl,
  Select,
  SeverityBadge,
  Skeleton,
  StatCard,
  SuggestedVersionCard,
  Switch,
  Tabs,
  TextField,
  ThreePane,
  Toast,
  Toaster,
  TooLargeState,
  Tooltip,
  TopBar,
  TreeItem,
  useToast,
  ViewerBadge,
  icons,
  type CodePaneRow,
  type CommandGroup,
  type Decision,
} from '@specdiff/ui';
import css from './Components.module.css';

const { ArrowRight, ChevronRight, Copy, Download, Lock, MoreHorizontal, Search, Share } = icons;

const SEVERITIES = ['breaking', 'possibly', 'safe', 'docs'] as const;

const sheetRows: CodePaneRow[] = [
  { kind: 'context', number: 3, content: '  requestBody:' },
  { kind: 'removed', number: 4, content: '    required: [amount]' },
  {
    kind: 'added',
    number: 4,
    content: [
      { text: '    required: [amount, ' },
      { text: 'currency', highlight: true },
      { text: ']' },
    ],
  },
  { kind: 'context', number: 5, content: '    properties:' },
  {
    kind: 'collapsed',
    lines: Array.from({ length: 24 }, (_, i) => ({
      kind: 'context' as const,
      number: 6 + i,
      content: i % 2 ? '        type: string' : `      field${i}:`,
    })),
  },
  { kind: 'context', number: 30, content: '      currency:' },
  { kind: 'added', number: 31, content: "        pattern: '^[A-Z]{3}$'" },
  { kind: 'changed', number: 32, content: '        maxLength: 3' },
  { kind: 'moved', number: 33, content: '        example: EUR' },
];

const beforeRows: CodePaneRow[] = [
  { kind: 'context', number: 1, content: 'post:' },
  { kind: 'context', number: 2, content: '  operationId: createPayment' },
  { kind: 'context', number: 3, content: '  requestBody:' },
  { kind: 'removed', number: 4, content: '    required: [amount]' },
  { kind: 'context', number: 5, content: '    properties:' },
];
const afterRows: CodePaneRow[] = [
  { kind: 'context', number: 1, content: 'post:' },
  { kind: 'context', number: 2, content: '  operationId: createPayment' },
  { kind: 'context', number: 3, content: '  requestBody:' },
  {
    kind: 'added',
    number: 4,
    content: [
      { text: '    required: [amount, ' },
      { text: 'currency', highlight: true },
      { text: ']' },
    ],
  },
  { kind: 'context', number: 5, content: '    properties:' },
];

const paletteGroups: CommandGroup[] = [
  {
    heading: 'Changes',
    items: [{ label: 'currency now required', kind: 'change', severity: 'breaking' }],
  },
  { heading: 'Paths', items: [{ label: '$.components.schemas.Currency', kind: 'path' }] },
  { heading: 'Actions', items: [{ label: 'Toggle ignore whitespace', kind: 'action' }] },
  { heading: 'Settings', items: [{ label: 'Diff colour theme', kind: 'setting' }] },
];

function Block({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  return (
    <section className={wide ? `${css.block} ${css.wide}` : css.block}>
      <h3 className={css.h3}>{title}</h3>
      {children}
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className={css.row}>{children}</div>;
}

function ToastDemo() {
  const { toast } = useToast();
  return (
    <Row>
      <Button
        onClick={() =>
          toast({ title: 'Link copied', description: 'Both files are in the link. 6.4 KB.' })
        }
      >
        Show toast
      </Button>
      <Button
        onClick={() =>
          toast({
            tone: 'error',
            title: "Couldn't parse After: line 12, unexpected indent",
          })
        }
      >
        Show error toast
      </Button>
    </Row>
  );
}

function Showcase() {
  const [layout, setLayout] = useState<'split' | 'unified' | 'schema'>('split');
  const [preset, setPreset] = useState<'wire' | 'sdk'>('wire');
  const [whitespace, setWhitespace] = useState(true);
  const [docsOnly, setDocsOnly] = useState(false);
  const [decision, setDecision] = useState<Decision>(null);
  const [passphrase, setPassphrase] = useState('lantern-orbit');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [selected, setSelected] = useState(2);

  const tree = (
    <Card tone="panel" className={css.tree}>
      <p className={css.group}>/v1/payments</p>
      {(
        [
          ['breaking', 'POST', 'currency now required', 'default'],
          ['possibly', 'GET', 'limit max 100 → 50', 'hover'],
          ['breaking', 'DELETE', 'endpoint removed', 'selected'],
        ] as const
      ).map(([sev, method, title, meta], i) => (
        <TreeItem
          key={title}
          severity={sev}
          method={method}
          meta={meta}
          selected={selected === i}
          onClick={() => setSelected(i)}
        >
          {title}
        </TreeItem>
      ))}
    </Card>
  );

  return (
    <>
      <Block title="Logo" wide>
        <Row>
          {[64, 40, 26, 20, 16].map((s) => (
            <Logo key={s} size={s} wordmark={s >= 26} />
          ))}
          <span className={css.onBrand}>
            <Logo onBrand />
          </span>
        </Row>
      </Block>

      <Block title="Top bar" wide>
        <TopBar
          className={css.topbar}
          start={
            <>
              <span className={css.files}>
                <FileChip name="payments-v1.yaml" />
                <ArrowRight className={css.arrow} aria-label="to" />
                <FileChip name="payments-v2.yaml" />
              </span>
              <ModeBadge mode="OpenAPI 3.1" />
            </>
          }
          end={
            <>
              <Button variant="secondary" icon={<Search />} onClick={() => setPaletteOpen(true)}>
                Search changes <Kbd>⌘K</Kbd>
              </Button>
              <Button variant="secondary" icon={<Share />}>
                Share
              </Button>
              <Button variant="brand" icon={<Download />}>
                Export
              </Button>
            </>
          }
        />
      </Block>

      <Block title="Buttons">
        <Row>
          <Button variant="brand" icon={<Download />}>
            Export
          </Button>
          <Button variant="inverse">Compare</Button>
          <Button variant="secondary" icon={<Share />}>
            Share
          </Button>
          <Button variant="secondary" iconOnly icon={<ChevronRight />} aria-label="Next change" />
          <Button variant="ghost">Cancel</Button>
          <Button variant="danger">Clear history</Button>
          <Button variant="secondary" disabled>
            Disabled
          </Button>
        </Row>
      </Block>

      <Block title="Severity">
        <Row>
          {SEVERITIES.map((s) => (
            <SeverityBadge key={s} severity={s} />
          ))}
        </Row>
        <Row>
          {SEVERITIES.map((s) => (
            <span key={s} className={css.inline}>
              <SeverityBadge severity={s} compact />
              <span className={css.meta}>compact</span>
            </span>
          ))}
        </Row>
      </Block>

      <Block title="Methods and modes">
        <Row>
          {(['GET', 'POST', 'DELETE', 'PUT', 'PATCH', 'ALL'] as const).map((m) => (
            <MethodChip key={m} method={m} />
          ))}
        </Row>
        <Row>
          <ModeBadge mode="OpenAPI 3.1" />
          <ModeBadge mode="JSON" />
          <ModeBadge mode="Markdown" />
          <ModeBadge mode="Code" beta />
          <FileChip name="payments-v2.yaml" />
        </Row>
      </Block>

      <Block title="Segmented control and switches">
        <Row>
          <SegmentedControl
            label="Layout"
            value={layout}
            onValueChange={setLayout}
            options={[
              { value: 'split', label: 'Split' },
              { value: 'unified', label: 'Unified' },
              { value: 'schema', label: 'Schema' },
            ]}
          />
          <Switch label="Ignore whitespace" checked={whitespace} onCheckedChange={setWhitespace} />
          <Switch label="Hide docs-only" checked={docsOnly} onCheckedChange={setDocsOnly} />
          <Checkbox label="Save new comparisons to history" defaultChecked />
        </Row>
      </Block>

      <Block title="Strictness preset">
        <SegmentedControl
          label="Strictness"
          size="sm"
          value={preset}
          onValueChange={setPreset}
          options={[
            { value: 'wire', label: 'Wire' },
            { value: 'sdk', label: 'SDK' },
          ]}
        />
        <RadioCardGroup
          legend="Strictness"
          value={preset}
          onValueChange={setPreset}
          options={[
            {
              value: 'wire',
              title: 'Wire',
              description:
                'Flags what breaks HTTP requests and responses. Right for most public APIs.',
            },
            {
              value: 'sdk',
              title: 'SDK',
              description:
                'Also flags changes that break generated clients: renamed operationIds, schemas and enum names.',
            },
          ]}
        />
      </Block>

      <Block title="Tabs">
        <Tabs
          label="Template"
          items={[
            {
              value: 'release',
              label: 'Release notes',
              content: <p className={css.p}>Release notes for 2.0.0.</p>,
            },
            {
              value: 'kac',
              label: 'Keep a Changelog',
              content: <p className={css.p}>## [2.0.0] · Changed</p>,
            },
            {
              value: 'slack',
              label: 'Slack message',
              content: <p className={css.p}>Payments API 2.0.0 is out.</p>,
            },
            {
              value: 'pr',
              label: 'PR comment',
              content: <p className={css.p}>3 breaking changes.</p>,
            },
          ]}
        />
      </Block>

      <Block title="Diff lines, word highlight, collapsed context">
        <CodePane fileName="payments-v2.yaml" rows={sheetRows} />
      </Block>

      <Block title="Split view">
        <div className={css.split}>
          <CodePane fileName="payments-v1.yaml" rows={beforeRows} />
          <CodePane fileName="payments-v2.yaml" rows={afterRows} />
        </div>
      </Block>

      <Block title="Diff colour themes">
        <div className={css.split}>
          <Card flush>
            <p className={css.paneTitle}>Default (cobalt / ember)</p>
            <CodeLine kind="removed" content="required: [amount]" />
            <CodeLine kind="added" content="required: [amount, currency]" />
          </Card>
          <Card flush data-diff-theme="high-contrast">
            <p className={css.paneTitle}>High contrast</p>
            <CodeLine kind="removed" content="required: [amount]" />
            <CodeLine kind="added" content="required: [amount, currency]" />
          </Card>
        </div>
      </Block>

      <Block title="Diff markers">
        <Row>
          <DiffMarker kind="added" />
          <DiffMarker kind="removed" />
          <DiffMarker kind="changed" />
          <DiffMarker kind="moved" />
          <DiffMarker kind="type-changed" />
        </Row>
      </Block>

      <Block title="Change tree items">{tree}</Block>

      <Block title="Stat cards">
        <div className={css.stats}>
          <StatCard severity="breaking" count={3} />
          <SuggestedVersionCard version="2.0.0" bump="major" />
        </div>
      </Block>

      <Block title="Command palette">
        <CommandMenu groups={paletteGroups} label="Search changes (preview)" />
        <Row>
          <Button variant="secondary" icon={<Search />} onClick={() => setPaletteOpen(true)}>
            Open command palette
          </Button>
        </Row>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} groups={paletteGroups} />
      </Block>

      <Block title="Drop zone (dragging)">
        <DropZone dragging detail="payments-v2.yaml · 48 KB" />
      </Block>

      <Block title="Toasts">
        <div className={css.stack}>
          <Toast title="Changelog copied" />
          <Toast
            title="Change accepted"
            description="Saved to .specdiff/decisions.json."
            action={{ label: 'Undo', onClick: () => {} }}
          />
          <Toast tone="warning" title="Link is long" description="Some apps cut links over 8 KB." />
          <Toast tone="error" title="Couldn't parse After: line 12, unexpected indent" />
        </div>
        <ToastDemo />
      </Block>

      <Block title="Dialog, drawer, menu, tooltip">
        <Row>
          <Dialog
            title="Share comparison"
            description="Both files are packed into the link. Nothing is uploaded."
            trigger={
              <Button variant="secondary" icon={<Lock />}>
                Open dialog
              </Button>
            }
            actions={
              <>
                <DialogClose asChild>
                  <Button variant="ghost">Cancel</Button>
                </DialogClose>
                <Button variant="brand" icon={<Copy />}>
                  Copy link
                </Button>
              </>
            }
          />
          <Drawer title="Changes" trigger={<Button variant="secondary">Open drawer</Button>}>
            {tree}
          </Drawer>
          <Menu
            trigger={
              <Button
                variant="secondary"
                iconOnly
                icon={<MoreHorizontal />}
                aria-label="More actions"
              />
            }
            items={[
              { label: 'Copy link', icon: <Copy />, hint: '⌘L' },
              { label: 'Download report', icon: <Download /> },
              'separator',
              { label: 'Clear history', disabled: true },
            ]}
          />
          <Tooltip content="Next change (j)">
            <Button variant="secondary" iconOnly icon={<ChevronRight />} aria-label="Next change" />
          </Tooltip>
        </Row>
      </Block>

      <Block title="Fields">
        <TextField label="Search rules" icon={<Search />} placeholder="Search 58 rules" />
        <TextField
          label="Spec URL"
          defaultValue="ftp://example"
          error="Use an https:// link."
          mono
        />
        <Select
          label="Diff colour theme"
          defaultValue="default"
          options={[
            { value: 'default', label: 'Default (cobalt / ember)' },
            { value: 'high-contrast', label: 'High contrast' },
          ]}
        />
      </Block>

      <Block title="Passphrase field">
        <PassphraseField value={passphrase} onValueChange={setPassphrase} />
      </Block>

      <Block title="Decision buttons">
        <DecisionButtons value={decision} onChange={setDecision} />
        <DecisionButtons value="accepted" onChange={() => {}} />
        <DecisionButtons value="rejected" onChange={() => {}} />
      </Block>

      <Block title="Review progress">
        <ReviewProgress accepted={1} rejected={1} total={5} />
      </Block>

      <Block title="Progress and skeleton">
        <ProgressBar label="payments-v2.yaml" value={62} valueText="Resolving references…" />
        <Skeleton height={14} width="70%" />
        <Skeleton height={14} width="45%" />
      </Block>

      <Block title="SDK call chip">
        <Row>
          <SdkCallChip call="payments.create()" />
          <SdkCallChip call="refunds.cancel()" removed />
        </Row>
      </Block>

      <Block title="Viewer badges">
        <Row>
          <ViewerBadge kind="new" />
          <ViewerBadge kind="changed" />
          <ViewerBadge kind="breaking" />
          <ViewerBadge kind="deprecated" />
        </Row>
      </Block>

      <Block title="Masked text, Beta label, keys">
        <span className={css.mono}>
          2026-11-14T09:12:44Z → <MaskedText name="time" />
        </span>
        <Row>
          <BetaLabel />
          <Kbd>⌘K</Kbd>
          <Kbd>Esc</Kbd>
        </Row>
      </Block>

      <Block title="Identical files">
        <IdenticalState ignoredLines={6} />
      </Block>

      <Block title="Parse error, pinned to the line">
        <ParseErrorState
          title="After isn't valid YAML"
          errorLine={12}
          column={6}
          lines={[
            { number: 11, text: '      requestBody:' },
            { number: 12, text: '     required: [amount]' },
            { number: 13, text: '        properties:' },
          ]}
          hint="Line 12 is indented by 5 spaces; YAML expects 6 or 8 here."
        />
      </Block>

      <Block title="Too large">
        <TooLargeState fileName="orders-export.json" size="31.4 MB" limit="25 MB" />
      </Block>

      <Block title="Empty history">
        <EmptyHistoryState />
      </Block>

      <Block title="Loading" wide>
        <LoadingState
          before={{ name: 'payments-v1.yaml', progress: 100, status: 'Parsed' }}
          after={{ name: 'payments-v2.yaml', progress: 62, status: 'Resolving references…' }}
        />
      </Block>

      <Block title="Three-pane layout" wide>
        <ThreePane
          tree={tree}
          content={
            <Card tone="panel">
              <Row>
                <MethodChip method="POST" />
                <code className={css.mono}>/v1/payments</code>
                <SeverityBadge severity="breaking" />
              </Row>
              <div className={css.split}>
                <CodePane fileName="payments-v1.yaml" rows={beforeRows} hideCounts />
                <CodePane fileName="payments-v2.yaml" rows={afterRows} hideCounts />
              </div>
            </Card>
          }
          inspector={
            <Card tone="panel" title="Why it breaks">
              <p className={css.p}>
                Any client that creates a payment without currency will now get a 400 Bad Request.
              </p>
              <DecisionButtons value={decision} onChange={setDecision} />
            </Card>
          }
        />
      </Block>
    </>
  );
}

export function Components() {
  const [portal, setPortal] = useState<HTMLDivElement | null>(null);
  return (
    <section aria-labelledby="ds-components">
      <h2 id="ds-components" className={css.h2}>
        Components
      </h2>
      {/* Overlays portal into this element so they inherit the page's data-theme. */}
      <PortalContainerProvider container={portal}>
        <Toaster>
          <div className={css.grid}>
            <Showcase />
          </div>
        </Toaster>
      </PortalContainerProvider>
      <div ref={setPortal} className={css.portal} />
    </section>
  );
}
