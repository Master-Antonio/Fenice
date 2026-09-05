# Agent Note: Provider-neutral request economy defaults

Status: implemented

English | [中文](2026-09-05-provider-neutral-request-economy-defaults.zh.md)

## Problem

An efficiency audit of the harness (September 2026) found the request-economy machinery in good
shape but operating under defaults that left most of the value unrealized: tool schemas were
serialized in declaration order, so structurally equal schemas serialized differently across
restarts and config merges, invalidating provider prompt caches; the pi-ai stable-prefix flag that
fixes that existed but shipped OFF; the web fetch output cap (200,000 characters) admitted one
result six times the pi-ai wire budget (32,768) into the session log; and the model-free
tool-result pruner ran only under summary pressure, letting oversized results ride along in every
request until then. Each gap costs tokens on every provider — none of the fixes below depends on
any vendor's pricing or caching mechanics.

## Decision

Four defaults changed so the economy works out of the box:

- **Tool schemas are canonicalized on the wire** (`packages/llm/llm-deepseek/src/serialize.ts` via
  the new `canonicalizeJsonValue` in `dsh-util-values`; the pi-ai path already canonicalizes behind
  the stable-prefix flag): every parameters object is rebuilt with keys in sorted order as the
  request body is built, so structurally equal schemas serialize to identical text for every
  provider — DeepSeek, OpenAI-compatible, Anthropic, Bedrock — independent of insertion order or
  process lifetime. The durable session log keeps declaration order: canonicalization is a wire
  presentation, not a format change, so replayed history and the `request/header` events embedded
  in it stay byte-stable across harness upgrades.
- **`promptCacheStablePrefix` defaults ON** (`packages/llm/llm-pi-ai/src/lab.ts`): the flag that
  sorts the tool block, canonicalizes wire schemas, and normalizes CRLF is a baseline guarantee
  rather than an experiment. Leaving it OFF silently taxed deployments that never opened the
  Agent-Lab section; it remains toggleable there.
- **`DEFAULT_FETCH_MAX_OUTPUT_CHARS` is 32,768** (`packages/web/tool-web`), aligned with the pi-ai
  wire budget. The cut is head-and-tail (70/30 with an elision marker) instead of head-only, at
  both the source and the output level; HTML keeps a head-only source cut because a mid-markup seam
  can break the tag-matching conversion and omit the page entirely.
- **The tool-result pruner runs on every automatic compaction check**, not only once the pressure
  threshold qualifies (`packages/compaction/compaction-basic`): the model-free pass is idempotent,
  so per-step pruning lands freshly oversized results immediately and the steady-state cost is one
  scan per step with zero new events. The most recent tool result is spared while stepping — the
  model may be working from it this very turn (a skill just loaded, a file just read); only
  context-overflow recovery prunes the freshest result too, where maximal relief wins.

## Alternatives considered

**Canonicalizing in `dsh-tools` at definition registration or in `system-prompt` at assembly** —
rejected: the canonical form would land in the DURABLE `request/header` events, changing the session
log format's byte content and invalidating every recorded fixture that embeds a header event. The
session log keeps declaration order; canonicalization lives in each adapter's wire serialization,
where it is a presentation choice that replay never sees. The PTC SDK projection (`sdkSchemas`) is
likewise left untouched: its rendered TypeScript member order is stable per build, and re-rendering
it would shift every PTC golden for a purely cosmetic gain.

**Making the fetch cap provider- or tool-configurable only** — the cap already is config
(`fetchMaxOutputChars`); only the default changes. A higher default would keep the old behavior one
`config:` line away for deployments that want it.

**Gating per-step pruning behind a new config flag** — the pruner's mount is already the opt-in;
a second flag would only add a state where the pruner is mounted but effectively inert below
pressure, which is the behavior this change removes.

## Consequences

- Provider prompt-cache hit rates stop depending on declaration-order stability, on every adapter
  that canonicalizes its wire body (DeepSeek natively, pi-ai via the now-default stable-prefix flag).
- A 200k-character fetch body now lands ~8k tokens in the log instead of ~50k; text bodies keep
  their conclusion (tail) where the old cut dropped everything after the cap.
- Sessions with large tool results get their mass cut per step without any summary request, while
  the freshest result stays verbatim; the summary path remains the late-stage tool it was, only
  rarely needed.
- The Agent-Lab section's default-ON set is now {cascadeMetrics, turnTelemetry,
  promptCacheStablePrefix}; deployments toggling flags are unaffected, fresh deployments start with
  the economy working.
