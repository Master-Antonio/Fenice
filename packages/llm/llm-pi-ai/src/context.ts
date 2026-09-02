/**
 * Harness request-history conversion into pi-ai's Context vocabulary.
 *
 * @module dsh-llm-pi-ai/context
 */

import { brandString } from '@deepseek-ai/dsh-brand'
import { contentHasImage, LlmError, offloadedImageText, offloadRequestImagesWithPolicy, requestImageHandleText } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, ImageAttachmentAccessResolver, Message, ToolCallId } from '@deepseek-ai/dsh-llm'
import type {
  AttachmentId,
  AttachmentStore,
  ImageAttachmentRef,
  ImageRequestPolicy,
  RequestImageAttachment,
} from '@deepseek-ai/dsh-attachment'
import type { Context as PiContext, ImageContent, Message as PiMessage, TextContent, Tool as PiTool } from '@earendil-works/pi-ai'
import { toPiAssistant } from './replay.ts'
import { DEFAULT_REQUEST_IMAGE_MAX_BYTES, DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET } from './config.ts'
import {
  CompactionSpillStore,
  defaultCompactionSpillStore,
} from './spill.ts'

export { extractCompactionPointer, generateCompactionPointerId } from './spill.ts'

/** Join the text blocks of a harness message. */
function flattenText(message: Message): string {
  return message.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
}

export const DEFAULT_MAX_TOOL_RESULT_CHARS = 32_768

/** Options controlling compaction behavior and spill store integration. */
export interface CompactionOptions {
  /** Character budget; results at or under it pass through untouched. */
  maxChars?: number
  /** Whether to store truncated content into spill store and attach `[compaction_pointer: <id>]`. */
  compactionPointer?: boolean
  /** Spill store map/file backend to persist truncated content. */
  spillStore?: CompactionSpillStore
  /** Explicit pointer ID to use instead of generating one. */
  pointerId?: string
}

/**
 * Smart micro-compaction of large tool outputs to optimize context and token
 * costs. Preserves the head (45%) and tail (45%) of the configured budget and
 * names the omitted span, so a model keeps both the command shape and the
 * freshest output of an oversized tool result.
 *
 * When `compactionPointer` is active, the full untruncated content is stored into
 * the spill store map/file, and a formal pointer tag `[compaction_pointer: <id>]`
 * is embedded in the truncation marker.
 *
 * @param raw - the full inline tool-result text.
 * @param maxCharsOrOptions - character budget or compaction options object.
 * @param legacyOptions - optional additional options when maxChars is passed as number.
 * @returns the original text, or the compacted head + marker + tail form.
 */
export function compactToolResultText(
  raw: string,
  maxCharsOrOptions: number | CompactionOptions = DEFAULT_MAX_TOOL_RESULT_CHARS,
  legacyOptions?: CompactionOptions,
): string {
  const options: CompactionOptions = typeof maxCharsOrOptions === 'number'
    ? { maxChars: maxCharsOrOptions, ...legacyOptions }
    : (maxCharsOrOptions ?? {})

  const maxChars = options.maxChars ?? DEFAULT_MAX_TOOL_RESULT_CHARS
  if (raw.length <= maxChars) return raw
  const headChars = Math.floor(maxChars * 0.45)
  const tailChars = Math.floor(maxChars * 0.45)
  const omitted = raw.length - headChars - tailChars

  let pointerTag = ''
  if (options.compactionPointer) {
    const store = options.spillStore ?? defaultCompactionSpillStore
    const id = store.store(raw, options.pointerId)
    pointerTag = ` [compaction_pointer: ${id}]`
  }

  return `${raw.slice(0, headChars)}\n\n[... Tool output truncated: ${omitted} characters compacted for context efficiency${pointerTag} ...]\n\n${raw.slice(-tailChars)}`
}

/**
 * Compact context message text with optional compaction pointer tagging.
 */
export function compactMessageText(
  raw: string,
  maxCharsOrOptions: number | CompactionOptions = DEFAULT_MAX_TOOL_RESULT_CHARS,
  legacyOptions?: CompactionOptions,
): string {
  return compactToolResultText(raw, maxCharsOrOptions, legacyOptions)
}

