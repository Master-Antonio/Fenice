# Fenice against the harness market (September 2026)

This page compares Fenice with the most-used coding harnesses on the dimensions that decide production cost and behavior: provider neutrality, request economy, context management, session durability, determinism, tooling safety, orchestration, extensibility, cost measurability, and self-hosting. Fenice claims below cite this repository's code and gates; competitor claims cite the sources at the bottom, all checked September 2026. Where Fenice loses, it says so.

## Competitors in scope

OpenCode V2 (open-source agent runtime, TypeScript, client-server over HTTP/SSE with an OpenAPI contract), Claude Code (Anthropic's terminal-first harness, five-layer compaction pipeline, seven permission modes), Cursor (AI-native IDE fork with Composer agent mode), GitHub Copilot (inline completion plus agent mode, flat per-seat pricing), Aider (terminal-first, API-cost-only, deep git integration, local-model support), Continue.dev (open-source IDE extension, local-first), Cline (VS Code agent, pay-your-own-key), Windsurf Cascade (IDE with flow continuity, credits model).

## 1. Provider neutrality and model choice

Fenice routes DeepSeek natively and any other vendor through a pi-ai catalog (Anthropic, OpenAI-compatible, Bedrock-style routes), with per-route fallback cascades, an eligibility taxonomy that only retries transient faults, and a circuit breaker. Nothing in the request economy depends on one vendor's pricing: canonical wire schemas, stable prefixes, fetch caps, and pruners are payload mechanisms. OpenCode is broader out of the box (75+ providers via AI SDK and Models.dev, local models, per-agent model override with variant selection). Claude Code is Anthropic-native: deepest single-vendor tuning (thinking signatures, cache-aware microcompact), zero portability. Cursor and Copilot are multi-model but product-bundled (model choice inside their subscription). Aider and Continue take any API key including local Ollama endpoints, which is the practical answer for air-gapped or data-residency deployments. Fenice sits between Aider and OpenCode: narrower catalog than OpenCode, but every route gets the same economy machinery instead of per-vendor special cases.

## 2. Request and token economy

Fenice treats the request prefix as the scarcest asset: canonical key order plus tool sorting keep provider caches keyed across restarts, the durable log keeps declaration order for replay, and a prefix fingerprint in telemetry turns invisible invalidations into a visible signal. Measured fixed cost on the headless profile is about 6.8k tokens per request with distant tool families deferred to preset and scenario compositions. Micro-compaction (32k budget, head/tail with markers) and per-step model-free pruning cut result mass early so summary compaction stays a late, rare event — the correct order under deep cache discounts, where compacting early costs more than the extra context. Opt-in wire collapses (superseded-duplicate tombstones, stale-reasoning windows) are monotonic by construction so collapsed text stays collapsed and the prefix restabilizes. OpenCode prunes tool output above 40k tokens keeping two tail turns and compacts on overflow with a hardcoded 4,096-token summary cap that independent analysis flags as the main bottleneck: entire histories must fit 4k summary tokens. Claude Code runs five graduated layers before every call (per-tool budgets, snip, microcompact, context collapse, auto-compact) with cache-aware compression — the deepest pipeline in the market — at the price of behavior that is hard to predict from any single config file. Cursor, Copilot, and Aider publish no comparable request-economy machinery; Aider's repo-map compression is the closest analogue. Fenice's distinctive position is measurability first: token-meter folds, per-turn usage with cache buckets, and a cache-efficiency projection make every optimization checkable in the gate rather than asserted in prose.

## 3. Context management depth

Claude Code leads on paper with five escalation layers and lazy loading (deferred tool schemas, summary-only subagent returns). Fenice answers with a smaller ordered stack — budgets, per-step pruning, late summary with an economy-tier summarizer pinned by route policy, plus session-query recall so agents interrogate past sessions instead of reloading context — and documents what it deliberately does not do (no early compaction, no model-facing pagination, no blind effort downgrades). OpenCode's checkpoint-and-retry compaction preserves durable history while projecting a summary boundary, with one-shot overflow recovery. Fenice's session-query tools (search, trace, event read with log-intact original recovery behind pruner replacements) are the cross-session memory story the others mostly lack: Claude Code has CLAUDE.md hierarchies plus auto-memory, OpenCode has session summaries, and everyone else starts effectively fresh each session. Fenice's compaction-pointer spill store plus bounded eviction covers the wire side of the same problem.

## 4. Session durability, replay, and auditability

Fenice persists append-only JSONL sessions with a versioned format and migration coverage, and replays 121 recorded scenarios keylessly through shipped profiles on every change; recorded model scripts make replay deterministic without API keys, and header pins plus sidecar ownership rules keep the corpus honest. ACP, SDK, headless, and Web lanes each replay their surface. OpenCode persists sessions in SQLite with summaries, cost tracking, revert support, and share links. Claude Code uses append-oriented JSONL transcripts with sidechain files per subagent. Nobody else in the comparison gates product changes on full-session replay the way Fenice does: the corpus is the reason large request-shape changes (tool removals, schema trims, composition moves) land without silent behavior drift.

## 5. Determinism and testability

Fenice holds per-file 100% coverage on package sources, a documentation-sync gate (generated catalogs freshness-checked, markdown links/wrap/budgets enforced, doc graphs regenerated), a duplication gate, package-dependency verification, and frozen archived decision records. OpenCode carries a real test suite around compaction and sessions but no published per-file coverage gate. The Claude Code paper itself observes that only about 1.6% of such a codebase is decision logic and the rest is harness — Fenice's wager is that the harness deserves harness-grade verification, and its gates are the concrete form of that wager.

## 6. Tooling safety and sandboxing

Fenice confines subprocess execution to a file-effect policy (read-only, workspace-write, danger-full-access) with per-platform backends, user-approved one-time escalation, approval policies, permission presets with risk acknowledgement, and a real-time sanitizer that strips proxy-injected telemetry without touching legitimate content or rewriting tool arguments. Claude Code fields seven permission modes plus an ML classifier with deny-first evaluation and a shell sandbox independent of permissions. OpenCode has ordered allow/ask/deny permission rulesets with wildcards, workspace-scoped approvals, and plan mode. Cursor, Copilot, and Windsurf rely on editor-mediated approvals; Aider leans on git (everything is reviewable and revertible). Fenice's confinement model is closest to Claude Code's layered posture, minus the ML classifier.

## 7. Subagents and orchestration

Fenice runs spawn/fork/in-process subagent backends with continuable background execution, model selection per delegation, isolated realms per preset, depth limits, and workflow scripts that fan work out across subagents as code rather than turn-by-turn delegation. Claude Code returns summaries only (!7x token multiplier for full-history teams in plan mode, per the architecture study) with fork inheritance as the escape hatch. OpenCode runs foreground/background child sessions with per-agent permission scoping. Fenice's workflow-as-code plus tier routing (fast/standard/reasoning tiers by complexity heuristics) is its distinctive orchestration bet: code coordinates, models execute.

## 8. Extensibility

Fenice composes everything as Cordis plugins (services, tools, slots, projections) with bundles, per-session presets, and a documented capability-seam discipline; there is no MCP server yet (flagged, unwired). Claude Code ships four mechanisms at different context costs (MCP, plugins, skills, hooks over 27 event types) plus subagents. OpenCode has skills, MCP, plugins, and lifecycle hooks with context-cost ordering. Cursor and Copilot lean on MCP plus editor extensions. Aider has no MCP client. Fenice's extension story is the most structured and the least connected: the contribution model is rigorous, but MCP interop is the missing bridge and should be weighted heavily in any adoption decision today.

## 9. Cost control and measurability

Fenice meters every request (token-meter with route pricing, per-turn usage including cache buckets and reasoning split, external JSONL telemetry, benchmark harness with deterministic quality checks) and exposes cache hit rates per session. OpenCode tracks per-session cost and tokens with Helicone session plugins available. Aider and Continue are cost-transparent by construction (pay-per-token, no tool fee). Copilot is flat-rate predictable. Cursor and Claude Code mix subscriptions with usage exposure. Fenice is the only one that turns efficiency into a merge gate input rather than a dashboard output.

## 10. Self-hosting, privacy, and internationalization

Fenice is fully self-hostable with local profiles, environment-resolved credentials (never committed), anonymous telemetry defaults, and seven runtime locales with English-only contributor docs. Aider and Continue lead on local models and air-gapped operation. OpenCode supports local models via its provider layer. Claude Code, Cursor, Copilot, and Windsurf are cloud-mediated by design. Fenice's anonymous-by-default posture plus bring-your-own-key routing is the pragmatic middle: no vendor account required, no data plane beyond the chosen provider.

## 11. Where Fenice loses today

Inline completions (Cursor, Copilot) do not exist in Fenice: it is an agent harness, not an editor. IDE presence is a Web GUI plus CLI, not native extensions. The MCP gap (no server, client-side story thinner than OpenCode/Claude Code/Cursor) is the largest functional deficit. Cloud background agents and managed parallelism (Cursor Cloud, Claude Code teams features) have no counterpart. Single-vendor depth (Claude Code on Anthropic rails) beats Fenice's neutrality on any Anthropic-only workload. Ecosystem size (skills, plugins, community prompts) favors the incumbents by an order of magnitude. Fork maintenance against upstream deepseek-harness is a real recurring cost, bounded by the documented sync procedure. Anyone choosing today should weight the MCP gap and the ecosystem gap above everything else.

## 12. Verdict

Best harness is workload-dependent and any honest comparison says so. For editor-inline work, Cursor or Copilot. For Anthropic-only autonomous coding with the deepest safety tuning, Claude Code. For air-gapped or key-sovereign operation, Aider or Continue. For provider-neutral autonomous agents where every token is measured, every behavior change replays 121 sessions before merge, and the request economy is a tested property rather than a pricing page, Fenice is the strongest option in this comparison — provided the adopter accepts the MCP and ecosystem gaps as the price. The gap-closing order that matters is MCP interop first, semantic memory second, managed parallelism third; everything else in this tree is already load-bearing.

## Sources (checked September 2026)

- OpenCode V2 compaction: https://opencode.ai/v2/docs/compaction
- OpenCode V2 compaction internals: https://jczhu.com/blog/opencode-v2-compaction-internals/
- OpenCode providers: https://dev.opencode.ai/docs/providers/
- OpenCode agents: https://opencode.ai/v2/docs/agents and https://opencode.ai/docs/agents/
- OpenCode session and agent system: https://deepwiki.com/anomalyco/opencode/2.3-session-and-agent-system
- OpenCode context management: https://deepwiki.com/sst/opencode/2.4-context-management-and-compaction
- OpenCode session compaction source: https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/session/compaction.ts
- Claude Code design space (Liu et al., April 2026): https://arxiv.org/html/2604.14228v1 and https://arxiv.org/html/2604.14228v2
- Claude Code architecture explainer: https://anthonywest.co.uk/explainers/folders/ai-architecture/2026-05-17_liu_claude-code-architecture_explainer
- Claude Code subagents: https://code.claude.com/docs/en/subagents
- Agent capability matrix (April 2026): https://www.iamraghuveer.com/posts/agent-capability-comparison-matrix/
- Coding agent comparison (April 2026): https://brainfile.io/ai-coding-agent-comparison
- Cursor/Copilot/Aider comparison (July 2026): https://learn.ryzlabs.com/ai-coding-assistants/cursor-vs-github-copilot-vs-aider-feature-comparison-for-2026
- Market tables (DataField, 2026): https://datafield.dev/vibe-coding/appendices/b-ai-tool-comparison-tables.html
- Anthropic prompt caching: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- Anthropic context editing: https://platform.claude.com/docs/en/build-with-claude/context-editing
- OpenAI prompt caching: https://developers.openai.com/api/docs/guides/prompt-caching
- Gemini context caching: https://ai.google.dev/gemini-api/docs/generate-content/caching
- DeepSeek pricing and caching: https://api-docs.deepseek.com/quick_start/pricing/ and https://api-docs.deepseek.com/guides/kv_cache/
