# Agent Note: Reasoning vocabulary rides model discovery; hand-added levels; refused-effort chat hint

Status: implemented

## Problem

A Web-UI turn on `tokenrouter` free models (`z-ai/glm-5.3-free`, `qwen/qwen3.8-max-free`) ended with no model output and no visible error. The session log carried the whole diagnosis: `turn/end {"kind":"error","code":"UNSUPPORTED_REASONING_EFFORT"}` — the profile requested reasoning effort `high`, which those models do not support. Three gaps combined into the silent dead end:

1. `discoverModels` returned only `id`, `name`, `contextWindow`, `maxTokens`, and `adopt()` dropped everything else, so a model row never learned the vocabulary its route supports; the user could not see that no reasoning level was offered.
2. The reasoning editor only listed schema-known levels with no way to name one by hand, so gateway-only vocabularies (e.g. a token-router endpoint) were inexpressible.
3. The chat turn-error row rendered the raw provider message, which names the model but suggests no fix.

## Decision

- `LlmDiscoveredModel` gains optional `reasoningEfforts?: Record<string, string | null>`. The pi-ai discovery fills it from the catalog model's own reasoning offer (`getSupportedThinkingLevels` spelling, `off: null`), endpoint listings keep omitting it, and `adopt()` carries it onto the new row. The generated cordis catalog was regenerated for the widened interface.
- The model row's custom reasoning block lists schema levels plus already-offered hand-added keys, and adds a name/wire composer: a blank wire spells the name itself (`off` spells nothing), mirroring what offering a schema level stores. Arbitrary keys pass the existing key-agnostic row validation and resolve through the adapter's dict lookup.
- A turn failing with code `UNSUPPORTED_REASONING_EFFORT` renders the localized `message.reasoningEffort.hint` beneath the failure, pointing at the model's Reasoning efforts setting.

## Alternatives considered

**Default the profile effort down when discovery reports no vocabulary.** Rejected because discovery cannot distinguish "route supports no reasoning" from "endpoint listing discloses none"; silently lowering a requested effort would change model behavior without telling the user.

**Block applying a model whose effort the route rejects.** Rejected because refusal happens at call time against live provider state the settings page cannot observe; the page validates shape, the adapter enforces support.

**Show the raw provider message only.** Rejected because the observed message (`pi-ai provider "tokenrouter" model ... does not support reasoning effort "high"`) identifies the conflict but not the setting that resolves it.

## Consequences

Catalog-known models adopt with their reasoning vocabulary; gateway rows gain a manual composer; a refused effort now explains itself in chat in both locales. The editor's two defensive arms (undefined-schema fallback, invalid-name refusal) carry `v8 ignore` comments because the UI that renders them makes both unreachable — the same justification sibling cards already use. Two structurally unreachable pre-existing arms (`reasoningDict` non-dict fallback, `defaultReasoningEfforts` undefined-schema fallback) are unchanged; package-scoped coverage shows them exactly as on master.

Tests pin the discovery vocabulary with a stash-verified red/green pair, the hand-add/adopt/toggle/clear flows through a direct `ModelListEditor` harness, and the chat hint text. `verify-cordis-catalog`, `verify-client-ui-i18n`, oxlint, and the host/client `tsc` faces pass.