/** Flatten text recursively inside one tool result. */
function toolResultText(
  blocks: readonly ContentBlock[],
  maxChars: number,
  compactionOpts?: CompactionOptions,
): string {
  const raw = blocks.map(block => block.type === 'text'
    ? block.text
    : block.type === 'tool-result' ? toolResultText(block.content, maxChars, compactionOpts) : '').join('')
  return compactToolResultText(raw, { ...compactionOpts, maxChars })
}

/** Reject image roles that pi-ai cannot replay before request-size offloading can replace them. */
function assertSupportedImageRoles(messages: readonly Message[]): void {
  for (const message of messages) {
    if (message.role !== 'user' && contentHasImage(message.content)) {
      throw new LlmError(
        `pi-ai cannot represent an image in an in-history ${message.role} message`,
        'UNSUPPORTED_CONTENT',
      )
    }
  }
}

async function userContent(
  blocks: readonly ContentBlock[],
  requestImages: ReadonlyMap<AttachmentId, RequestImageAttachment>,
  resolveImageAccess: ImageAttachmentAccessResolver,
): Promise<string | (TextContent | ImageContent)[]> {
  const content: (TextContent | ImageContent)[] = []
  for (const block of blocks) {
    switch (block.type) {
      case 'text':
        if (block.text.length > 0) content.push({ type: 'text', text: block.text })
        break
      case 'image': {
        const version = requestImages.get(block.attachment.attachmentId) as RequestImageAttachment
        content.push({
          type: 'text',
          text: requestImageHandleText(block.attachment, version, resolveImageAccess(block.attachment)),
        })
        content.push({
          type: 'image',
          data: Buffer.from(version.data).toString('base64'),
          mimeType: version.mediaType,
        })
        break
      }
      case 'tool-result':
        {
          const nested = await userContent(block.content, requestImages, resolveImageAccess)
          if (typeof nested === 'string') {
            if (nested.length > 0) content.push({ type: 'text', text: nested })
          } else {
            content.push(...nested)
          }
        }
        break
      default:
        // Other merge-extensible blocks are not user-input vocabulary for pi-ai.
        break
    }
  }
  if (content.every(block => block.type === 'text')) return content.map(block => block.text).join('')
  return content
}

function collectImageRefs(
  blocks: readonly ContentBlock[],
  refs: Map<AttachmentId, ImageAttachmentRef>,
): void {
  for (const block of blocks) {
    if (block.type === 'image') refs.set(block.attachment.attachmentId, block.attachment)
    else if (block.type === 'tool-result') collectImageRefs(block.content, refs)
  }
}

async function prepareRequestImages(
  messages: readonly Message[],
  attachments: AttachmentStore,
  policy: ImageRequestPolicy,
  signal?: AbortSignal,
): Promise<Map<AttachmentId, RequestImageAttachment>> {
  const refs = new Map<AttachmentId, ImageAttachmentRef>()
  for (const message of messages) collectImageRefs(message.content, refs)
  const orderedRefs = [...refs.values()]
  const prepared = await Promise.all(orderedRefs.map(
    ref => attachments.readImageRequest(ref, policy, signal),
  ))
  const versions = new Map<AttachmentId, RequestImageAttachment>()
  for (const [index, ref] of orderedRefs.entries()) {
    versions.set(ref.attachmentId, prepared[index] as RequestImageAttachment)
  }
  return versions
}

/**
 * Recursively sort object keys for deterministic serialization of JSON Schemas
 * (tool parameters).
 */
export function canonicalizeJsonSchema<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(canonicalizeJsonSchema) as unknown as T
  }
  const obj = value as Record<string, unknown>
  const sortedKeys = Object.keys(obj).sort()
  const result: Record<string, unknown> = {}
  for (const key of sortedKeys) {
    result[key] = canonicalizeJsonSchema(obj[key])
  }
  return result as T
}

/**
 * Deterministic system prompt normalization: normalizes line endings (CRLF -> LF).
 */
export function normalizeSystemPrompt(system: string | undefined): string | undefined {
  if (system === undefined) return undefined
  return system.replace(/\r\n/g, '\n')
}

