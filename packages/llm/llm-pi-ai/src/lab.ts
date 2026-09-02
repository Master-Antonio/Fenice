/**
 * Agent-Lab experimental switches: one durable settings namespace holding the
 * on/off flag for every agent-experiment proposal, plus the resolver the
 * adapter consults per request. Flags whose implementation has not landed yet
 * stay defined here so the surface (and the benchmark's phase matrix) is
 * stable; flipping them is inert until wired, and their description says so.
 *
 * @module dsh-llm-pi-ai/lab
 */

import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by the Agent-Lab experiments. */
export const AGENT_LAB_NAMESPACE = 'agent-lab'

/** Every experiment switch, resolved to a concrete boolean. */
export interface AgentLabFlags {
  /**
   * Skip a failing route entirely once it trips the failure window, going
   * straight to its configured fallback instead of paying a doomed attempt
   * every request.
   */
  circuitBreaker: boolean
  /** Append one JSONL event per cascade hop to the external Agent-Lab dir. */
  cascadeMetrics: boolean
  /** Append one JSONL event per finished turn (usage, latency, finish kind). */
  turnTelemetry: boolean
  /** Keep the request prefix byte-stable across turns (cache-hit friendly). */
  promptCacheStablePrefix: boolean
  /** Compaction markers carry a retrieval pointer into the spill store. */
  compactionPointer: boolean
  /** Route tasks to model tiers by difficulty heuristics and budget caps. */
  tierRouter: boolean
  /** Expose true mid-session truncation (rewind/delete in place). */
  sessionTruncate: boolean
  /** Serve DSH sessions/tools over the MCP standard transport. */
  mcpServer: boolean
  /** Semantic retrieval over past sessions via pluggable embeddings. */
  semanticMemory: boolean
  /** Bounded reproduce→fix→retest loop on failing tasks. */
  selfHealingLoop: boolean
}

/** The flags whose implementation ships with this build; others stay inert. */
export const IMPLEMENTED_FLAGS = [
  'circuitBreaker',
  'cascadeMetrics',
  'turnTelemetry',
  'promptCacheStablePrefix',
  'compactionPointer',
  'tierRouter',
  'selfHealingLoop',
] as const

const DESCRIPTIONS: Record<keyof AgentLabFlags, string> = {
  circuitBreaker: 'Skip a failing provider route straight to its fallback after repeated quick failures.',
  cascadeMetrics: 'Record every fallback cascade hop to the external Agent-Lab telemetry file.',
  turnTelemetry: 'Record per-turn token usage, latency, and outcome to the external Agent-Lab telemetry file.',
  promptCacheStablePrefix: 'Keep the request prefix byte-stable to maximize provider cache hits.',
  compactionPointer: 'Truncated tool outputs link to their full copy in the spill store.',
  tierRouter: 'Route tasks to model tiers by difficulty heuristics and budget caps.',
  sessionTruncate: '(coming soon) True in-place truncation powering rewind/delete without forking.',
  mcpServer: '(coming soon) Expose DSH sessions and tools over the MCP standard.',
  semanticMemory: '(coming soon) Meaning-based search over past sessions via pluggable embeddings.',
  selfHealingLoop: 'Bounded reproduce-fix-retest loop on failing work items.',
}

/** Runtime schema for the Agent-Lab section; every flag defaults to OFF except the meters. */
export const AgentLabSchema: z<AgentLabFlags> = z.object({
  circuitBreaker: z.boolean().default(false),
  cascadeMetrics: z.boolean().default(true),
  turnTelemetry: z.boolean().default(true),
  promptCacheStablePrefix: z.boolean().default(false),
  compactionPointer: z.boolean().default(false),
  tierRouter: z.boolean().default(false),
  sessionTruncate: z.boolean().default(false),
  mcpServer: z.boolean().default(false),
  semanticMemory: z.boolean().default(false),
  selfHealingLoop: z.boolean().default(false),
})

/** Fill an absent or partial section with the schema defaults. */
export function resolveLabFlags(source?: Partial<AgentLabFlags>): AgentLabFlags {
  const merged = { ...source }
  for (const key of Object.keys(DESCRIPTIONS) as (keyof AgentLabFlags)[]) {
    if (typeof merged[key] !== 'boolean') {
      // The two meters default ON: they ARE the measurement layer the whole
      // lab reads; experiments themselves default OFF (pure baseline first).
      merged[key] = key === 'cascadeMetrics' || key === 'turnTelemetry'
    }
  }
  return merged as AgentLabFlags
}
