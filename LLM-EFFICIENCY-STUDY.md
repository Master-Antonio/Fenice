# LLM efficiency study — Fenice (September 2026, revised)

This study extends the September 2026 efficiency audit (four specialized subagents: context anatomy, tool-result and compaction economy, cache and request economics, upstream and external scan, plus manual synthesis). Since the audit, its P0 items 1–3 shipped as defaults (`.agents/notes/implemented/feature/2026-09-05-provider-neutral-request-economy-defaults.md`): wire-level schema canonicalization, `promptCacheStablePrefix` defaulting ON, the 32,768-character web-fetch cap with head/tail cut, and per-check tool-result pruning that spares the freshest result. What follows keeps the verified cost map, corrects the per-provider picture with checked vendor documentation, lists the problems still open in this tree with file pointers, and ranks the remaining work so every token saved keeps identical behavior. Estimates use 1 token ≈ 4 characters; JSON-heavy payloads may undercount by up to ~30%. Nothing below is invented: unverifiable claims are marked as such.

## 1. What the fork already does (do not re-propose)

Inline micro-compaction plus a spill store with `[compaction_pointer: <id>]` dereference points; `maxToolResultChars` (32,768); summary compaction (`compaction-basic`, threshold 0.8 with 0.16 retention) plus the model-free tool-result pruner; the token-meter service with route pricing surfaces; the complexity-driven tier router plus self-healing; the fallback cascade with circuit breaker; packed session history with session format v2; the per-model reasoning-effort editor; the frozen `LlmCallConfig` with epoch for prompt-cache stability; image budgets by pixel and byte counts; runtime-context snapshots emitted only on change with dedup; canonical wire schemas; and the 32k fetch cap.

## 2. Request cost map (headless profile, 24 tools)

| Component | Tokens per request | Note |
|---|---|---|
| Identity plus persona | ~40 | lean |
| Per-tool guide sections (17) | ~1,050 | `system-prompt` |
| Tool schemas (24) | ~5,720 | workflow 983, str_replace_editor 763, bash 441, todo 292, subagent 270 |
| **Fixed total** | **~6,800** | paid on every request |
| Runtime-context snapshot | ~100 | on-change only, deduped |
| Skill catalog | ~120 + ~125 per skill | 500-character description cap |
| Agent instructions (AGENTS.md) | up to ~16,400 | 64 KiB budget, head-only |
| History (whole surface) | growing | mitigated by pruner and compaction |
| PTC mode (opt-in) | SDK ~7,184 | costs more than the native path it replaces at 24 tools |
| Preset cordis (opt-in) | ~3,700 | 10.2k-character section plus 4 tools |

## 3. Key cross-cutting insight

Wherever automatic context caching exists, a cached token costs a small fraction of a fresh one, so the economic order changes: **protecting prefix stability beats compressing harder**, while output tokens (reasoning) and fresh tool-result mass stay expensive. The two dominant levers are therefore (1) cache hit rate and (2) tool-result mass, in that order. Summary compaction itself is now a cost — it re-misses the whole cache — so it belongs late, not early, with model-free pruning and stable prefixes doing the early work.

## 4. Per-provider caching mechanics (checked) and what Fenice owes each one

Every provider below rewards the same universal mechanism — a byte-stable prefix with static content first and volatile content last — but each one needs its own parameters. The harness core must stay neutral; per-provider values belong in route policy, never in shared code.

**DeepSeek.** Automatic context caching is best-effort on the shared prefix with usage fields reported per request; flash pricing discounts cache hits to roughly 1/31 of a miss with 1M-token windows and half-price off-peak windows. Fenice answers with canonical wire schemas, the default-ON stable prefix, late compaction, and optional off-peak scheduling kept as deployment policy rather than harness behavior.

**OpenAI.** Prompt caching is automatic by default and requires an exact repeated prefix match (1,024 tokens minimum on current models, 2,048 on older ones, counted in 128-token increments); tool definitions and their order participate in the prefix, so key or order changes invalidate it. `prompt_cache_key` improves routing stickiness toward the machine holding the KV state (about 15 requests per minute per prefix-plus-key before overflow routing spreads load), current models add explicit breakpoints (up to four writes, reads across up to 50 breakpoints) with 30-minute TTL and `in_memory` versus `24h` retention, and the Codex team documents the same discipline Fenice adopted: identical ordered stable prefixes with changes appended, never edited in place. Fenice answers with the same stable-prefix machinery plus a `prompt_cache_key`-style sticky routing affordance where the transport supports it, configured per route.