function toolsOf(options: GenerateOptions, canonicalize = false): PiTool[] | undefined {
  return options.tools?.map(tool => ({
    name: tool.name,
    description: tool.description,
    // ToolSchema.parameters is a JSON Schema object; pi-ai's TSchema
    // (TypeBox) is structurally JSON Schema, so it assigns directly.
    parameters: canonicalize ? canonicalizeJsonSchema(tool.parameters) : tool.parameters,
  }))
}

/** Assemble the request-level pi-ai context envelope shared by both conversion paths. */
function piContext(
  options: GenerateOptions,
  messages: PiMessage[],
  promptCacheStablePrefix = false,
): PiContext {
  let tools = toolsOf(options, promptCacheStablePrefix)
  if (tools !== undefined && tools.length > 0 && promptCacheStablePrefix) {
    tools = stableToolOrder(tools, true)
  }
  let systemPrompt = options.system
  if (systemPrompt !== undefined && promptCacheStablePrefix) {
    systemPrompt = normalizeSystemPrompt(systemPrompt)
  }
  return {
    ...systemPrompt !== undefined ? { systemPrompt } : {},
    messages,
    ...tools !== undefined && tools.length > 0 ? { tools } : {},
  }
}

/**
 * Deterministic tool ordering for the Agent-Lab `promptCacheStablePrefix`
 * flag. Provider prefix caches key on the byte-exact head of the request;
 * a tool block whose ORDER drifts between turns (plugin load order, config
 * merge results) silently invalidates it. Sorting by name makes the block a
 * pure function of the tool SET. Semantically inert: every protocol treats
 * the list as an unordered catalog.
 *
 * When `canonicalizeSchemas` is true, tool parameters schemas are recursively key-sorted
 * for deterministic JSON byte serialization.
 *
 * @param tools - the assembled tool list.
 * @param canonicalizeSchemas - whether to sort parameters schema keys deeply.
 * @returns a name-sorted copy; the input is untouched.
 */
export function stableToolOrder<T extends { name: string; description?: string; parameters?: unknown }>(
  tools: readonly T[],
  canonicalizeSchemas = false,
): T[] {
  const sorted = [...tools].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  if (!canonicalizeSchemas) return sorted
  return sorted.map(tool => ({
    ...tool,
    ...(tool.parameters !== undefined ? { parameters: canonicalizeJsonSchema(tool.parameters) } : {}),
  }))
}

/**
 * Compact stability fingerprint of the cache-relevant REQUEST PREFIX — the
 * system prompt plus the tool-name sequence plus the first message's opening
 * slice. Emitted with turn telemetry so a deployment can MEASURE prefix
 * stability (identical hash across consecutive turns => provider caches can
 * hit) instead of assuming it.
 * @param context - the assembled pi-ai context.
 * @returns a short hex fingerprint (djb2 over the canonical form).
 */
