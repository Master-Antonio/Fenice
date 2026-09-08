import { describe, expect, it, vi } from 'vitest'
import { AttachmentId, ImageVariantId } from '@deepseek-ai/dsh-attachment'
import type {
  AttachmentStore,
  ImageAttachmentRef,
  ImageRequestPolicy,
  RequestImageAttachment,
} from '@deepseek-ai/dsh-attachment'
import { ToolCallId, createMessage, createUserMessage, offloadedImageText } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, Message } from '@deepseek-ai/dsh-llm'
import { prefixFingerprint, stableToolOrder, toPiContext, type PiImageRequestContext } from '../src/context.ts'
import { toPiAssistant } from '../src/replay.ts'

const ref: ImageAttachmentRef = {
  attachmentId: AttachmentId(`sha256:${'a'.repeat(64)}`),
  mediaType: 'image/png',
  bytes: 1,
  width: 1,
  height: 1,
}

function requestImage(value: ImageAttachmentRef, data: Uint8Array): RequestImageAttachment {
  return {
    variantId: ImageVariantId(`sha256:${'b'.repeat(64)}`),
    attachment: value,
    data,
    mediaType: value.mediaType,
    bytes: data.byteLength,
    width: value.width,
    height: value.height,
    depth: 'uchar',
    space: 'srgb',
    hasAlpha: value.mediaType === 'image/png',
  }
}

function projectionStore(
  readImageRequest: (
    value: ImageAttachmentRef,
    policy: ImageRequestPolicy,
    signal?: AbortSignal,
  ) => Promise<RequestImageAttachment> = vi.fn((value: ImageAttachmentRef) => (
    Promise.resolve(requestImage(value, Uint8Array.of(1)))
  )),
): AttachmentStore {
  return { readImageRequest, imageHostPath: () => undefined } as unknown as AttachmentStore
}

const attachments = projectionStore()

function imageContext(
  store: AttachmentStore,
  overrides: Partial<Omit<PiImageRequestContext, 'attachments'>> = {},
): PiImageRequestContext {
  return { attachments: store, resolveImageAccess: () => undefined, ...overrides }
}

function request(messages: GenerateOptions['messages']): GenerateOptions {
  return {
    provider: 'openai',
    model: 'gpt-4.1',
    system: 'system prompt',
    tools: [{ name: 'lookup', description: 'look up', parameters: { type: 'object' } }],
    messages,
  }
}

function user(content: ContentBlock[]): Message {
  return createUserMessage({ content, source: { kind: 'plugin', plugin: 'test' } })
}

function history(role: 'system' | 'assistant', content: ContentBlock[]): Message {
  return createMessage({ role, content, source: { kind: 'plugin', plugin: 'test' } })
}

