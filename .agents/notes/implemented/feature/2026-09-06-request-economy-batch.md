# Agent Note: Request-economy roadmap batch (P1 and P2)

Status: implemented

## Problem

The September 2026 efficiency audit mapped a ~6.8k-token fixed cost per request (tool schemas plus per-tool guide sections), unbounded tool-result mass, summarization following the session's own (possibly premium) route, and no measurable cache-efficiency surface. Its P0 items already shipped as defaults (canonical wire schemas, stable prefix on, 32k fetch cap, per-check pruning). This note records the P1 and P2 follow-ups: what shipped, what was verified already present, what was rejected on measurement, and what stays deferred with its unblock condition.

## Decision

Shipped, each with unit tests and refreshed recorded fixtures where model-visible text changed.

Skill catalog descriptions cap at 200 characters by default (was 500) with an explicit per-deployment override intact; the initial and replacement catalog framings share one shell renderer with byte-identical output. The `editing-cordis-compositions` and `dsh-badge` recorded descriptions truncate accordingly.

`str_replace_editor` leaves the base composition: read, write, and edit cover the agent loop, extending the [single-editor preset decision](../simplification/2026-08-10-default-presets-single-editor.md) from presets to the shared base. The `minimal` preset, the standalone `sdk-minimal` bundle, and the `persistent-tools` recorded scenario (through its own composition patch) keep the tool; the base dependency moves to the scenarios that need it.

The workflow, goal, and ralph model-facing tools leave the base composition while their engines (worker-thread, spawn backends) and the `/goal` command stay. The `standard` and `cordis` presets remount all three per session, so Web sessions are unaffected. Recorded headless scenarios pin back what their model turns call through their own compositions: `workflow-run` and `ralph-loop` own new `workflow` and `ralph` compositions, the `advanced` composition carries `tool-workflow` for the toolchain scenarios, and the ACP `image-compaction` window recalibrates 11600 to 9600 so its text-only history stays under threshold while text plus image tokens exceed it. Shell platform gating needed no change: base already gates bash and pwsh on opposite `!!js` platform facts with a spec pinning both outcomes. Composition rule learned the hard way: the ACP `escalation-approved` live patch is the shared base layer for every ACP scenario and for the CLI goal test, so it stays free of scenario-specific rows; the CLI goal lifecycle pins `tool-goal` through its own `apps/cli/tests/profiles/acp/goal.cordis.yml` fork instead. Shared sidecar symlinks stay exactly where the corpus design put them: a refresh writes through a symlink into the linked file, so diverging compositions need owned sidecars, never edits through the link.

Summary compaction on pro-tier sessions routes through the economy flash model with a capped 4096-token output via `modelPolicies`; other routes keep the follow-the-session default, so non-DeepSeek deployments are unaffected.

Guide sections no longer repeat their tool descriptions. Descriptions stay complete because PTC-mode agents read schemas without sections; sections keep only orchestration the descriptions cannot carry (subagent batching, goal resume and blocking policy, the bash investigate habit). Package READMEs quote the new section texts verbatim.

Pruned-original recovery is a tested property, not new machinery: the event-sourced log keeps full originals behind pruner replacements, and `session_event_read` serves them with the replacement chain available through `session_event_trace`. The `compactionPointer` flag stays off: with no reader, emitting pointers would only add spill writes. The tool README documents the recovery contract.

PTC mode keeps its full output map. Measured on the headless tool set, the SDK declarations cost roughly 5.4k tokens split into 3.9k of argument map, 1k of output map, and fixed instructions; the output map is load-bearing for result-shape reasoning, so trimming it trades certain correctness for a fifth of the section. The [PTC note](2026-06-15-ptc.md) records the measured guidance instead.

Session-query tools mount in the base composition with a lazily opened full-text index (`openAt: first-search` on base and web), reversing the [not-shipped-default](../feature/2026-08-02-session-search-not-shipped-default.md) and [content-search opt-in](../architecture/2026-08-13-session-content-search-opt-in.md) defaults: lazy opening removes the startup-cost objection behind those decisions, `:memory:` keeps no derived database, and recall-without-reload plus pruned-original recovery need the tools where agents run. The measured fixed cost is roughly 1k tokens per request. The `persistent-tools` scenario disables the row to keep its documented minimal surface, and the redundant `session-query-spill` inserts are gone.