export function prefixFingerprint(context: PiContext): string {
  const first = context.messages[0]
  const canonical = JSON.stringify([
    context.systemPrompt ?? '',
    context.tools?.map(tool => tool.name) ?? [],
    first === undefined ? '' : `${first.role}:${JSON.stringify(first.content).slice(0, 200)}`,
  ])
  let hash = 5381
  for (let i = 0; i < canonical.length; i += 1) {
    hash = ((hash << 5) + hash + canonical.charCodeAt(i)) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

function appendAssistant(
  message: Message,
  messages: PiMessage[],
  toolNames: Map<ToolCallId, string>,
  onReplayDegrade?: (reason: string) => void,
): void {
  const assistant = toPiAssistant(message, onReplayDegrade)
  for (const block of assistant.content) {
    if (block.type === 'toolCall') toolNames.set(brandString<ToolCallId>(block.id), block.name)
  }
  messages.push(assistant)
}

function textOnlyContext(
  options: GenerateOptions,
  onReplayDegrade?: (reason: string) => void,
  maxToolResultChars: number = DEFAULT_MAX_TOOL_RESULT_CHARS,
  contextOptions?: PiContextOptions,
): PiContext {
  const toolNames = new Map<ToolCallId, string>()
  const messages: PiMessage[] = []
  const compactionOpts: CompactionOptions = {
    maxChars: maxToolResultChars,
    ...contextOptions?.compactionPointer !== undefined ? { compactionPointer: contextOptions.compactionPointer } : {},
    ...contextOptions?.spillStore !== undefined ? { spillStore: contextOptions.spillStore } : {},
  }
  const promptCacheStablePrefix = contextOptions?.promptCacheStablePrefix ?? false

  for (const message of options.messages) {
    if (contentHasImage(message.content)) {
      throw new LlmError('pi-ai image conversion requires the durable attachment service', 'UNSUPPORTED_CONTENT')
    }
    if (message.role === 'system') {
      messages.push({ role: 'user', content: flattenText(message), timestamp: 0 })
      continue
    }
    if (message.role === 'assistant') {
      appendAssistant(message, messages, toolNames, onReplayDegrade)
      continue
    }
    const text = flattenText(message)
    const results = message.content.filter(block => block.type === 'tool-result')
    if (text.length > 0 || results.length === 0) messages.push({ role: 'user', content: text, timestamp: 0 })
    for (const result of results) {
      messages.push({
        role: 'toolResult',
        toolCallId: result.toolCallId,
        toolName: toolNames.get(result.toolCallId) ?? 'unknown',
        content: [{
          type: 'text',
          text: toolResultText(result.content, maxToolResultChars, compactionOpts) || '(no output)',
        }],
        isError: result.isError ?? false,
        timestamp: 0,
      })
    }
  }
  return piContext(options, messages, promptCacheStablePrefix)
}

/** Options configuring context conversion features (compaction pointers, cache stable prefix). */
export interface PiContextOptions {
  onReplayDegrade?: (reason: string) => void
  maxToolResultChars?: number
  compactionPointer?: boolean
  spillStore?: CompactionSpillStore
  promptCacheStablePrefix?: boolean
}

/** Inputs that bind deterministic request images to one current tool execution world. */
export interface PiImageRequestContext {
  /** Durable provider that resolves request-image bytes and provider-owned host objects. */
  attachments: AttachmentStore
  /** Resolve current tool access separately from deterministic request-image versions. */
  resolveImageAccess: ImageAttachmentAccessResolver
  /** Request-level bound on base64-encoded image payload; omission leaves every image in place. */
  maxRequestImageBytes?: number
  /** Route pixel and raw encoded-byte budgets. */
  requestImagePolicy?: ImageRequestPolicy
  /** Inline tool-result character budget; omission uses the 32,768 default. */
  maxToolResultChars?: number
  /** Agent-Lab compactionPointer flag: store truncated outputs in spill store and tag with pointer. */
  compactionPointer?: boolean
  /** Spill store backend for compaction pointers. */
  spillStore?: CompactionSpillStore
  /** Agent-Lab promptCacheStablePrefix flag: sort tools and canonicalize schemas. */
  promptCacheStablePrefix?: boolean
}

/**
 * Convert text-only harness history to a synchronous pi-ai Context. Tool
 * result names are recovered from preceding assistant tool calls.
 * @param options - the harness request; `options.system` maps to pi-ai's single `systemPrompt` slot.
 * @param images - absent; selects the synchronous conversion.
 * @param onReplayDegrade - forwarded to {@link toPiAssistant} for each assistant message.
 * @param maxToolResultChars - inline tool-result character budget; omission uses the 32,768 default.
 * @param contextOptions - options configuring compaction pointer and stable prefix.
 * @returns the pi-ai context; `tools` is omitted when the request declares none.
 */
export function toPiContext(
  options: GenerateOptions,
  images?: undefined,
  onReplayDegrade?: (reason: string) => void,
  maxToolResultChars?: number,
  contextOptions?: PiContextOptions,
): PiContext
/**
 * Convert harness history to a pi-ai Context while resolving durable images.
 * Tool result names are recovered from preceding assistant tool calls. When
 * the accumulated base64 image payload exceeds `maxRequestImageBytes`, the
 * oldest images are replaced by text placeholders until the request fits, so
 * an image-heavy session keeps clearing gateway request-size caps.
 * @param options - the harness request; `options.system` maps to pi-ai's single `systemPrompt` slot.
 * @param images - attachment provider, current path resolver, and request limits.
 * @param onReplayDegrade - forwarded to {@link toPiAssistant} for each assistant message.
 * @returns the asynchronously resolved pi-ai context.
 */
export function toPiContext(
  options: GenerateOptions,
  images: PiImageRequestContext,
  onReplayDegrade?: (reason: string) => void,
): Promise<PiContext>
export function toPiContext(
  options: GenerateOptions,
  images?: PiImageRequestContext,
  onReplayDegrade?: (reason: string) => void,
  maxToolResultChars?: number,
  contextOptions?: PiContextOptions,
): PiContext | Promise<PiContext> {
  return images === undefined
    ? textOnlyContext(options, onReplayDegrade, maxToolResultChars, contextOptions)
    : toPiContextWithImages(options, images, onReplayDegrade)
}

async function toPiContextWithImages(
  options: GenerateOptions,
  images: PiImageRequestContext,
  onReplayDegrade?: (reason: string) => void,
): Promise<PiContext> {
  const {
    attachments,
    resolveImageAccess,
    maxRequestImageBytes,
    maxToolResultChars = DEFAULT_MAX_TOOL_RESULT_CHARS,
    compactionPointer,
    spillStore,
    promptCacheStablePrefix = false,
  } = images
  const compactionOpts: CompactionOptions = {
    maxChars: maxToolResultChars,
    ...compactionPointer !== undefined ? { compactionPointer } : {},
    ...spillStore !== undefined ? { spillStore } : {},
  }
  const requestImagePolicy = images.requestImagePolicy ?? {
    maxPixels: DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET,
    maxBytes: DEFAULT_REQUEST_IMAGE_MAX_BYTES,
  }
  assertSupportedImageRoles(options.messages)
  const requestMessages = offloadRequestImagesWithPolicy(options.messages, {
    representation: 'base64',
    ...maxRequestImageBytes === undefined ? {} : { maxBytes: maxRequestImageBytes },
    byteQuantum: 1,
    byteLength: ref => Math.min(ref.bytes, requestImagePolicy.maxBytes),
    placeholder: ref => offloadedImageText(ref, resolveImageAccess(ref)),
  })
  const requestImages = await prepareRequestImages(requestMessages, attachments, requestImagePolicy, options.signal)
  const exactMessages = offloadRequestImagesWithPolicy(requestMessages, {
    representation: 'base64',
    ...maxRequestImageBytes === undefined ? {} : { maxBytes: maxRequestImageBytes },
    byteQuantum: 1,
    byteLength: ref => (requestImages.get(ref.attachmentId) as RequestImageAttachment).bytes,
    placeholder: ref => offloadedImageText(ref, resolveImageAccess(ref)),
  })
  const toolNames = new Map<ToolCallId, string>()
  const messages: PiMessage[] = []

  for (const message of exactMessages) {
    if (message.role === 'system') {
      // pi-ai has a single systemPrompt slot; in-history system messages are
      // folded into user messages to preserve order (rare in practice — the
      // harness sends the system prompt via options.system).
      messages.push({ role: 'user', content: flattenText(message), timestamp: 0 })
      continue
    }
    if (message.role === 'assistant') {
      appendAssistant(message, messages, toolNames, onReplayDegrade)
      continue
    }
    // user role: text + tool results (each result becomes its own message).
    const regular = message.content.filter(block => block.type !== 'tool-result')
    const content = await userContent(regular, requestImages, resolveImageAccess)
    const results = message.content.filter((block): block is Extract<ContentBlock, { type: 'tool-result' }> => (
      block.type === 'tool-result'
    ))
    if (content.length > 0 || results.length === 0) {
      messages.push({ role: 'user', content, timestamp: 0 })
    }
    for (const result of results) {
      const resultContent = await userContent(result.content, requestImages, resolveImageAccess)
      messages.push({
        role: 'toolResult',
        toolCallId: result.toolCallId,
        toolName: toolNames.get(result.toolCallId) ?? 'unknown',
        content: typeof resultContent === 'string'
          ? [{
            type: 'text',
            text: compactToolResultText(resultContent, { ...compactionOpts, maxChars: maxToolResultChars }) || '(no output)',
          }]
          : resultContent,
        isError: result.isError ?? false,
        timestamp: 0,
      })
    }
  }

  return piContext(options, messages, promptCacheStablePrefix)
}
