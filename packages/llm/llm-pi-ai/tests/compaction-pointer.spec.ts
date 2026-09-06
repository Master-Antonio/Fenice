import { describe, expect, it, beforeEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  AttachmentStore,
  ImageAttachmentRef,
  RequestImageAttachment,
} from '@deepseek-ai/dsh-attachment'
import {
  createMessage,
  createUserMessage,
  ToolCallId,
  type GenerateOptions,
} from '@deepseek-ai/dsh-llm'
import {
  compactMessageText,
  compactToolResultText,
  toPiContext,
  type PiImageRequestContext,
} from '../src/context.ts'
import {
  CompactionSpillStore,
  defaultCompactionSpillStore,
  extractCompactionPointer,
  generateCompactionPointerId,
} from '../src/spill.ts'
import { PiAiAdapter } from '../src/adapter.ts'
import { resolveProfiles } from '../src/config.ts'
import { resolveLabFlags } from '../src/lab.ts'
import { memoryAuth } from './auth-double.ts'

function projectionStore(): AttachmentStore {
  return {
    readImageRequest: (value: ImageAttachmentRef) => Promise.resolve({
      variantId: value.attachmentId,
      attachment: value,
      data: Uint8Array.of(1, 2, 3),
      mediaType: value.mediaType,
      bytes: 3,
      width: 100,
      height: 100,
      depth: 'uchar',
      space: 'srgb',
      hasAlpha: false,
    } as unknown as RequestImageAttachment),
    imageHostPath: () => undefined,
  } as unknown as AttachmentStore
}