describe('pi-ai request context conversion', () => {
  it('omits absent and empty request-level optional fields', () => {
    const base = { provider: 'openai', model: 'gpt-4.1', messages: [] }
    expect(toPiContext(base)).toEqual({ messages: [] })
    expect(toPiContext({ ...base, tools: [] })).toEqual({ messages: [] })
  })

  it('converts complete text-only history and rejects nested images without storage', () => {
    const callId = ToolCallId('call-1')
    expect(toPiContext(request([
      history('system', [{ type: 'text', text: 'history system' }]),
      history('assistant', [{ type: 'tool-call', id: callId, name: 'lookup', arguments: '{}' }]),
      user([
        { type: 'text', text: 'after tool' },
        {
          type: 'tool-result',
          toolCallId: callId,
          content: [{ type: 'text', text: '' }],
        },
      ]),
    ]))).toMatchObject({
      systemPrompt: 'system prompt',
      tools: [{ name: 'lookup' }],
      messages: [
        { role: 'user', content: 'history system' },
        { role: 'assistant' },
        { role: 'user', content: 'after tool' },
        {
          role: 'toolResult',
          toolCallId: 'call-1',
          toolName: 'lookup',
          content: [{ type: 'text', text: '(no output)' }],
          isError: false,
        },
      ],
    })

    expect(() => toPiContext(request([user([{
      type: 'tool-result',
      toolCallId: callId,
      content: [{ type: 'image', attachment: ref }],
    }])]))).toThrow(/durable attachment service/)
  })

  it('resolves user and tool-result images while preserving explicit fallbacks', async () => {
    const callId = ToolCallId('missing-call')
    const knownCallId = ToolCallId('known-call')
    const context = await toPiContext(request([
      user([{ type: 'text', text: '' }]),
      history('assistant', [
        { type: 'text', text: 'calling' },
        { type: 'tool-call', id: knownCallId, name: 'lookup', arguments: '{}' },
      ]),
      user([
        { type: 'image', attachment: ref },
        { type: 'text', text: 'caption' },
        { type: 'reasoning', text: 'ignored' },
      ]),
      user([{
        type: 'tool-result',
        toolCallId: knownCallId,
        content: [{ type: 'text', text: '' }],
      }]),
      user([{
        type: 'tool-result',
        toolCallId: callId,
        isError: true,
        content: [
          { type: 'tool-result', toolCallId: callId, content: [] },
          { type: 'image', attachment: ref },
        ],
      }]),
    ]), imageContext(attachments))

    expect(context.messages).toEqual([
      { role: 'user', content: '', timestamp: 0 },
      expect.objectContaining({ role: 'assistant' }),
      {
        role: 'user',
        content: [
          { type: 'text', text: expect.stringContaining(`Image ${ref.attachmentId}`) as string },
          { type: 'image', data: 'AQ==', mimeType: 'image/png' },
          { type: 'text', text: 'caption' },
        ],
        timestamp: 0,
      },
      {
        role: 'toolResult',
        toolCallId: 'known-call',
        toolName: 'lookup',
        content: [{ type: 'text', text: '(no output)' }],
        isError: false,
        timestamp: 0,
      },
      {
        role: 'toolResult',
        toolCallId: 'missing-call',
        toolName: 'unknown',
        content: [
          { type: 'text', text: expect.stringContaining(`Image ${ref.attachmentId}`) as string },
          { type: 'image', data: 'AQ==', mimeType: 'image/png' },
        ],
        isError: true,
        timestamp: 0,
      },
    ])
  })

  it('uses the shared normalized-path description for retained images', async () => {
    const named = { ...ref, name: 'chart.png', width: 2048, height: 1024 }
    const store = projectionStore(value => Promise.resolve({
      ...requestImage(value, Uint8Array.of(1)),
      width: 1130,
      height: 565,
    }))
    const context = await toPiContext(request([user([{ type: 'image', attachment: named }])]), imageContext(store, {
      resolveImageAccess: () => ({ readonlyPath: '/tmp/dsh/objects/aa/object' }),
    }))
    expect(context.messages[0]).toMatchObject({
      role: 'user',
      content: [
        { type: 'text', text: expect.stringContaining('Image "chart.png"') as string },
        { type: 'image' },
      ],
    })
    expect(JSON.stringify(context.messages[0])).toContain('/tmp/dsh/objects/aa/object')
    expect(JSON.stringify(context.messages[0])).toContain('request preview 1130x565px')
  })

  it('recursively converts nested tool-result text and images', async () => {
    const callId = ToolCallId('nested-call')
    const context = await toPiContext(request([user([{
      type: 'tool-result',
      toolCallId: callId,
      content: [
        {
          type: 'tool-result',
          toolCallId: callId,
          content: [{ type: 'text', text: 'nested text' }],
        },
        {
          type: 'tool-result',
          toolCallId: callId,
          content: [{ type: 'image', attachment: ref }],
        },
      ],
    }])]), imageContext(attachments))

    expect(context.messages).toEqual([{
      role: 'toolResult',
      toolCallId: 'nested-call',
      toolName: 'unknown',
      content: [
        { type: 'text', text: 'nested text' },
        { type: 'text', text: expect.stringContaining(`Image ${ref.attachmentId}`) as string },
        { type: 'image', data: 'AQ==', mimeType: 'image/png' },
      ],
      isError: false,
      timestamp: 0,
    }])
  })

  it('flattens nested text-only tool results and ignores other block types without storage', () => {
    const callId = ToolCallId('nested-text')
    expect(toPiContext(request([user([{
      type: 'tool-result',
      toolCallId: callId,
      content: [
        { type: 'chart', data: 'ignored' } as unknown as ContentBlock,
        {
          type: 'tool-result',
          toolCallId: callId,
          content: [{ type: 'text', text: 'nested' }],
        },
      ],
    }])]))).toMatchObject({
      messages: [{
        role: 'toolResult',
        content: [{ type: 'text', text: 'nested' }],
      }],
    })
  })

  it('replaces the oldest images with placeholders once the request payload bound is exceeded', async () => {
    const readImageRequest = vi.fn((value: ImageAttachmentRef) => (
      Promise.resolve(requestImage(value, Uint8Array.of(1, 2, 3)))
    ))
    const store = projectionStore(readImageRequest)
    const sized: ImageAttachmentRef = { ...ref, bytes: 3 }
    const callId = ToolCallId('shot-call')
    // Three 3-byte images cost 4 base64 characters each (12 total); a bound of
    // 8 forces exactly the oldest one out, including one nested in a tool result.
    const context = await toPiContext(request([
      user([{
        type: 'tool-result',
        toolCallId: callId,
        content: [{ type: 'image', attachment: sized }],
      }]),
      user([{ type: 'image', attachment: sized }, { type: 'text', text: 'newer' }]),
      user([{ type: 'image', attachment: sized }]),
    ]), imageContext(store, { maxRequestImageBytes: 8 }))

    expect(context.messages).toEqual([
      {
        role: 'toolResult',
        toolCallId: 'shot-call',
        toolName: 'unknown',
        content: [{ type: 'text', text: offloadedImageText(sized) }],
        isError: false,
        timestamp: 0,
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: expect.stringContaining(`Image ${sized.attachmentId}`) as string },
          { type: 'image', data: 'AQID', mimeType: 'image/png' },
          { type: 'text', text: 'newer' },
        ],
        timestamp: 0,
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: expect.stringContaining(`Image ${sized.attachmentId}`) as string },
          { type: 'image', data: 'AQID', mimeType: 'image/png' },
        ],
        timestamp: 0,
      },
    ])
    expect(readImageRequest).toHaveBeenCalledTimes(1)
  })

  it('does not prepare an old image removed by the conservative request projection', async () => {
    const old = { ...ref, attachmentId: AttachmentId(`sha256:${'c'.repeat(64)}`), bytes: 3 }
    const recent = { ...ref, attachmentId: AttachmentId(`sha256:${'d'.repeat(64)}`), bytes: 3 }
    const readImageRequest = vi.fn((value: ImageAttachmentRef) => {
      if (value.attachmentId === old.attachmentId) throw new Error('old image must not be read')
      return Promise.resolve(requestImage(value, Uint8Array.of(1, 2, 3)))
    })

    const context = await toPiContext(request([user([
      { type: 'image', attachment: old },
      { type: 'image', attachment: recent },
    ])]), imageContext(projectionStore(readImageRequest), { maxRequestImageBytes: 4 }))

    expect(context.messages[0]).toMatchObject({
      role: 'user',
      content: [
        { type: 'text', text: offloadedImageText(old) },
        { type: 'text', text: expect.stringContaining(String(recent.attachmentId)) as string },
        { type: 'image' },
      ],
    })
    expect(readImageRequest).toHaveBeenCalledTimes(1)
    expect(readImageRequest.mock.calls[0]?.[0]).toEqual(recent)
  })

  it('uses independently resolved access when exact encoded bytes require offload', async () => {
    const sized: ImageAttachmentRef = { ...ref, bytes: 3 }
    const access = { readonlyPath: '/tmp/dsh-normalized-image' }
    const readImageRequest = vi.fn((value: ImageAttachmentRef) => Promise.resolve({
      ...requestImage(value, Uint8Array.of(1, 2, 3, 4)),
    }))

    const context = await toPiContext(request([
      user([{ type: 'image', attachment: sized }]),
    ]), imageContext(projectionStore(readImageRequest), {
      maxRequestImageBytes: 4,
      resolveImageAccess: () => access,
    }))

    expect(context.messages).toEqual([{
      role: 'user',
      content: offloadedImageText(sized, access),
      timestamp: 0,
    }])
    expect(readImageRequest).toHaveBeenCalledTimes(1)
  })

  it('keeps every image at exactly the payload bound and drops all of them when even the newest cannot fit', async () => {
    const sized: ImageAttachmentRef = { ...ref, bytes: 3 }
    const exact = await toPiContext(request([
      user([{ type: 'image', attachment: sized }]),
      user([{ type: 'image', attachment: sized }]),
    ]), imageContext(attachments, { maxRequestImageBytes: 8 }))
    expect(exact.messages).toEqual([
      {
        role: 'user',
        content: [expect.objectContaining({ type: 'text' }), expect.objectContaining({ type: 'image' })],
        timestamp: 0,
      },
      {
        role: 'user',
        content: [expect.objectContaining({ type: 'text' }), expect.objectContaining({ type: 'image' })],
        timestamp: 0,
      },
    ])

    const readImageRequest = vi.fn((value: ImageAttachmentRef) => (
      Promise.resolve(requestImage(value, new Uint8Array(300)))
    ))
    const store = projectionStore(readImageRequest)
    const oversized = await toPiContext(request([
      user([{ type: 'image', attachment: { ...ref, bytes: 300 } }]),
    ]), imageContext(store, { maxRequestImageBytes: 8 }))
    // All-text content collapses to the string form; the placeholder still reaches the model.
    expect(oversized.messages).toEqual([
      { role: 'user', content: offloadedImageText({ ...ref, bytes: 300 }), timestamp: 0 },
    ])
    expect(readImageRequest).not.toHaveBeenCalled()
  })

  it('offloads repeated image-block occurrences by position rather than shared object identity', async () => {
    const sized: ImageAttachmentRef = { ...ref, bytes: 3 }
    const shared: ContentBlock = { type: 'image', attachment: sized }
    const readImageRequest = vi.fn((value: ImageAttachmentRef) => (
      Promise.resolve(requestImage(value, Uint8Array.of(1, 2, 3)))
    ))
    const store = projectionStore(readImageRequest)
    const aliased = await toPiContext(
      request([user([shared, shared])]),
      imageContext(store, { maxRequestImageBytes: 4 }),
    )
    const replayed = await toPiContext(request([user([
      { type: 'image', attachment: { ...sized } },
      { type: 'image', attachment: { ...sized } },
    ])]), imageContext(store, { maxRequestImageBytes: 4 }))

    const expected = [{
      role: 'user',
      content: [
        { type: 'text', text: offloadedImageText(sized) },
        { type: 'text', text: expect.stringContaining(`Image ${sized.attachmentId}`) as string },
        { type: 'image', data: 'AQID', mimeType: 'image/png' },
      ],
      timestamp: 0,
    }]
    expect(aliased.messages).toEqual(expected)
    expect(replayed.messages).toEqual(expected)
    expect(readImageRequest).toHaveBeenCalledTimes(2)
  })

  it('keeps empty text-only users while separating result-only messages', () => {
    const callId = ToolCallId('unknown-call')
    expect(toPiContext(request([
      user([]),
      history('assistant', [
        { type: 'text', text: 'answer' },
        { type: 'tool-call', id: ToolCallId('other-call'), name: 'lookup', arguments: '{}' },
      ]),
      user([{
        type: 'tool-result',
        toolCallId: callId,
        content: [{ type: 'text', text: 'result' }],
      }]),
    ]))).toMatchObject({
      messages: [
        { role: 'user', content: '' },
        { role: 'assistant' },
        { role: 'toolResult', toolName: 'unknown' },
      ],
    })
  })

  it('handles in-history system and assistant messages explicitly on the image path', async () => {
    for (const role of ['system', 'assistant'] as const) {
      const readImageRequest = vi.fn()
      const store = projectionStore(readImageRequest)
      await expect(toPiContext(request([
        history(role, [{ type: 'image', attachment: ref }]),
      ]), imageContext(store, { maxRequestImageBytes: 1 }))).rejects.toMatchObject({ code: 'UNSUPPORTED_CONTENT' })
      expect(readImageRequest).not.toHaveBeenCalled()
    }

    await expect(toPiContext(request([
      history('system', [{ type: 'text', text: 'history system' }]),
      history('assistant', [{ type: 'text', text: 'answer' }]),
      user([{ type: 'text', text: 'plain' }]),
    ]), imageContext(attachments))).resolves.toMatchObject({
      messages: [
        { role: 'user', content: 'history system' },
        { role: 'assistant' },
        { role: 'user', content: 'plain' },
      ],
    })

    expect(() => toPiAssistant(
      history('assistant', [{ type: 'image', attachment: ref }]),
    )).toThrow(/assistant image output/)
  })
})

