/** Pure archive-format and immutable-manifest helpers. */

import { createHash } from 'node:crypto'
import { AGENT_NOTE_CLASSES } from './agent-note-tree.ts'

/** Versioned fields in the frozen-content manifest. */
export interface ArchiveManifest {
  version: 1
  files: Readonly<Record<string, string>>
}

/** Hash one archived artifact independently of the repository's Git object format. */
function archiveContentHash(content: Buffer): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Parse the archive manifest and reject fields or hashes outside its closed schema. */
export function parseArchiveManifest(content: string): ArchiveManifest {
  const value: unknown = JSON.parse(content)
  if (!isRecord(value)) throw new Error('expected a JSON object')
  const fields = Object.keys(value).sort()
  if (fields.join(',') !== 'files,version') throw new Error('expected exactly the fields `version` and `files`')
  if (value.version !== 1) throw new Error('unsupported manifest version (expected 1)')
  if (!isRecord(value.files)) throw new Error('`files` must be an object')
  const files: Record<string, string> = {}
  for (const [path, hash] of Object.entries(value.files)) {
    if (typeof hash !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(hash)) {
      throw new Error(`invalid content hash for ${path}`)
    }
    files[path] = hash
  }
  return { version: 1, files }
}

/** Render the archive manifest with deterministic path ordering. */
export function renderArchiveManifest(files: Readonly<Record<string, string>>): string {
  return `${JSON.stringify({
    version: 1,
    files: Object.fromEntries(Object.entries(files).sort(([left], [right]) => left.localeCompare(right))),
  }, null, 2)}\n`
}

/**
 * Retired bilingual sidecar suffixes. The archive is English-only: sidecars can
 * never be re-added ({@link validateArchiveArtifacts} rejects them), so their
 * seals are dropped instead of being treated as tampering.
 */
const RETIRED_SIDECAR_SUFFIXES = ['.zh.md', '.i18n.yaml'] as const

function isRetiredSidecar(path: string): boolean {
  return (RETIRED_SIDECAR_SUFFIXES as readonly string[]).some(suffix => path.endsWith(suffix))
}

/** Reject sealed-hash changes or removals; `allowed` names pre-authorized re-seals. */
export function validateArchiveManifestExtension(
  baseline: ArchiveManifest,
  current: ArchiveManifest,
  allowed: ReadonlySet<string> = new Set(),
): string[] {
  const errors: string[] = []
  for (const [path, expected] of Object.entries(baseline.files)) {
    if (isRetiredSidecar(path) || allowed.has(path)) continue
    const actual = current.files[path]
    if (actual === undefined) errors.push(`${path}: sealed manifest entry is missing`)
    else if (actual !== expected) errors.push(`${path}: sealed manifest hash changed`)
  }
  return errors
}

/** The retired bilingual language-switcher line (`English | [中文](...)`). */
const SWITCHER_LINE = /^English \| \[中文\]\(\S+\.zh\.md\)$/

/**
 * The English-only retirement of a frozen note: its previous content minus the
 * language-switcher line and the blank line that followed it. Compare a note's
 * current content against this rendering to prove a hash change is exactly the
 * repository-wide switcher removal and nothing else.
 */
export function switcherRetiredContent(baselineContent: string): string {
  const lines = baselineContent.split('\n')
  const kept: string[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    if (!SWITCHER_LINE.test(line)) {
      kept.push(line)
      continue
    }
    if (lines[index + 1] === '') index += 1
  }
  return kept.join('\n')
}

/**
 * Authorize baseline hash changes whose current content is exactly the
 * switcher-line retirement; every other hash change is an error. The frozen
 * archive stays immutable after the English-only transition because the
 * exception requires a baseline switcher line, which retired notes no longer
 * carry. Return the allowed paths for {@link validateArchiveManifestExtension}.
 */
