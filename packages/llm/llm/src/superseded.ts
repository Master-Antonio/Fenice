/**
 * Wire-level collapse of superseded duplicate tool results.
 *
 * When a session repeats an identical tool call (same tool, byte-equal
 * canonical arguments), only the newest result carries live information: the
 * older duplicates are stale by construction. Collapsing them to a
 * deterministic one-line marker saves their tokens on every wire request
 * without touching the durable log, which keeps every original intact for
 * replay and session-query recovery.
 *
 * The collapse is monotonic and therefore provider-cache stable: history only
 * grows, so a result collapsed once stays collapsed on every later turn, and
 * the marker names only the tool (never positions, turns, or ids that would
 * shift the prefix). Error results never collapse and never collapse others:
 * a failed attempt must not hide an older success the model may still need.
 *
 * @module @deepseek-ai/dsh-llm/superseded
 */

import { canonicalizeJsonValue } from '@deepseek-ai/dsh-util-values'
import type { ToolCallId } from './brand.ts'
import type { Message } from './types.ts'

/** One wire tool result with the call identity needed for duplicate detection. */
export interface SupersedeCandidate {
  /** Stable call identity; collapsed ids are returned, never mutated. */
  readonly toolCallId: ToolCallId
  /** Tool name; different tools never collapse together. */
  readonly toolName: string
  /** Raw JSON arguments string from the tool-call block. */
  readonly argumentsJson: string
  /** Error results are exempt in both directions. */
  readonly isError: boolean
}

/**
 * Collect supersede candidates from harness history: assistant tool calls
 * supply (name, arguments) identity, tool results supply error state, both
 * keyed by call id. Results whose call is unknown stay full.
 * @param messages - harness conversation in wire order.
 * @returns candidates in wire order.
 */
export function collectSupersedeCandidates(messages: readonly Message[]): SupersedeCandidate[] {
  const calls = new Map<ToolCallId, { toolName: string; argumentsJson: string }>()
  for (const message of messages) {
    if (message.role !== 'assistant') continue
    for (const block of message.content) {
      if (block.type !== 'tool-call') continue
      calls.set(block.id, { toolName: block.name, argumentsJson: block.arguments })
    }
  }
  const candidates: SupersedeCandidate[] = []
  for (const message of messages) {
    for (const block of message.content) {
      if (block.type !== 'tool-result') continue
      const call = calls.get(block.toolCallId)
      if (call === undefined) continue
      candidates.push({
        toolCallId: block.toolCallId,
        toolName: call.toolName,
        argumentsJson: call.argumentsJson,
        isError: block.isError ?? false,
      })
    }
  }
  return candidates
}

/**
 * Deterministic tombstone for a superseded duplicate result. Names only the
 * tool: positions and ids would shift the cached prefix every turn.
 * @param toolName - collapsed result's tool name.
 * @returns the stable marker text.
 */
export function supersededMarker(toolName: string): string {
  return `[superseded: a later identical ${toolName} call carries the current output]`
}

/**
 * Plan which results a wire assembly collapses, newest occurrence per
 * (tool, canonical-arguments) key staying full. Unparsable or
 * non-lossless-JSON arguments never collapse: an unreadable call cannot prove
 * duplication.
 * @param calls - results in wire order (oldest first).
 * @returns collapsed call ids to tool names for deterministic markers.
 */
export function planSupersededCollapse(
  calls: readonly SupersedeCandidate[],
): ReadonlyMap<ToolCallId, string> {
  const seen = new Set<string>()
  const collapse = new Map<ToolCallId, string>()
  // Newest first: the first occurrence per key stays full, older ones collapse.
  for (const candidate of [...calls].reverse()) {
    if (candidate.isError) continue
    const key = collapseKey(candidate.toolName, candidate.argumentsJson)
    if (key === undefined) continue
    if (seen.has(key)) {
      collapse.set(candidate.toolCallId, candidate.toolName)
    } else {
      seen.add(key)
    }
  }
  return collapse
}

/** Canonical duplicate key, or undefined when the arguments prove nothing. */
function collapseKey(toolName: string, argumentsJson: string): string | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(argumentsJson) as unknown
  } catch {
    // Malformed call arguments cannot prove duplication; leave them full.
    return undefined
  }
  const canonical = canonicalizeJsonValue(parsed)
  /* v8 ignore next -- JSON.parse yields only plain JSON, which always
     canonicalizes; the check guards future callers passing foreign values. */
  if (canonical === undefined) return undefined
  return `${toolName}\n${JSON.stringify(canonical)}`
}
