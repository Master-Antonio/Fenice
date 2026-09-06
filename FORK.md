# Fenice — what this fork changes relative to upstream

> **Name**: **Fenice**. **Base**: upstream `deepseek-ai/deepseek-harness` `master` post `dsh-0.1.3-alpha.1` (merge `d2d87d6693`) plus the provider-neutral request-economy defaults (`0f35f7cc18`). **Remotes**: `origin` is Fenice, `upstream` is `deepseek-harness`; `git fetch upstream && git log HEAD..upstream/master` always shows what upstream did since the last sync.

---

## 1. Overview

| Area | Upstream | This fork |
|---|---|---|
| Documentation | Bilingual EN/ZH with pairing sidecars | English-only; no `*.zh.md` or `*.i18n.yaml` counterparts |
| Request economy | Vendor-dependent prefix stability, 200k web-fetch cap, compaction-gated pruning | Byte-stable prefix by default, 32k web-fetch cap, per-check tool-result pruning that spares the latest result |
| Provider resilience | No fallback | Automatic fallback cascade with eligibility, single-flight, anti-cycle, optional circuit breaker |
| Output safety | None | Streaming marker-based proxy-envelope sanitizer, JSON-safe on tool arguments |
| Context FinOps | None | Micro-compaction of tool outputs past a configurable threshold |
| Chat UI | Copy/branch only | Real edit-and-regenerate and per-turn delete |
| Models settings | Base fields | Per-profile fallback route/budget fields with guards |
| Runtime locales | zh, en | zh and en built in, plus it, de, es, fr, ja rollout packs with EN fallback |
| Experimentation | None | `agent-lab` flag namespace with external JSONL telemetry |
| Toolchain | Full-monorepo gates | Scoped Stage-1 commands in `.ouroboros/mechanical.toml` |

---

## 2. English-only documentation

The documentation corpus is English-only: every README, subsystem page, and Agent Note is authored in English with no translation counterparts, while product UI copy keeps its runtime locales (`packages/client/locale` and the per-package rollout dictionaries), which is application internationalization rather than documentation.

The retired machinery is gone with the counterparts: the translation-pairing gate and its scripts, the `docs/i18n/` governance pages, the zh branches in the generated-catalog writers, the zh locale in the website build, and the zh requirements in the note-format and archive gates. The archive gate re-seals frozen notes whose only change is the removal of the `English | [中文](...)` switcher line and rejects bilingual sidecars, so the frozen archive stays immutable after the one-time transition.

Every future upstream sync re-introduces upstream `*.zh.md` and `*.i18n.yaml` files; the sync resolution deletes them again and the retired gates no longer fail on their absence. The superseded bilingual-machinery notes remain as history; `.agents/notes/implemented/process/2026-09-05-english-only-documentation.md` is the current authority where they conflict with English-only reality.

---

## 3. Provider-neutral request economy defaults

Tool schemas serialize in canonical key order on the wire (`canonicalizeJsonValue` in `dsh-util-values`), so the provider prompt cache stays keyed on a byte-stable prefix across restarts and config merges while the durable session log keeps declaration order for replay and recorded fixtures.

The web-fetch output cap is 32,768 characters aligned with the pi-ai wire budget, keeping head and tail with an elision marker for plain text at both source and output level; HTML keeps a head-only source cut because a mid-markup seam can break tag matching.

The model-free tool-result pruner runs on every automatic `compaction-basic` check instead of only when pressure qualifies, so oversized results are cut while fresh; the most recent tool result is spared while stepping because the model may be working from it in the current turn, and context-overflow recovery still prunes everything.

## 4. LLM resilience: fallback cascade plus circuit breaker

When a route fails before emitting tokens, the request is served by the configured reserve provider and model, with transient-only eligibility (rate limit, server, timeout, transport), single-flight token discipline, write-time rejection of self-fallback and mutual cycles, and a once-per-route visit set at runtime. An optional breaker opens a route after repeated eligible failures and probes it half-open; every hop passes through a structured fallback hook with optional external JSONL metrics.

## 5. Real-time proxy-envelope sanitization

Proxy routers inject telemetry blocks such as `<details><summary>…Response ID…`. Only content carrying an envelope marker is removed so legitimate assistant `<details>` blocks pass through untouched, tool arguments are never rewritten because the scanner finds the end of the top-level JSON value while respecting strings and escapes, and every scan is linear with no nested quantifiers.

## 6. Tool-output micro-compaction

Past `maxToolResultChars` (default 32,768, configurable per profile and from the Models page) an inline result compacts to head plus an omission marker plus tail on both text-only and multimodal paths, with the multimodal structure passing through intact and the threshold validated at resolution time.

## 7. Chat UI: real message actions

Edit forks at the previous turn and prefills the original prompt in the child session composer for true modify-and-regenerate, Delete forks while excluding the whole turn, and Branch stays tail-only. The first turn of a conversation cannot produce an empty child, so Edit and Delete degrade to copy there.

## 8. Models settings

Per-profile pi-ai fields cover the fallback provider (with a datalist of the other routes and a live unknown-route warning), the fallback model, and the tool-result character budget with invalid-value clearing. Scope stays limited to the `pi-ai` family.

## 9. Localization: seven runtime locales with incremental rollout

`LOCALE_IDS` ships zh and en as required built-ins and `ROLLOUT_LOCALE_IDS` adds it, de, es, fr, and ja as optional packs whose missing keys fall back to EN per namespace, so covering new surfaces never blocks a release. The picker, browser detection by primary subtag, and `<html lang>` follow the same registry.

## 10. Agent-lab: flags, external telemetry, bench

The `agent-lab` settings namespace carries the experiment flags with live per-request reads, a dedicated settings UI, and crash-safe external JSONL telemetry for turn and fallback events. An out-of-repo bench runner compares OFF/ON phases under injected faults with deterministic quality checks. `promptCacheStablePrefix` is implemented and now defaults on; the remaining declared flags stay inert until wired.

## 11. Toolchain

`.ouroboros/mechanical.toml` carries scoped Stage-1 commands (host library build, per-package vitest, direct oxlint) because the full-monorepo gates do not fit a verification timeout, and the Windows `npm_execpath` handling in the build script covers native `.exe`, JS-under-node, and `.cmd/.bat` shims.

---

## Syncing from upstream

```bash
git fetch upstream
git log --oneline HEAD..upstream/master     # what is new there
git merge upstream/master                   # or rebase, by taste
```

Expect conflicts almost only in the files named above; they are localized additions or new functions, so the merge stays mechanical. Each sync re-introduces upstream `*.zh.md` and `*.i18n.yaml` files; delete them again as part of the sync resolution. After the merge, re-run `pnpm run typecheck`, the touched package suites, `pnpm run lint`, and `pnpm run doc-sync` before committing.

## Not yet wired

`compactionPointer`, `tierRouter`, `sessionTruncate`, `mcpServer`, `semanticMemory`, and `selfHealingLoop` keep their flag descriptions with no effect until wired. Each one needs its owning capability before activation.