describe('tool-result micro-compaction wiring', () => {
  // Above the 32,768 default: proves the unconfigured path still compacts.
  const oversized = 'x'.repeat(40_000)
  const withResult = (text: string): GenerateOptions['messages'] => {
    const callId = ToolCallId('call-c')
    return [
      history('assistant', [{ type: 'tool-call', id: callId, name: 'lookup', arguments: '{}' }]),
      user([{ type: 'tool-result', toolCallId: callId, content: [{ type: 'text', text }] }]),
    ]
  }
  const resultText = (context: unknown): string => {
    const { messages } = context as { messages: { role: string; content: { text: string }[] }[] }
    const result = messages.find(m => m.role === 'toolResult')
    return result?.content[0]?.text ?? ''
  }

  it('compacts at the DEFAULT budget without any configuration', () => {
    const text = resultText(toPiContext(request(withResult(oversized))))
    expect(text).toContain('Tool output truncated:')
    expect(text.length).toBeLessThan(oversized.length)
  })

  it('honors a configured maxToolResultChars on the synchronous path', () => {
    const text = resultText(toPiContext(request(withResult('y'.repeat(100))), undefined, undefined, 50))
    // head/tail = floor(50 * .45) = 22 each ⇒ 100 − 44 = 56 omitted.
    expect(text).toContain('Tool output truncated: 56 characters')
    expect(text.startsWith('yyyy')).toBe(true)
    expect(text.endsWith('yyy')).toBe(true)
  })

  it('leaves results under the configured budget byte-identical', () => {
    expect(resultText(toPiContext(request(withResult('z'.repeat(40))), undefined, undefined, 50)))
      .toBe('z'.repeat(40))
  })
})