**Anthropic.** Caching is explicit via `cache_control` (up to four breakpoints) or automatic via one top-level field that rides the last cacheable block forward as the conversation grows; the order is tools, then system, then messages, writes cost 1.25x base input while reads cost 0.1x, TTL is 5 minutes refreshed on hit with an optional 1-hour TTL, minimum cacheable prefixes are model-dependent (1,024 for Sonnet-class, 4,096 for Opus/Haiku-class), reads look back at most 20 blocks for a previously written entry, and thinking or effort changes invalidate the messages cache. The robust agent-loop pattern is one explicit breakpoint at the end of the static prefix plus automatic caching for the growing tail, with `max_tokens: 0` pre-warming available at startup. Fenice already models `cacheRetention` (`none`, `short`, `long`) and marks `cache_control` support on `anthropic-messages` tool definitions (`packages/llm/llm-pi-ai/src/catalog.ts`); the missing piece is strategic breakpoint placement (end of system, end of tools, last stable point) per route instead of relying on the moving tail marker, which lands on varying content and pays write premiums that are never read back.

**Google Gemini.** Implicit caching is automatic on Gemini 2.5 and newer with nothing to configure (minimum 2,048 tokens on 2.5, 4,096 on 3.x, up to 90% discount on cached tokens, no storage charge), while explicit `CachedContent` buys guaranteed placement with TTL storage cost for large stable corpora referenced repeatedly. Fenice answers with the universal stable prefix; explicit caches are a deployment choice for huge stable contexts, not harness behavior.

**Bedrock and other OpenAI-compatible routes.** Prefix caching exists in vendor-specific form behind each gateway, so the universal stable prefix plus per-route effort and policy configuration is the whole story; no Fenice core code may assume any one vendor's pricing or TTL.

## 5. Problems still open in this tree

**P1 — small code, high value.** Defer distant tool families (workflow, ralph, goal: schema plus guide section on demand through the existing restriction pattern) to remove ~1.9–2.1k fixed tokens per request (~30% of the fixed cost). Drop `str_replace_editor` from the base composition (read, write, and edit cover it; the compat preset remounts it) to remove ~763 tokens per request. Gate the pwsh tool family on win32 to remove ~570 tokens per request on POSIX. Cap skill-catalog descriptions at 200 characters instead of 500 (`packages/skill/tool-skill/src/index.ts`) and unify the repeated prose, saving ~75 tokens per request per 10 skills. Dedup the section-versus-description guidance repeated across subagent, jobs, and goal (~150–250 tokens per request plus divergence risk). Extend `session_event_read` to resolve `[compaction_pointer: <id>]` to the original event so the wire budget can be lowered safely. Slim the PTC SDK prompt by emitting the output map only for sub-dispatched tools instead of all of them.

**P1 — configuration that already exists but is never turned on.** Configure `modelPolicies` for `compaction-basic` (implemented in `packages/compaction/compaction-basic/src/config.ts`, referenced nowhere in `packages/bundle/`): an economy-tier summarizer with output caps and retries, with the 0.8 threshold revisited against 1M windows. Mount the `session-query` tool with content search for deployments that want agents to interrogate past sessions instead of reloading context (`openAt: never` is the current default in `packages/bundle/base/cordis.patch.yml`).

**P2 — structural, flag-gated, one at a time.** Age-graded wire budgets (recent results full, older results cut harder, wire level only with the log intact). Tombstones for superseded results in the Anthropic context-editing style (reread file or rerun command collapses to one line plus a pointer, with a conservative superseded heuristic). Byte-level dedup of consecutive identical results. Dropping historical `reasoning_content` on non-tool-call turns after K turns (medium-high risk: the protocol answers 400 without passback on tool turns, so flag-gated and gateway-tested only). Spill-store eviction (no TTL or LRU exists today). `semanticMemory` over embeddings plus session-query for cross-session recall without reloading history (large project). Strategic per-provider cache-breakpoint placement, starting with Anthropic explicit markers. Unified cache telemetry (hit rate plus prefix fingerprint) surfaced through token-meter and session-query so efficiency is measurable on every route. Efficiency metrics per snapshot scenario (tokens per turn, tool-result mass, estimated hit rate) next to the expected outputs, turning every optimization PR into a measured non-regression proof on each provider in the corpus. Per-route reasoning-effort defaults in config (policy, never core): `high` default, `low` for non-code surfaces, `max` opt-in, measured through token-meter rather than assumed.

