import { describe, expect, it } from 'vitest'
import {
  extendArchiveManifest,
  parseArchiveManifest,
  reconcileSwitcherRetirement,
  renderArchiveManifest,
  switcherRetiredContent,
  validateArchiveArtifacts,
  validateArchiveManifestExtension,
  type ArchiveManifest,
} from './archived-agent-notes.ts'
import { isArchivedAgentNotePath } from './repo-files.ts'

function fixture(): Map<string, Buffer> {
  const base = '2026-07-26-example'
  const source = Buffer.from('# Agent Note: Example\n\nStatus: implemented\nArchived: 2026-07-26\n\n## Problem\n\nExample.\n')
  return new Map([[`process/${base}.md`, source]])
}

describe('archived Agent Notes', () => {
  it('recognizes archived paths with POSIX and Windows separators', () => {
    expect(isArchivedAgentNotePath('.agents/notes/archived/process/example.md')).toBe(true)
    expect(isArchivedAgentNotePath('.agents\\notes\\archived\\process\\example.md')).toBe(true)
    expect(isArchivedAgentNotePath('.agents/notes/implemented/process/example.md')).toBe(false)
  })

  it('accepts one implemented note with valid archive metadata', () => {
    expect(validateArchiveArtifacts(fixture())).toEqual([])
  })

  it('rejects bilingual sidecars, stray files, and invalid archive headers', () => {
    const artifacts = fixture()
    artifacts.set('process/2026-07-26-example.zh.md', Buffer.from('stale sidecar'))
    artifacts.set('process/2026-07-26-example.i18n.yaml', Buffer.from('stale record'))
    artifacts.set('process/stray.md', Buffer.from('# Agent Note: Stray\n'))
    artifacts.set(
      'process/2026-07-26-example.md',
      Buffer.from('# Agent Note: Example\n\nStatus: proposed\nArchived: yesterday\n'),
    )
    const errors = validateArchiveArtifacts(artifacts)
    expect(errors.join('\n')).toMatch(/remove the bilingual sidecar/)
    expect(errors.join('\n')).toMatch(/expected \{kind\}\/yyyy-mm-dd-topic\.md/)
    expect(errors.join('\n')).toMatch(/line 3 must be `Status: implemented`/)
  })

  it('extends the manifest without permitting a sealed change or removal', () => {
    const artifacts = fixture()
    const empty: ArchiveManifest = { version: 1, files: {} }
    const first = extendArchiveManifest(empty, artifacts)
    expect(first.errors).toEqual([])
    expect(first.added).toHaveLength(1)

    const sealed: ArchiveManifest = { version: 1, files: first.files }
    const changed = new Map(artifacts)
    changed.set('process/2026-07-26-example.md', Buffer.from('changed'))
    expect(extendArchiveManifest(sealed, changed).errors).toEqual([
      'process/2026-07-26-example.md: sealed content hash changed',
    ])
    changed.delete('process/2026-07-26-example.md')
    expect(extendArchiveManifest(sealed, changed).errors).toContain(
      'process/2026-07-26-example.md: sealed artifact is missing',
    )
  })

  it('retires bilingual sidecar seals instead of failing on their removal', () => {
    const artifacts = fixture()
    const initial = extendArchiveManifest({ version: 1, files: {} }, artifacts)
    const sealed: ArchiveManifest = {
      version: 1,
      files: {
        ...initial.files,
        ['process/2026-07-26-example.zh.md']: `sha256:${'a'.repeat(64)}`,
        ['process/2026-07-26-example.i18n.yaml']: `sha256:${'b'.repeat(64)}`,
      },
    }

    const extended = extendArchiveManifest(sealed, artifacts)
    expect(extended.errors).toEqual([])
    expect(Object.keys(extended.files).sort()).toEqual(['process/2026-07-26-example.md'])

    const baseline: ArchiveManifest = { version: 1, files: sealed.files }
    expect(validateArchiveManifestExtension(baseline, { version: 1, files: extended.files })).toEqual([])
  })

  it('rejects replacing manifest seals alongside changed archive content', () => {
    const artifacts = fixture()
    const initial = extendArchiveManifest({ version: 1, files: {} }, artifacts)
    const baseline: ArchiveManifest = { version: 1, files: initial.files }
    const path = 'process/2026-07-26-example.md'
    const changedArtifacts = new Map(artifacts)
    changedArtifacts.set(path, Buffer.from('changed'))
    const replacement = extendArchiveManifest({ version: 1, files: {} }, changedArtifacts)
    const current: ArchiveManifest = { version: 1, files: replacement.files }

    expect(extendArchiveManifest(current, changedArtifacts).errors).toEqual([])
    expect(validateArchiveManifestExtension(baseline, current)).toEqual([
      `${path}: sealed manifest hash changed`,
    ])
    const removed: ArchiveManifest = {
      version: 1,
      files: Object.fromEntries(Object.entries(current.files).filter(([candidate]) => candidate !== path)),
    }
    expect(validateArchiveManifestExtension(baseline, removed)).toContain(
      `${path}: sealed manifest entry is missing`,
    )
  })

  it('authorizes only the switcher-line retirement as a content change', () => {
    const baselineContent = '# Agent Note: Example\n\nStatus: implemented\nArchived: 2026-07-26\n\nEnglish | [中文](2026-07-26-example.zh.md)\n\n## Problem\n\nExample.\n'
    const retired = switcherRetiredContent(baselineContent)
    expect(retired).toBe('# Agent Note: Example\n\nStatus: implemented\nArchived: 2026-07-26\n\n## Problem\n\nExample.\n')

    const baseline: ArchiveManifest = {
      version: 1,
      files: { 'process/2026-07-26-example.md': `sha256:${'a'.repeat(64)}` },
    }
    const resealed: ArchiveManifest = {
      version: 1,
      files: { 'process/2026-07-26-example.md': `sha256:${'b'.repeat(64)}` },
    }
    const artifacts = new Map([['process/2026-07-26-example.md', Buffer.from(retired)]])
    const reconciled = reconcileSwitcherRetirement(
      baseline,
      resealed,
      artifacts,
      () => baselineContent,
    )
    expect(reconciled.errors).toEqual([])
    expect(reconciled.allowed).toEqual(new Set(['process/2026-07-26-example.md']))
    expect(validateArchiveManifestExtension(baseline, resealed, reconciled.allowed)).toEqual([])

    const tampered = new Map([['process/2026-07-26-example.md', Buffer.from('rewritten body')]])
    expect(reconcileSwitcherRetirement(baseline, resealed, tampered, () => baselineContent).errors).toEqual([
      'process/2026-07-26-example.md: sealed manifest hash changed (only the English-only switcher-line retirement may re-seal)',
    ])
    expect(reconcileSwitcherRetirement(baseline, resealed, artifacts, () => undefined).errors).toEqual([
      'process/2026-07-26-example.md: sealed manifest hash changed',
    ])
  })

  it('round-trips the deterministic manifest schema', () => {
    const content = renderArchiveManifest({ 'process/z.md': `sha256:${'a'.repeat(64)}` })
    expect(parseArchiveManifest(content)).toEqual({
      version: 1,
      files: { 'process/z.md': `sha256:${'a'.repeat(64)}` },
    })
  })
})