describe('superseded duplicate collapse', () => {
  const dupHistory = (): GenerateOptions['messages'] => [
    history('assistant', [{ type: 'tool-call', id: ToolCallId('call-old'), name: 'lookup', arguments: '{"q":"a"}' }]),
    user([{ type: 'tool-result', toolCallId: ToolCallId('call-old'), content: [{ type: 'text', text: 'old output' }] }]),
    history('assistant', [{ type: 'tool-call', id: ToolCallId('call-new'), name: 'lookup', arguments: '{"q":"a"}' }]),
    user([{ type: 'tool-result', toolCallId: ToolCallId('call-new'), content: [{ type: 'text', text: 'new output' }] }]),
  ]
  const resultTexts = (context: unknown): string[] => {
    const { messages } = context as { messages: { role: string; content: { text: string }[] }[] }
    return messages.filter(m => m.role === 'toolResult').map(m => m.content[0]?.text ?? '')
  }
  const collapse = { collapseSupersededResults: true } as const

  it('keeps duplicates full unless collapse is enabled', () => {
    expect(resultTexts(toPiContext(request(dupHistory())))).toEqual(['old output', 'new output'])
  })

  it('collapses the older duplicate to a deterministic marker when enabled', () => {
    expect(resultTexts(toPiContext(request(dupHistory()), undefined, undefined, undefined, collapse)))
      .toEqual(['[superseded: a later identical lookup call carries the current output]', 'new output'])
  })

  it('keeps collapsed bytes stable as newer history grows', () => {
    const grown: GenerateOptions['messages'] = [
      ...dupHistory(),
      history('assistant', [{ type: 'tool-call', id: ToolCallId('call-other'), name: 'other', arguments: '{}' }]),
      user([{ type: 'tool-result', toolCallId: ToolCallId('call-other'), content: [{ type: 'text', text: 'other' }] }]),
    ]
    const before = resultTexts(toPiContext(request(dupHistory()), undefined, undefined, undefined, collapse))
    const after = resultTexts(toPiContext(request(grown), undefined, undefined, undefined, collapse))
    expect(after.slice(0, 2)).toEqual(before)
  })

  it('never collapses error results', () => {
    const historyWithError: GenerateOptions['messages'] = [
      history('assistant', [{ type: 'tool-call', id: ToolCallId('call-ok'), name: 'lookup', arguments: '{}' }]),
      user([{ type: 'tool-result', toolCallId: ToolCallId('call-ok'), content: [{ type: 'text', text: 'ok' }] }]),
      history('assistant', [{ type: 'tool-call', id: ToolCallId('call-bad'), name: 'lookup', arguments: '{}' }]),
      user([{ type: 'tool-result', toolCallId: ToolCallId('call-bad'), content: [{ type: 'text', text: 'boom' }], isError: true }]),
    ]
    expect(resultTexts(toPiContext(request(historyWithError), undefined, undefined, undefined, collapse)))
      .toEqual(['ok', 'boom'])
  })

  it('collapses older duplicates on the image path without resolving their content', async () => {
    const context = await toPiContext(
      request(dupHistory()),
      imageContext(attachments, { collapseSupersededResults: true }),
    )
    expect(resultTexts(context)).toEqual(
      ['[superseded: a later identical lookup call carries the current output]', 'new output'],
    )
  })
})

