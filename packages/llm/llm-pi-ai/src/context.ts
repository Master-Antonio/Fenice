/**
 * Harness request-history conversion into pi-ai's Context vocabulary.
 *
 * @module dsh-llm-pi-ai/context
 */

import { CallId, contentHasImage, LlmError, offloadRequestImages } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, Message } from '@deepseek-ai/dsh-llm'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import type { Context as PiContext, ImageContent, Message as PiMessage, TextContent, Tool as PiTool } from '@earendil-works/pi-ai'
import { toPiAssistant } from './replay.ts'

/** Join the text blocks of a harness message. */
function flattenText(message: Message): string {
  return message.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
}


export const DEFAULT_MAX_TOOL_RESULT_CHARS = 32_768

/**
 * Smart micro-compaction of large tool outputs to optimize context and token
 * costs. Preserves the head (45%) and tail (45%) of the configured budget and
 * names the omitted span, so a model keeps both the command shape and the
 * freshest output of an oversized tool result.
 * @param raw - the full inline tool-result text.
 * @param maxChars - character budget; results at or under it pass through untouched.
 * @returns the original text, or the compacted head + marker + tail form.
 */
export function compactToolResultText(raw: string, maxChars = DEFAULT_MAX_TOOL_RESULT_CHARS): string {
  if (raw.length <= maxChars) return raw
  const headChars = Math.floor(maxChars * 0.45)
  const tailChars = Math.floor(maxChars * 0.45)
  const omitted = raw.length - headChars - tailChars
  return `${raw.slice(0, headChars)}\n\n[... Tool output truncated: ${omitted} characters compacted for context efficiency ...]\n\n${raw.slice(-tailChars)}`
}