Wire-level superseded-result collapsing ships as shared `dsh-llm` machinery (`collectSupersedeCandidates`, `planSupersededCollapse`, `supersededMarker`) wired into both the pi-ai and DeepSeek adapters behind explicit opt-in knobs (`collapseSupersededResults`, default false). Only the newest identical (tool, canonical-arguments) call stays full; error results never collapse either way. The collapse is monotonic — history only grows, so a collapsed result stays collapsed — which keeps the provider prefix cache-stable, unlike age-graded budgets. The marker names only the tool, never positions or ids.

The spill store bounds entries (`maxEntries`, default 1000), evicting oldest-first with spill-file removal.

Token-meter gains a `cacheEfficiency` session projection (cached share of billed prompt tokens with an explicit hit rate), folded from the same provider-reported usage samples as the usage unit, so efficiency is measurable on every route through session projections.

DeepSeek requests gain `staleReasoningKeepLast`: reasoning drops past its window on tool-call-free turns only, newest-first, so dropping is monotonic and cache-stable; tool-call turns always keep reasoning because the API rejects the request without the passback. The pi-ai route-level effort default already exists as the profile `reasoning` field with aliasing and per-model resolution, so no new knob was added there.

## Alternatives considered

**Age-graded wire budgets.** Rejected: a budget varying with message age re-truncates old messages every turn, which re-misses the whole provider prefix cache for a saving the log-level pruner already captures in cache-stable form.

**Collapse and stale-reasoning defaults on.** Rejected: identical repeat calls include compare-before/after workflows where the older output is the point; content-hiding defaults need production token-meter evidence first, and both knobs are one line to enable per deployment.

**An SDK-profile compat row for the editor.** Replaced by the scenario pin: a divergent SDK tool surface broke the shared sidecar design (SDK scenarios source headless pins), so the surface tracks base uniformly and the one scenario needing the editor pins it.

**Trimming the PTC output map.** Rejected on measurement: at roughly a fifth of the declarations and load-bearing for result-shape reasoning, the cut trades certain correctness for about 1k tokens in an opt-in mode.

**A spill-pointer resolver in session-query.** Rejected: logged events never carry wire pointers, so the machinery would be unreachable; the log-intact recovery above is the owned path.

**Anthropic explicit breakpoint placement from the harness.** Rejected: marker mechanics and placement live in the vendored pi-ai provider, and wire behavior cannot be verified without a provider key; the harness contribution stays the default-on stable prefix plus the audit trail.

**Off-peak cost calendar, snapshot efficiency gating, and semanticMemory.** Deferred, not rejected. The calendar has no consumer (token-meter prices tokens, not tariffs); snapshot gating is unsound on normalized replay usage; semanticMemory needs an embedding provider abstraction plus a vector store with a first consumer, which is a project of its own. The `cacheEfficiency` projection is the measurement foundation all three build on.

## Consequences

Base headless requests drop four schemas plus three guide sections and gain five session-query schemas with one guidance section, for a net fixed-cost reduction around 2k tokens per request with recall capability in return. Recorded fixtures track the new surfaces: new `workflow` and `ralph` compositions, recalibrated ACP compaction window, truncated skill descriptions, and trimmed guide sections. Content-hiding wire features ship default-off with tested, documented enablement paths. Deferred items keep their unblock conditions above instead of speculative machinery.

## Verification

New unit tests pin the skill-cap default, the base-row absences, the flash summarizer policy, the section/description split on both sides, pruner recovery through exact reads, tombstone determinism/monotonicity/error exemption on both adapters and both image paths, spill eviction with file removal, the efficiency projection including retry replacement, and both new adapter knobs with their validation. Full unit, snapshot replay (118/121 headless with only the environmental CPython-3.9 `ptc-python-turn` failing, 16/16 SDK), owner-local expected suites (only the two pre-existing failures), `test:docs`, build, and the per-file coverage gate verify the batch; `pnpm run duplication` still reports only the pre-existing tier-router clone.