describe('compactionPointer unit tests', () => {
  beforeEach(() => {
    defaultCompactionSpillStore.clear()
  })

  describe('generateCompactionPointerId and extractCompactionPointer', () => {
    it('generates deterministic SHA256-based pointer IDs with cp_ prefix', () => {
      const id1 = generateCompactionPointerId('test content 123')
      const id2 = generateCompactionPointerId('test content 123')
      const id3 = generateCompactionPointerId('different content')

      expect(id1).toBe(id2)
      expect(id1).toMatch(/^cp_[a-f0-9]{16}$/)
      expect(id3).not.toBe(id1)
    })

    it('extracts compaction pointer ID from truncated text marker', () => {
      const textWithTag = 'Head content\n\n[... Tool output truncated: 500 characters compacted for context efficiency [compaction_pointer: cp_1234567890abcdef] ...]\n\nTail content'
      expect(extractCompactionPointer(textWithTag)).toBe('cp_1234567890abcdef')
    })

    it('returns undefined when no compaction pointer is in the text', () => {
      const textWithoutTag = 'Head content\n\n[... Tool output truncated: 500 characters compacted for context efficiency ...]\n\nTail content'
      expect(extractCompactionPointer(textWithoutTag)).toBeUndefined()
      expect(extractCompactionPointer('plain text')).toBeUndefined()
    })
  })

  describe('CompactionSpillStore', () => {
    it('stores and retrieves content in memory correctly', () => {
      const store = new CompactionSpillStore({ spillDir: null })
      const content = 'Line 1: important output\nLine 2: error log\nLine 3: details'
      const id = store.store(content)

      expect(store.has(id)).toBe(true)
      expect(store.get(id)).toBe(content)
      expect(store.size).toBe(1)
      expect([...store.keys()]).toEqual([id])
      expect([...store.values()]).toEqual([content])

      expect(store.delete(id)).toBe(true)
      expect(store.has(id)).toBe(false)
      expect(store.get(id)).toBeUndefined()
      expect(store.size).toBe(0)
    })

    it('persists and restores from local disk spill directory', () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'dsh-compaction-test-'))
      try {
        const store = new CompactionSpillStore({ spillDir: tempDir })
        const content = 'Detailed stack trace:\n  at Object.run (/app/src/index.ts:42)'
        const id = store.store(content)

        expect(existsSync(join(tempDir, `${id}.txt`))).toBe(true)

        // Create fresh store pointing at same directory
        const freshStore = new CompactionSpillStore({ spillDir: tempDir })
        expect(freshStore.get(id)).toBe(content)
        expect(freshStore.has(id)).toBe(true)
      } finally {
        rmSync(tempDir, { recursive: true, force: true })
      }
    })
  })

  it('evicts the oldest entries beyond maxEntries and removes their spill files', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'dsh-compaction-test-'))
    try {
      const store = new CompactionSpillStore({ spillDir: tempDir, maxEntries: 2 })
      store.store('aaa', 'cp_aaaaaaaaaaaaaaaa')
      store.store('bbb', 'cp_bbbbbbbbbbbbbbbb')
      store.store('ccc', 'cp_cccccccccccccccc')
      expect(store.size).toBe(2)
      expect(store.has('cp_aaaaaaaaaaaaaaaa')).toBe(false)
      expect(existsSync(join(tempDir, 'cp_aaaaaaaaaaaaaaaa.txt'))).toBe(false)
      expect(store.get('cp_bbbbbbbbbbbbbbbb')).toBe('bbb')
      expect(store.get('cp_cccccccccccccccc')).toBe('ccc')
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('rejects a non-positive maxEntries', () => {
    expect(() => new CompactionSpillStore({ spillDir: null, maxEntries: 0 }))
      .toThrow(/maxEntries.*must be a positive integer/)
  })

  describe('compactToolResultText with compactionPointer', () => {
    const rawOversized = 'HEAD_DATA_' + 'middle_padding_'.repeat(200) + '_TAIL_DATA'

    it('returns content untouched when below maxChars budget', () => {
      const shortText = 'Small output'
      const store = new CompactionSpillStore({ spillDir: null })
      const result = compactToolResultText(shortText, {
        maxChars: 1000,
        compactionPointer: true,
        spillStore: store,
      })
      expect(result).toBe(shortText)
      expect(store.size).toBe(0)
    })

    it('compacts without pointer tag when compactionPointer is false', () => {
      const store = new CompactionSpillStore({ spillDir: null })
      const result = compactToolResultText(rawOversized, {
        maxChars: 50,
        compactionPointer: false,
        spillStore: store,
      })
      expect(result).toContain('Tool output truncated:')
      expect(result).not.toContain('compaction_pointer:')
      expect(extractCompactionPointer(result)).toBeUndefined()
      expect(store.size).toBe(0)
    })

    it('compacts with formal pointer tag and stores full text when compactionPointer is true', () => {
      const store = new CompactionSpillStore({ spillDir: null })
      const result = compactToolResultText(rawOversized, {
        maxChars: 50,
        compactionPointer: true,
        spillStore: store,
      })

      const pointerId = extractCompactionPointer(result)
      expect(pointerId).toBeDefined()
      expect(pointerId).toMatch(/^cp_[a-f0-9]{16}$/)
      expect(result).toContain(`[compaction_pointer: ${pointerId}]`)

      // Verify full uncompacted retrieval
      const retrieved = store.get(pointerId!)
      expect(retrieved).toBe(rawOversized)
    })

    it('supports compactMessageText helper with same semantics', () => {
      const store = new CompactionSpillStore({ spillDir: null })
      const result = compactMessageText(rawOversized, {
        maxChars: 50,
        compactionPointer: true,
        spillStore: store,
      })
      const pointerId = extractCompactionPointer(result)
      expect(pointerId).toBeDefined()
      expect(store.get(pointerId!)).toBe(rawOversized)
    })

    it('supports custom explicit pointer ID', () => {
      const store = new CompactionSpillStore({ spillDir: null })
      const result = compactToolResultText(rawOversized, {
        maxChars: 50,
        compactionPointer: true,
        spillStore: store,
        pointerId: 'cp_custom_id_123',
      })
      expect(extractCompactionPointer(result)).toBe('cp_custom_id_123')
      expect(store.get('cp_custom_id_123')).toBe(rawOversized)
    })
  })

  describe('toPiContext with compactionPointer', () => {
    const callId = ToolCallId('call-tool-1')
    const largeOutput = 'RESULT_START_' + 'payload_data_block_'.repeat(100) + '_RESULT_END'

    const createRequest = (content: string): GenerateOptions => ({
      provider: 'mock',
      model: 'm1',
      system: 'System prompt',
      messages: [
        createMessage({
          role: 'assistant',
          content: [{ type: 'tool-call', id: callId, name: 'search_db', arguments: '{}' }],
          source: { kind: 'plugin', plugin: 'test' },
        }),
        createUserMessage({
          content: [{ type: 'tool-result', toolCallId: callId, content: [{ type: 'text', text: content }] }],
          source: { kind: 'plugin', plugin: 'test' },
        }),
      ],
    })

    it('compacts text-only tool results with pointer tags and saves to spillStore', () => {
      const store = new CompactionSpillStore({ spillDir: null })
      const context = toPiContext(
        createRequest(largeOutput),
        undefined,
        undefined,
        60, // maxToolResultChars
        {
          compactionPointer: true,
          spillStore: store,
        },
      )

      const toolResult = context.messages.find(m => m.role === 'toolResult')
      expect(toolResult).toBeDefined()
      const text = (toolResult?.content as Array<{ type: string; text: string }>)[0]?.text ?? ''

      const pointerId = extractCompactionPointer(text)
      expect(pointerId).toBeDefined()
      expect(store.get(pointerId!)).toBe(largeOutput)
    })

    it('compacts tool results with images with pointer tags and saves to spillStore', async () => {
      const store = new CompactionSpillStore({ spillDir: null })
      const imgContext: PiImageRequestContext = {
        attachments: projectionStore(),
        resolveImageAccess: () => undefined,
        maxToolResultChars: 60,
        compactionPointer: true,
        spillStore: store,
      }

      const context = await toPiContext(createRequest(largeOutput), imgContext)
      const toolResult = context.messages.find(m => m.role === 'toolResult')
      expect(toolResult).toBeDefined()
      const text = (toolResult?.content as Array<{ type: string; text: string }>)[0]?.text ?? ''

      const pointerId = extractCompactionPointer(text)
      expect(pointerId).toBeDefined()
      expect(store.get(pointerId!)).toBe(largeOutput)
    })
  })

  describe('PiAiAdapter with compactionPointer', () => {
    it('uses the adapter spillStore when compactionPointer is true', () => {
      const customStore = new CompactionSpillStore({ spillDir: null })
      const adapter = new PiAiAdapter({
        profiles: () => resolveProfiles({
          'test-prov': {
            api: 'openai-completions',
            baseURL: 'http://127.0.0.1:9999/v1',
            displayName: 'Test Provider',
            models: [{ id: 'test-model' }],
            maxToolResultChars: 50,
          },
        }),
        resolveApiKey: () => Promise.resolve('key'),
        auth: memoryAuth(),
        spillStore: customStore,
        labFlags: () => resolveLabFlags({
          compactionPointer: true,
        }),
      })

      expect(adapter.spillStore).toBe(customStore)
    })
  })
})