/** Flatten text recursively inside one tool result. */
function toolResultText(blocks: readonly ContentBlock[], maxChars: number): string {
  const raw = blocks.map(block => block.type === 'text'
    ? block.text
    : block.type === 'tool-result' ? toolResultText(block.content, maxChars) : '').join('')
  return compactToolResultText(raw, maxChars)
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
  attachments: AttachmentStore,
): Promise<string | (TextContent | ImageContent)[]> {
  const content: (TextContent | ImageContent)[] = []
  for (const block of blocks) {
    switch (block.type) {
      case 'text':
        if (block.text.length > 0) content.push({ type: 'text', text: block.text })
        break
      case 'image': {
        const stored = await attachments.readImage(block.attachment)
        content.push({
          type: 'image',
          data: Buffer.from(stored.data).toString('base64'),
          mimeType: stored.ref.mediaType,
        })
        break
      }
      case 'tool-result':
        {
          const nested = await userContent(block.content, attachments)
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

function toolsOf(options: GenerateOptions): PiTool[] | undefined {
  return options.tools?.map(tool => ({
    name: tool.name,
    description: tool.description,
    // ToolSchema.parameters is a JSON Schema object; pi-ai's TSchema
    // (TypeBox) is structurally JSON Schema, so it assigns directly.
    parameters: tool.parameters,
  }))
}

/** Assemble the request-level pi-ai context envelope shared by both conversion paths. */
function piContext(options: GenerateOptions, messages: PiMessage[]): PiContext {
  const tools = toolsOf(options)
  return {
    ...options.system !== undefined ? { systemPrompt: options.system } : {},
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
 * @param tools - the assembled tool list.
 * @returns a name-sorted copy; the input is untouched.
 */
export function stableToolOrder<T extends { name: string }>(tools: readonly T[]): T[] {
  return [...tools].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

/**
 * Compact stability fingerprint of the cache-relevant REQUEST PREFIX — the
 * system prompt plus the tool-name sequence plus the first message's opening
 * slice. Emitted with turn telemetry so a deployment can MEASURE prefix
 * stability (identical hash across consecutive turns ⇒ provider caches can
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

function textOnlyContext(
  options: GenerateOptions,
  onReplayDegrade?: (reason: string) => void,
  maxToolResultChars: number = DEFAULT_MAX_TOOL_RESULT_CHARS,
): PiContext {
  const toolNames = new Map<CallId, string>()
  const messages: PiMessage[] = []
  for (const message of options.messages) {
    if (contentHasImage(message.content)) {
      throw new LlmError('pi-ai image conversion requires the durable attachment service', 'UNSUPPORTED_CONTENT')
    }
    if (message.role === 'system') {
      messages.push({ role: 'user', content: flattenText(message), timestamp: 0 })
      continue
    }
    if (message.role === 'assistant') {
      const assistant = toPiAssistant(message, onReplayDegrade)
      for (const block of assistant.content) if (block.type === 'toolCall') toolNames.set(CallId(block.id), block.name)
      messages.push(assistant)
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
          text: toolResultText(result.content, maxToolResultChars) || '(no output)',
        }],
        isError: result.isError ?? false,
        timestamp: 0,
      })
    }
  }
  return piContext(options, messages)
}

/**
 * Convert text-only harness history to a synchronous pi-ai Context. Tool
 * result names are recovered from preceding assistant tool calls.
 * @param options - the harness request; `options.system` maps to pi-ai's single `systemPrompt` slot.
 * @param attachments - absent; selects the synchronous conversion.
 * @param onReplayDegrade - forwarded to {@link toPiAssistant} for each assistant message.
 * @param maxToolResultChars - inline tool-result character budget; omission uses the 32,768 default.
 * @returns the pi-ai context; `tools` is omitted when the request declares none.
 */
export function toPiContext(
  options: GenerateOptions,
  attachments?: undefined,
  onReplayDegrade?: (reason: string) => void,
  maxToolResultChars?: number,
): PiContext
/**
 * Convert harness history to a pi-ai Context while resolving durable images.
 * Tool result names are recovered from preceding assistant tool calls. When
 * the accumulated base64 image payload exceeds `maxRequestImageBytes`, the
 * oldest images are replaced by text placeholders until the request fits, so
 * an image-heavy session keeps clearing gateway request-size caps.
 * @param options - the harness request; `options.system` maps to pi-ai's single `systemPrompt` slot.
 * @param attachments - durable byte resolver for image references.
 * @param onReplayDegrade - forwarded to {@link toPiAssistant} for each assistant message.
 * @param maxRequestImageBytes - request-level bound on base64-encoded image payload; omission leaves every image in place.
 * @param maxToolResultChars - inline tool-result character budget; omission uses the 32,768 default.
 * @returns the asynchronously resolved pi-ai context.
 */
export function toPiContext(
  options: GenerateOptions,
  attachments: AttachmentStore,
  onReplayDegrade?: (reason: string) => void,
  maxRequestImageBytes?: number,
  maxToolResultChars?: number,
): Promise<PiContext>
export function toPiContext(
  options: GenerateOptions,
  attachments?: AttachmentStore,
  onReplayDegrade?: (reason: string) => void,
  // Overload-dependent BY DESIGN, mirroring the two public shapes above: on
  // the synchronous path (no attachments) this slot IS the tool-result char
  // budget; on the image path it is the request image-payload bound and the
  // budget rides in the next slot instead.
  imageBoundOrBudget?: number,
  maxToolResultChars?: number,
): PiContext | Promise<PiContext> {
  return attachments === undefined
    ? textOnlyContext(options, onReplayDegrade, imageBoundOrBudget)
    : toPiContextWithImages(options, attachments, onReplayDegrade, imageBoundOrBudget, maxToolResultChars)
}

async function toPiContextWithImages(
  options: GenerateOptions,
  attachments: AttachmentStore,
  onReplayDegrade?: (reason: string) => void,
  maxRequestImageBytes?: number,
  maxToolResultChars: number = DEFAULT_MAX_TOOL_RESULT_CHARS,
): Promise<PiContext> {
  assertSupportedImageRoles(options.messages)
  const requestMessages = offloadRequestImages(options.messages, maxRequestImageBytes)
  const toolNames = new Map<CallId, string>()
  const messages: PiMessage[] = []

  for (const message of requestMessages) {
    if (message.role === 'system') {
      // pi-ai has a single systemPrompt slot; in-history system messages are
      // folded into user messages to preserve order (rare in practice — the
      // harness sends the system prompt via options.system).
      messages.push({ role: 'user', content: flattenText(message), timestamp: 0 })
      continue
    }
    if (message.role === 'assistant') {
      const assistant = toPiAssistant(message, onReplayDegrade)
      for (const block of assistant.content) {
        if (block.type === 'toolCall') toolNames.set(CallId(block.id), block.name)
      }
      messages.push(assistant)
      continue
    }
    // user role: text + tool results (each result becomes its own message).
    const regular = message.content.filter(block => block.type !== 'tool-result')
    const content = await userContent(regular, attachments)
    const results = message.content.filter((block): block is Extract<ContentBlock, { type: 'tool-result' }> => (
      block.type === 'tool-result'
    ))
    if (content.length > 0 || results.length === 0) {
      messages.push({ role: 'user', content, timestamp: 0 })
    }
    for (const result of results) {
      const resultContent = await userContent(result.content, attachments)
      messages.push({
        role: 'toolResult',
        toolCallId: result.toolCallId,
        toolName: toolNames.get(result.toolCallId) ?? 'unknown',
        content: typeof resultContent === 'string'
          ? [{ type: 'text', text: compactToolResultText(resultContent, maxToolResultChars) || '(no output)' }]
          : resultContent,
        isError: result.isError ?? false,
        timestamp: 0,
      })
    }
  }

  return piContext(options, messages)
}