export function reconcileSwitcherRetirement(
  baseline: ArchiveManifest,
  current: ArchiveManifest,
  artifacts: ReadonlyMap<string, Buffer>,
  baselineContent: (path: string) => string | undefined,
): { allowed: ReadonlySet<string>; errors: string[] } {
  const allowed = new Set<string>()
  const errors: string[] = []
  for (const [path, expected] of Object.entries(baseline.files)) {
    if (isRetiredSidecar(path)) continue
    if (current.files[path] === expected) continue
    const content = artifacts.get(path)
    const original = baselineContent(path)
    if (content === undefined || original === undefined) {
      errors.push(`${path}: sealed manifest hash changed`)
      continue
    }
    if (switcherRetiredContent(original) === content.toString('utf8')) {
      allowed.add(path)
    } else {
      errors.push(`${path}: sealed manifest hash changed (only the English-only switcher-line retirement may re-seal)`)
    }
  }
  return { allowed, errors }
}

function validDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match === null) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function validateHeader(path: string, content: Buffer): string[] {
  const errors: string[] = []
  const lines = content.toString('utf8').split('\n')
  if (!/^# Agent Note: \S/.test(lines[0] ?? '')) errors.push(`${path}: line 1 must be \`# Agent Note: <title>\``)
  if (lines[1] !== '') errors.push(`${path}: line 2 must be blank`)
  if (lines[2] !== 'Status: implemented') errors.push(`${path}: line 3 must be \`Status: implemented\``)
  const archived = /^Archived: (\d{4}-\d{2}-\d{2})$/.exec(lines[3] ?? '')?.[1]
  if (archived === undefined || !validDate(archived)) {
    errors.push(`${path}: line 4 must be \`Archived: YYYY-MM-DD\` with a valid date`)
  }
  if (lines[4] !== '') errors.push(`${path}: line 5 must be blank`)
  return errors
}

/** Validate the closed kind tree, implemented/archive headers, and `.md`-only archive layout. */
export function validateArchiveArtifacts(artifacts: ReadonlyMap<string, Buffer>): string[] {
  const errors: string[] = []
  const notes = new Set<string>()
  for (const path of [...artifacts.keys()].sort()) {
    if (/\.zh\.md$|\.i18n\.yaml$/.test(path)) {
      errors.push(`${path}: archived notes are English-only; remove the bilingual sidecar`)
      continue
    }
    const match = /^([^/]+)\/(\d{4}-\d{2}-\d{2}-.+?)\.md$/.exec(path)
    if (match?.[1] === undefined || match[2] === undefined) {
      errors.push(`${path}: expected {kind}/yyyy-mm-dd-topic.md`)
      continue
    }
    if (!(AGENT_NOTE_CLASSES as readonly string[]).includes(match[1])) {
      errors.push(`${path}: unknown Agent Note kind ${JSON.stringify(match[1])}`)
      continue
    }
    const key = `${match[1]}/${match[2]}`
    if (notes.has(key)) errors.push(`${key}: duplicate archived note`)
    notes.add(key)
    errors.push(...validateHeader(path, artifacts.get(path) ?? Buffer.alloc(0)))
  }
  return errors
}

/**
 * Preserve every sealed path/hash, append hashes for newly archived artifacts,
 * and retire bilingual sidecar seals whose artifact no longer exists. With
 * `reSeal`, a note whose on-disk content changed is re-sealed instead of
 * erroring — write mode only; the frozen property stays protected by the
 * committed-baseline comparison in {@link validateArchiveManifestExtension}.
 */
export function extendArchiveManifest(
  existing: ArchiveManifest,
  artifacts: ReadonlyMap<string, Buffer>,
  options: { reSeal?: boolean } = {},
): { files: Record<string, string>; added: string[]; errors: string[] } {
  const errors: string[] = []
  const files: Record<string, string> = {}
  for (const [path, expected] of Object.entries(existing.files)) {
    if (isRetiredSidecar(path)) continue
    const content = artifacts.get(path)
    if (content === undefined) errors.push(`${path}: sealed artifact is missing`)
    else if (archiveContentHash(content) !== expected) {
      if (options.reSeal === true) files[path] = archiveContentHash(content)
      else errors.push(`${path}: sealed content hash changed`)
    } else files[path] = expected
  }
  const added: string[] = []
  for (const [path, content] of [...artifacts].sort(([left], [right]) => left.localeCompare(right))) {
    if (files[path] !== undefined) continue
    files[path] = archiveContentHash(content)
    added.push(path)
  }
  return { files, added, errors }
}