describe('prompt-cache prefix stability helpers', () => {
  type FpContext = Parameters<typeof prefixFingerprint>[0]
  const fpContext = (
    systemPrompt: string,
    userContent: string,
    tools: { name: string }[],
  ): FpContext => {
    const base: FpContext = {
      systemPrompt,
      messages: [{ role: 'user', content: userContent, timestamp: 0 }],
      tools: [],
    }
    if (tools.length > 0) base.tools = tools as NonNullable<FpContext['tools']>
    return base
  }

  it('stableToolOrder sorts by name without mutating the input', () => {
    const input = [{ name: 'zeta' }, { name: 'alpha' }, { name: 'mike' }]
    const sorted = stableToolOrder(input)
    expect(sorted.map(t => t.name)).toEqual(['alpha', 'mike', 'zeta'])
    expect(input.map(t => t.name)).toEqual(['zeta', 'alpha', 'mike'])
  })

  it('prefixFingerprint is stable for identical prefixes and sensitive to changes', () => {
    const first = prefixFingerprint(fpContext('sys', 'hello world', [{ name: 'b-tool' }, { name: 'a-tool' }]))
    expect(prefixFingerprint(fpContext('sys', 'hello world', [{ name: 'b-tool' }, { name: 'a-tool' }]))).toBe(first)
    expect(prefixFingerprint(fpContext('sys2', 'hello world', [{ name: 'b-tool' }, { name: 'a-tool' }]))).not.toBe(first)
    expect(prefixFingerprint(fpContext('sys', 'hello world!', [{ name: 'b-tool' }, { name: 'a-tool' }]))).not.toBe(first)
    // No tools at all is a valid prefix shape.
    expect(prefixFingerprint(fpContext('sys', 'u', []))).toHaveLength(8)
  })

  it('prefixFingerprint honors the tool SEQUENCE (what cache heads key on)', () => {
    expect(prefixFingerprint(fpContext('', 'u', [{ name: 'x' }, { name: 'y' }])))
      .not.toBe(prefixFingerprint(fpContext('', 'u', [{ name: 'y' }, { name: 'x' }])))
  })
})

