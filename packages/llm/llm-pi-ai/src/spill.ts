/**
 * Spill store for compacted/truncated tool outputs and context messages.
 *
 * When Agent-Lab `compactionPointer` is active, oversized outputs that undergo
 * micro-compaction retain full retrieval pointers `[compaction_pointer: <id>]`.
 * The full original content is persisted to an in-memory map and optionally to
 * a local spill file on disk.
 *
 * @module dsh-llm-pi-ai/spill
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/** Regex for extracting formal compaction pointer tags from compacted text. */
export const COMPACTION_POINTER_REGEX = /\[compaction_pointer:\s*([a-zA-Z0-9_-]+)\]/

/**
 * Extract a compaction pointer ID from a truncated text block containing
 * `[compaction_pointer: <id>]`.
 *
 * @param text - the truncated text containing the marker.
 * @returns the pointer ID string, or undefined if no tag is found.
 */
export function extractCompactionPointer(text: string): string | undefined {
  const match = text.match(COMPACTION_POINTER_REGEX)
  return match?.[1]
}

/**
 * Generate a deterministic compaction pointer identifier from content.
 *
 * @param content - the text payload being stored.
 * @returns an identifier prefixed with `cp_` and a 16-hex hash slice.
 */
export function generateCompactionPointerId(content: string): string {
  const hash = createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 16)
  return `cp_${hash}`
}

/** Resolve the default spill directory for Agent-Lab. */
export function defaultAgentLabSpillDir(): string {
  const fromEnv = process.env.DSH_AGENT_LAB_DIR
  if (fromEnv !== undefined && fromEnv.trim().length > 0) {
    return resolve(fromEnv, 'spill')
  }
  return resolve(homedir(), '.dsh-agent-lab', 'spill')
}

export interface CompactionSpillStoreOptions {
  /**
   * Root directory on disk for spilled artifacts. If set to `null`, file
   * persistence is disabled (in-memory only). If omitted, defaults to the
   * agent lab spill directory.
   */
  spillDir?: string | null
}

/**
 * In-memory and optional disk spill store for compacted tool outputs.
 */
export class CompactionSpillStore {
  private readonly map = new Map<string, string>()
  private readonly spillDir: string | null
  private dirCreated = false

  constructor(options?: CompactionSpillStoreOptions) {
    if (options?.spillDir === null) {
      this.spillDir = null
    } else if (options?.spillDir !== undefined) {
      this.spillDir = resolve(options.spillDir)
    } else {
      this.spillDir = defaultAgentLabSpillDir()
    }
  }

  /**
   * Store full content and return the resulting pointer ID.
   *
   * @param content - the full uncompacted text.
   * @param explicitId - optional predefined pointer ID.
   * @returns the pointer ID.
   */
  store(content: string, explicitId?: string): string {
    const id = explicitId ?? generateCompactionPointerId(content)
    this.map.set(id, content)

    if (this.spillDir !== null) {
      try {
        if (!this.dirCreated) {
          mkdirSync(this.spillDir, { recursive: true })
          this.dirCreated = true
        }
        const filePath = join(this.spillDir, `${id}.txt`)
        writeFileSync(filePath, content, 'utf8')
      } catch {
        // Disk write failures are non-fatal: in-memory map keeps the content.
        this.dirCreated = false
      }
    }

    return id
  }

  /**
   * Retrieve stored content by pointer ID.
   *
   * @param id - the pointer ID.
   * @returns the stored full content, or undefined if not found.
   */
  get(id: string): string | undefined {
    const fromMap = this.map.get(id)
    if (fromMap !== undefined) return fromMap

    if (this.spillDir !== null) {
      try {
        const filePath = join(this.spillDir, `${id}.txt`)
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, 'utf8')
          this.map.set(id, content)
          return content
        }
      } catch {
        // Graceful containment on file read issues.
      }
    }

    return undefined
  }

  /** Check if a pointer ID is present in the store. */
  has(id: string): boolean {
    return this.get(id) !== undefined
  }

  /** Delete a pointer ID from the in-memory store. */
  delete(id: string): boolean {
    return this.map.delete(id)
  }

  /** Clear all stored items in memory. */
  clear(): void {
    this.map.clear()
  }

  /** Number of items in the in-memory map. */
  get size(): number {
    return this.map.size
  }

  /** Iterate over all entries currently held in memory. */
  entries(): IterableIterator<[string, string]> {
    return this.map.entries()
  }

  /** Iterate over all keys currently held in memory. */
  keys(): IterableIterator<string> {
    return this.map.keys()
  }

  /** Iterate over all values currently held in memory. */
  values(): IterableIterator<string> {
    return this.map.values()
  }
}

/** Default singleton compaction spill store. */
export const defaultCompactionSpillStore = new CompactionSpillStore()
