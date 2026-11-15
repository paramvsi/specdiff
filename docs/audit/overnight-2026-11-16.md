# Overnight audit and enhancement loop · 2026-11-16

Owner asleep. Claude runs self-paced loops: audit → fix → commit, then enhance, then web research for edge cases.

## Ground rules for the night
- No subagents. Local commits only, never push (the owner pushes with `!`).
- No full suite: only explicit test files for what changed, plus lint and typecheck. The pre-push hook runs `pnpm verify` when the owner pushes.
- Anything CLAUDE.md says needs asking (new dependency, layout or IA change, default severity change, publish, domain, Netlify, push) goes to **Morning decisions**, not into code.
- Anything a permission check blocks goes to **Morning decisions** with what was tried.
- Every fix: a failing check first where it is a bug, then the fix, then the passing check, logged below with the commit hash.

## Morning decisions
_(none yet)_

## Log
| # | Time | Area | Finding | Evidence | Fix / commit |
|---|------|------|---------|----------|--------------|
| 1 | 00:05 | core · json/parse (JS-04) | `<<` merge keys not applied in JSON/YAML mode (OpenAPI mode applies them); alias bomb threw `ReferenceError` instead of returning a parse error; multi-document YAML got a generic hint; duplicate dead `MISSING_CHAR` branch | probe + 3 new tests failing before, 19/19 after; worker + CLI caller tests green | `9eb0d57` |
| 2 | 00:12 | viewer · TryIt casing | Editor showed TS1149 (`./tryit` vs `TryIt.tsx`), which would break the Linux Netlify build | stale diagnostic: no `./tryit` import exists; `tsc --noEmit` shows 0 TS1149 | no change |
| 3 | 00:12 | core · json/parse | Integers beyond 2^53 lose precision (`12345678901234567890` → `…7000`), so two files differing only in a big ID show no change | probe output | **open**: needs a design choice (BigInt breaks stable/JSON output); queued for an enhancement pass |
| 4 | 00:35 | app · A12 Settings (UI, 1440/390 light/dark) | axe clean in all 5 sections × 2 themes × 2 widths. On a touch phone: section tabs 42 px, severity selects 36 px, TextField input 22 px inside a 44 px box (taps on the box's padding missed the input) | screenshots + new guard `e2e/touch-targets.spec.ts` failing before, passing after; visual baselines unchanged | `ae2d743` |
