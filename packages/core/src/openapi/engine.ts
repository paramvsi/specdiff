// Shared state for one OpenAPI comparison: the two loaded specs, options, the findings sink,
// and the memo/cycle tracking for `$ref`s (OA-02: compared by reference identity, reported once
// per entry into a cycle). Rules in ../rules emit findings through `emit`.
import type { Config, Kind, Severity } from '../schemas';
import { getRule } from '../rules/catalogue';
import { type Chain, type LoadedSpec, type Loc, type Resolved, chainToArray } from './load';

export interface OperationRef {
  method: string;
  path: string;
  operationId?: string;
  /** The operation's OpenAPI `tags` (OA-09). */
  tags?: string[];
}

export interface Ctx {
  op: OperationRef | undefined;
  /** Where this comparison was reached from: an operation key such as "GET /v1/payments". */
  usage: string;
  /** The component or operation being compared (OA-15 source block). */
  block: string;
  /** The {op} placeholder: operation key or component name. */
  label: string;
  /** True inside a `$ref` target (a component): findings there are shared by every usage (OA-14). */
  component: boolean;
  /** Human path segments. */
  hp: Chain | undefined;
  /** Property path inside the current block, for the {target} placeholder. */
  field: Chain | undefined;
  /** Fallback {target} when no property is involved ("request body", "limit"…). */
  what: string;
  dir: 'request' | 'response';
  /** Rule 5 of the severity law: readOnly in requests, writeOnly in responses. */
  docsOnly: boolean;
  /** Inside one branch of an un-flattened allOf: breaking is capped at possibly. */
  inAllOf: boolean;
  /** Inside a webhook payload. */
  webhook: boolean;
  /** Top-level schema of a parameter: request-param-* rules apply. */
  param: boolean;
  /** Schema of a response header: only type changes are judged. */
  header: boolean;
}

export interface Finding {
  ruleId: string;
  kind: Kind;
  hp: string[];
  bLoc: Loc;
  aLoc: Loc;
  before?: unknown;
  after?: unknown;
  target: string;
  label: string;
  /** `undefined`: the rule's default. */
  severity: Severity | undefined;
  note?: string;
  block: string;
  isComponent: boolean;
  op: OperationRef | undefined;
  usage: string;
}

export interface EmitArgs {
  bLoc: Loc;
  aLoc: Loc;
  before?: unknown;
  after?: unknown;
  target?: string;
  /** Extra human-path segments after the context's. */
  hp?: string[];
  /** Dynamic severity; `null` drops the finding (e.g. removed after its sunset date). */
  severity?: Severity | null;
  kind?: Kind;
  note?: string;
}

export interface EngineOptions {
  openapi: Config['openapi'];
  ignoreExtensions: boolean;
  today: Date;
}

export const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
export const asObj = (v: unknown): Record<string, unknown> => (isObj(v) ? v : {});
export const has = (o: Record<string, unknown>, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

export function joinField(c: Chain | undefined): string {
  let s = '';
  for (const seg of chainToArray(c)) s = seg === '[]' ? `${s}[]` : s ? `${s}.${seg}` : seg;
  return s;
}

export const push = (c: Chain | undefined, key: string): Chain => ({ up: c, key });

const locKey = (l: Loc) => `${l.file}#${chainToArray(l.ptr).join('/')}`;

export class Engine {
  sink: Finding[] = [];
  private readonly memo = new Map<string, Finding[]>();
  private readonly active = new Set<string>();
  private readonly schemes = new Map<string, Set<string>>();

  /** Record that an operation uses a security scheme, so scheme changes list their usages. */
  useScheme(name: string, usage: string): void {
    let s = this.schemes.get(name);
    if (!s) this.schemes.set(name, (s = new Set()));
    s.add(usage);
  }
  schemeUsages(name: string): string[] {
    return [...(this.schemes.get(name) ?? [])].sort();
  }

  constructor(
    readonly b: LoadedSpec,
    readonly a: LoadedSpec,
    readonly opts: EngineOptions,
  ) {}

  emit(ctx: Ctx, ruleId: string, args: EmitArgs): void {
    const rule = getRule(ruleId);
    if (args.severity === null) return;
    let severity: Severity | undefined = args.severity;
    let note = args.note;
    const base = severity ?? rule.severity ?? 'docs';
    if (ctx.docsOnly && base !== 'docs') {
      severity = 'docs';
      note = ctx.dir === 'request' ? 'The property is readOnly, so clients never send it.' : 'The property is writeOnly, so it never appears in responses.';
    } else if (ctx.inAllOf && base === 'breaking') {
      severity = 'possibly';
      note = 'This is inside one allOf branch; another branch may still guarantee it.';
    }
    const hp = chainToArray(ctx.hp);
    if (args.hp) hp.push(...args.hp);
    const f: Finding = {
      ruleId,
      kind: args.kind ?? rule.kind,
      hp,
      bLoc: args.bLoc,
      aLoc: args.aLoc,
      target: args.target ?? (joinField(ctx.field) || ctx.what),
      label: ctx.label,
      severity,
      block: ctx.block,
      isComponent: ctx.component,
      op: ctx.op,
      usage: ctx.usage,
    };
    if (args.before !== undefined) f.before = args.before;
    if (args.after !== undefined) f.after = args.after;
    if (note !== undefined) f.note = note;
    this.sink.push(f);
  }

  /**
   * Compare two resolved nodes where at least one was a `$ref`. The pair is compared once per
   * context; later uses replay the findings with the new usage, and re-entering a pair that is
   * still being compared (a cycle) stops there.
   */
  viaRef(ctx: Ctx, b: Resolved, a: Resolved, run: (ctx: Ctx) => void): void {
    const flags = `${ctx.dir}|${+ctx.docsOnly}|${+ctx.inAllOf}|${+ctx.webhook}|${+ctx.param}|${+ctx.header}`;
    const key = `${locKey(b.loc)}|${locKey(a.loc)}|${flags}`;
    if (this.active.has(key)) return;
    const cached = this.memo.get(key);
    if (cached) {
      for (const f of cached) this.sink.push({ ...f, usage: ctx.usage, op: ctx.op });
      return;
    }
    const target = a.refId !== undefined ? a : undefined;
    const inner: Ctx = target
      ? { ...ctx, component: true, block: target.refId ?? ctx.block, label: target.refName ?? ctx.label, hp: { up: undefined, key: target.refId ?? '' }, field: undefined, what: target.refName ?? ctx.what }
      : ctx;
    const saved = this.sink;
    this.sink = [];
    this.active.add(key);
    try {
      run(inner);
    } finally {
      this.active.delete(key);
      const found = this.sink;
      this.sink = saved;
      this.memo.set(key, found);
      for (const f of found) saved.push(f);
    }
  }
}
