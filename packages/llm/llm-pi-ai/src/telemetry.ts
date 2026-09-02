/**
 * External Agent-Lab telemetry: append-only JSONL written OUTSIDE the
 * repository (default `<home>/.dsh-agent-lab/telemetry/events.jsonl`,
 * overridable with `DSH_AGENT_LAB_DIR`) so evidence survives independently of
 * any project tree. Appends never throw into the caller — telemetry must not
 * be able to break a stream.
 *
 * @module dsh-llm-pi-ai/telemetry
 */

import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/** One recorded cascade hop. */
export interface FallbackEvent {
  feature: 'fallback'
  ts: string
  fromProvider: string
  toProvider: string
  model: string
  fallbackModel: string
  code: string
  message: string
  /** Wall-clock cost of the failed attempt before the hop, when known. */
  attemptMs?: number
}

/** One finished streaming turn on a single route. */
export interface TurnEvent {
  feature: 'turn'
  ts: string
  provider: string
  model: string
  finish: string
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  latencyMs: number
  /** Stability fingerprint of the cache-relevant request prefix (when built). */
  prefixHash?: string
  /** Task complexity tier resolved by tierRouter (when active). */
  tier?: string
  /** Numeric complexity score from 0 to 100 evaluated for this turn. */
  tierScore?: number
}

export type LabTelemetryEvent = FallbackEvent | TurnEvent

/** Resolve the external telemetry directory (env override wins). */
export function agentLabDir(): string {
  const fromEnv = process.env.DSH_AGENT_LAB_DIR
  if (fromEnv !== undefined && fromEnv.trim().length > 0) return resolve(fromEnv)
  return resolve(homedir(), '.dsh-agent-lab', 'telemetry')
}

/**
 * Append-only JSONL recorder for the external Agent-Lab directory.
 * The file is opened per append (low volume: one line per turn/hop), so the
 * recorder stays stateless and crash-safe without background flushers.
 */
export class LabTelemetryRecorder {
  private readonly file: string
  private dirReady = false

  constructor(dir: string = agentLabDir()) {
    this.file = join(dir, 'events.jsonl')
  }

  /** The JSONL path this recorder writes to. */
  get path(): string {
    return this.file
  }

  /**
   * Append one event as a single JSON line. Every failure mode — unwritable
   * directory, disk full, JSON edge case — is contained and reported through
   * the returned boolean instead of propagating into the LLM stream.
   * @param event - the fully formed telemetry event.
   * @returns true when the line landed on disk.
   */
  append(event: LabTelemetryEvent): boolean {
    try {
      if (!this.dirReady) {
        mkdirSync(resolve(this.file, '..'), { recursive: true })
        this.dirReady = true
      }
      appendFileSync(this.file, `${JSON.stringify(event)}\n`, 'utf8')
      return true
    } catch {
      // Telemetry losing a line is never worth breaking a stream over; the
      // next successful append recreates the directory if it vanished.
      this.dirReady = false
      return false
    }
  }
}
