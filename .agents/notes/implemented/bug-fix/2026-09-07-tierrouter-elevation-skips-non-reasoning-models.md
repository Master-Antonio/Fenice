# Agent Note: tierRouter elevation skips models without reasoning levels

Status: implemented

## Problem

The agent loop's tierRouter filled an unset reasoning effort with `high` for reasoning-tier tasks model-blindly, so a selected model with no reasoning support reached `prepareCall` with an explicit effort the adapter hard-rejects (`UNSUPPORTED_REASONING_EFFORT` in `resolveCallWithInfo`), failing a turn the user never asked to elevate.

## Decision

- `ReactLoopAgent` gains a private `supportsReasoningEffort()` that resolves the pre-waterfall route via the already-in-scope `LlmRuntime.resolveModelInfo` and returns true only when the returned info carries a defined `reasoning` field; lookup failure or abort collapses to false (abort rethrows).
- The `buildRequest` elevation now requires that signal alongside `tier === 'reasoning'` and an unset seed; otherwise the effort stays unset and the provider default applies. Explicit user/configured efforts keep winning exactly as before, and the `agent/request` waterfall, `prepareCall`, and header-logging order are unchanged.
- The elevation runs on the pre-waterfall route, so a waterfall retarget to a non-reasoning model can still reject downstream; the JSDoc and inline comment record that limitation.

## Alternatives considered

**Clamp the forced effort to a supported level.** Rejected because silently substituting an effort changes model behavior without telling the user, and `prepareCall` deliberately rejects rather than clamps.

**Check support after the waterfall on the final route.** Rejected because it would reorder the commit path (waterfall, prepare, header logging) for a marginal gain; the pre-waterfall check removes the crash for the common case without new plumbing.

**Add a capability service or session event for the lookup.** Rejected because `loopCtx.llm.resolveModelInfo` is already reachable at the elevation site, and elevation is not model-visible state requiring a log event.

## Consequences

Reasoning-tier tasks on reasoning models still elevate to `high`; on models with absent reasoning info the request omits the effort. Specs pin elevation-preserved, elevation-skipped, and explicit-wins; the skip spec is stash-verified red/green (red fails with zero adapter requests via the original `UNSUPPORTED_REASONING_EFFORT`). `docs/architecture.md` carries the one-sentence ordering fact; TS and Python SDK expected outputs are unaffected.