## 6. Algorithms in use and proposed

Canonicalization rebuilds each parameters object with recursively sorted keys at wire-serialization time (`canonicalizeJsonValue`), so structural equality implies byte equality without touching the durable log. Prefix fingerprinting hashes the stable prefix per request and exposes it in telemetry, turning invisible invalidations into a visible diff signal. Tier routing scores task complexity (informational, standard, code, multi-step tools, deep reasoning) into fast, standard, and reasoning tiers (`packages/llm/llm-pi-ai/src/tier-router.ts`) so the cheapest capable route serves each request. Tombstoning replaces a superseded result with a one-line marker plus a dereferenceable pointer once a conservative same-target heuristic fires. Dedup hashes consecutive result bytes and collapses repeats. Age grading applies progressively smaller wire budgets by result age while the log keeps everything. The model-free pruner scans per step with zero new events and spares the freshest result while stepping. The spill store pages oversized content out of the message with pointer markers and still needs bounded eviction. Pointer retrieval resolves a marker back to its source event on demand. Semantic recall embeds history and retrieves by similarity instead of reloading it. Metering projects request and surface tokens through replay-aware folds so every claim above is measurable in the gate rather than asserted in prose.

## 7. What NOT to do (worse than doing nothing)

Do not lower `reasoningEffort` blindly by default: reasoning tokens dominate cost in tool loops, but stepping down degrades complex tasks with no benchmark in the repo to justify it — measure per surface through token-meter first. Do not compact early: with deep cache discounts and 1M windows, early summary compaction costs more than the extra context because every compaction re-misses the whole history — prune model-free with stable prefixes and compact late. Do not add model-facing pagination (`head_limit` or `offset` in tool schemas): rejected by recorded decision, with config budgets plus spill covering the need. Do not break `reasoning_content` passback on tool turns: the API answers 400. Do not chase a shorter prompt below a provider's minimum cacheable length: a slightly longer stable prefix that caches beats a shorter one that never does.

## 8. Aggregate estimate (20-turn agent session, 40k average context)

Without cache: ~800k input tokens. With a ~90% stable-prefix hit rate: roughly an 8x cost reduction on the cached portion. P0 plus P1 mass and fixed-cost work removes ~30–50% of effective per-request tokens in fetch- and read-heavy sessions and ~20–30% of the fixed cost in profiles with deferred families. Scheduled off-peak runs halve DeepSeek-billed totals where the tariff applies. These are planning estimates from the verified cost map, not measurements of any specific deployment.

## 9. Sources (checked September 2026)

- DeepSeek pricing (flash hit versus miss, off-peak discount): https://api-docs.deepseek.com/quick_start/pricing/
- DeepSeek automatic context caching (best-effort prefix, usage fields): https://api-docs.deepseek.com/guides/kv_cache/
- DeepSeek thinking mode (reasoning_effort low, high, max; high default): https://api-docs.deepseek.com/guides/thinking_mode/
- OpenAI prompt caching guide (automatic and explicit breakpoints, TTL, retention, routing keys): https://developers.openai.com/api/docs/guides/prompt-caching
- OpenAI Prompt Caching 201 (prefix discipline, Codex loop lessons, cache keys, Flex processing): https://developers.openai.com/cookbook/examples/prompt_caching_201
- Anthropic prompt caching (automatic versus explicit breakpoints, TTL, lookback, pre-warming): https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- Anthropic prompt-caching patterns (prefix-match invalidation, placement, diagnosis): https://github.com/anthropics/skills/blob/main/skills/claude-api/shared/prompt-caching.md
- Google Gemini context caching (implicit versus explicit, minima, discounts): https://ai.google.dev/gemini-api/docs/generate-content/caching
- Anthropic context editing (reference technique for tombstones): https://platform.claude.com/docs/en/build-with-claude/context-editing
- Anthropic effective context engineering for agents: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
