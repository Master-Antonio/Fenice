# Agent Note: Model-row reasoning-efforts editor

Status: implemented

## Problem

A pi-ai model's reasoning behavior is configured per model: the `reasoningEfforts` dict names the levels a model offers and the wire value each one sends, and the field is the only way to give a hand-declared model reasoning at all. Until now it existed only in `settings.yaml`, so every new model meant hand-writing a nested YAML dict — indented maps, quoted values, and the `off: null` convention — with no help from the Models page, where everything else about a model row is editable. The failure mode was concrete: malformed indentation (including tabs pasted from other editors) in real settings files, and a dict the adapter then refuses at load.

The composer's model picker already offers per-model effort levels from the adapter's resolved catalog, but it changes one conversation's request; it cannot declare which levels a model offers, and it cannot spell a gateway's wire values. The earlier deliberate absence of a reasoning control applied to a *provider-scoped* control, which could only set one value for models that disagree; a per-model control does not have that defect.

## Decision

The pi-ai model rows' advanced fold — the fold that already carries context window and max output tokens — edits the row's `reasoningEfforts` (`packages/client/ui-settings-models`). One select mirrors the adapter's resolution semantics exactly: **provider default** removes the field (the installed catalog's capability applies; a hand-declared model then has none), **disabled** stores `false` (a non-reasoning model), and **custom levels** materializes one row per level with a checkbox and a wire-value input. An emptied `off` value stores `null` — "supported, send nothing" — and an emptied level beyond `off` withdraws the level rather than storing a value the adapter would refuse. Choosing custom prefills every schema level, spelled as itself, which is the shape nearly every OpenAI-compatible gateway accepts.

The offered levels are read from the adapter's own schema at render time — the key union of the `reasoningEfforts` dict on a probe model row, the same schema read the page already uses for wire-protocol choices (`reasoningLevelChoices` in `store.ts`, keyed off the `providers.<route>.api` pattern). The client owns no level vocabulary, so a pi-ai upgrade that adds a level reaches the page without a client change, and the page can never offer a level the adapter cannot dispatch. Where the schema declares no reasoning field, the control is hidden rather than offered empty.

Validation joins the shared per-row checker (`validateDeepSeekModels`), which now also rejects what the adapter's resolution rejects and the serialized schema cannot express: a dict offering no level beyond `off`, or a level beyond `off` with no wire value. The host's `settings-rejected` validator stays the authority; the row-level failure exists so the submit button is disabled and the message names a visible row instead of a settings path.

## Alternatives considered

**A provider-scoped effort select on the card.** Rejected for the reason already recorded: the models under one provider disagree about reasoning, so one control could only store a value some of them reject, and for pi-ai the capability lives per model in the first place.

**Fetching the levels from the provider's HTTP endpoint during model discovery.** No listing endpoint reports a model's reasoning protocol; only the adapter's catalog and its configuration schema are authoritative, so a fetch would invent data. For installed-catalog models the right answer is the inherit mode, which reads the catalog's capability without copying it into settings.

**Prefilling adopted rows with the catalog's reasoning capability.** Unnecessary: an adopted row without the field inherits the installed catalog entry's capability, so writing the dict would only freeze a copy that later catalog updates stop tracking.

## Consequences

- The `settings.yaml` hand-edit this page existed to remove — a nested per-model dict with quoting and indentation rules — is gone for the common case; the stored document keeps the same shape, so no migration or compatibility behavior changes.
- The schema-read pattern now has two consumers (protocols, reasoning levels). Both fail closed: an unreadable schema hides the control instead of offering a guessed vocabulary.
- The per-row validation type grew two message keys shared by both adapter families' cards; the DeepSeek family has no such field and its rows never carry one, so the check is a no-op there.
- The create card for hand-declared providers gets the same editor through its model list, which is where a new model's reasoning is most often first declared.