describe('pi-ai system prompt source', () => {
  const base = { provider: 'openai', model: 'gpt-4.1' }
  const leading = history('system', [{ type: 'text', text: 'lead ' }, { type: 'text', text: 'rule' }])
  const question = user([{ type: 'text', text: 'hi' }])

  it.each<{ label: string; content: ContentBlock[] }>([
    { label: 'image-only', content: [{ type: 'image', attachment: ref }] },
    { label: 'text and image', content: [{ type: 'text', text: 'rule' }, { type: 'image', attachment: ref }] },
    {
      label: 'nested image',
      content: [{
        type: 'tool-result',
        toolCallId: ToolCallId('system-image'),
        content: [{ type: 'image', attachment: ref }],
      }],
    },
  ])('rejects a leading system $label on both conversion paths', async ({ content }) => {
    const options: GenerateOptions = { ...base, messages: [history('system', content), question] }
    const error = {
      code: 'UNSUPPORTED_CONTENT',
      message: 'pi-ai cannot represent an image in an in-history system message',
    }
    expect(() => toPiContext(options)).toThrow(error.message)
    const readImageRequest = vi.fn()
    await expect(toPiContext(options, imageContext(projectionStore(readImageRequest)))).rejects.toMatchObject(error)
    expect(readImageRequest).not.toHaveBeenCalled()
  })

  it('maps a leading system message to systemPrompt on both conversion paths', async () => {
    const options: GenerateOptions = { ...base, messages: [leading, question] }
    const expected = {
      systemPrompt: 'lead rule',
      messages: [{ role: 'user', content: 'hi', timestamp: 0 }],
    }
    expect(toPiContext(options)).toEqual(expected)
    await expect(toPiContext(options, imageContext(attachments))).resolves.toEqual(expected)
    const fromOption: GenerateOptions = { ...base, system: 'lead rule', messages: [question] }
    expect(toPiContext(options)).toEqual(toPiContext(fromOption))
    expect(await toPiContext(options, imageContext(attachments)))
      .toEqual(await toPiContext(fromOption, imageContext(attachments)))
  })

  it('sends no systemPrompt for an empty leading system message on both conversion paths', async () => {
    const options: GenerateOptions = { ...base, messages: [history('system', []), question] }
    const expected = { messages: [{ role: 'user', content: 'hi', timestamp: 0 }] }
    expect(toPiContext(options)).toEqual(expected)
    await expect(toPiContext(options, imageContext(attachments))).resolves.toEqual(expected)
  })

  it('folds a non-leading system message into a user message on both conversion paths', async () => {
    const options: GenerateOptions = { ...base, messages: [question, leading] }
    const expected = {
      messages: [
        { role: 'user', content: 'hi', timestamp: 0 },
        { role: 'user', content: 'lead rule', timestamp: 0 },
      ],
    }
    expect(toPiContext(options)).toEqual(expected)
    await expect(toPiContext(options, imageContext(attachments))).resolves.toEqual(expected)
  })

  it('lets options.system win over a leading system message, which then folds, on both conversion paths', async () => {
    const options: GenerateOptions = { ...base, system: 'direct', messages: [leading, question] }
    const expected = {
      systemPrompt: 'direct',
      messages: [
        { role: 'user', content: 'lead rule', timestamp: 0 },
        { role: 'user', content: 'hi', timestamp: 0 },
      ],
    }
    expect(toPiContext(options)).toEqual(expected)
    await expect(toPiContext(options, imageContext(attachments))).resolves.toEqual(expected)
  })
})
