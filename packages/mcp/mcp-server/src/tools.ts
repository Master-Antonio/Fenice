/**
 * MCP tool listing and execution bridge for DSH tools and session operations.
 * @module @deepseek-ai/dsh-mcp-server/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import { randomUUID } from 'node:crypto'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-settings'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { executeSessionOp, isSessionOpTool, SESSION_OPS_TOOLS } from './session-ops.ts'
import type { McpContentBlock, McpToolCallResult, McpToolDefinition, McpToolOptions } from './types.ts'

/** Check whether the mcpServer flag is active in options or Agent-Lab settings. */
export function isMcpServerEnabled(ctx: Context, options?: McpToolOptions): boolean {
  if (options?.flags?.mcpServer !== undefined) return options.flags.mcpServer
  const lab = ctx.get('settings')?.get('agent-lab') as { mcpServer?: boolean } | undefined
  return lab?.mcpServer === true
}

/**
 * Return all registered DSH tools and session operations formatted as standard MCP tool definitions.
 * @param ctx - Cordis context with the tool runtime mounted.
 * @param options - Scope, session-operation inclusion, and feature flags.
 * @returns the advertised definitions, or an empty list while the flag is off.
 */
export function getMcpToolDefinitions(
  ctx: Context,
  options?: McpToolOptions,
): readonly McpToolDefinition[] {
  if (!isMcpServerEnabled(ctx, options)) return []

  const dshTools = ctx.tools.schemas(options?.scope).map((schema): McpToolDefinition => ({
    name: schema.name,
    description: schema.description,
    inputSchema: schema.parameters as McpToolDefinition['inputSchema'],
  }))

  // Session operations are served by the Session controller; advertising them
  // without it would announce a surface every call would then refuse.
  const includeSessionOps = (options?.includeSessionOps ?? true) && ctx.get('sessionController') !== undefined
  return includeSessionOps ? [...dshTools, ...SESSION_OPS_TOOLS] : dshTools
}

/**
 * Project one canonical DSH content block onto the MCP transport vocabulary.
 *
 * Image blocks reference immutable attachment bytes rather than carrying them,
 * so the durable bytes are resolved through the attachment store. Without that
 * store — or for any block type MCP has no counterpart for — the block degrades
 * to a described text block rather than an empty image payload.
 * @param ctx - Cordis context that may carry the attachment store.
 * @param block - one canonical content block from a tool result.
 * @returns the transport block for this content block.
 */
async function projectBlock(ctx: Context, block: ContentBlock): Promise<McpContentBlock> {
  switch (block.type) {
    case 'text':
      return { type: 'text', text: block.text }
    case 'reasoning':
      return { type: 'text', text: block.text }
    case 'image': {
      const attachments = ctx.get('attachments')
      if (attachments === undefined) {
        return { type: 'text', text: `[image ${block.attachment.mediaType} unavailable: no attachment store is mounted]` }
      }
      try {
        const stored = await attachments.readImage(block.attachment)
        return {
          type: 'image',
          data: Buffer.from(stored.data).toString('base64'),
          mimeType: stored.ref.mediaType,
        }
      } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : String(error)
        return { type: 'text', text: `[image ${block.attachment.mediaType} unavailable: ${detail}]` }
      }
    }
    default:
      return { type: 'text', text: `[unsupported content block: ${block.type}]` }
  }
}

/**
 * Execute any registered DSH tool or session operation from standard MCP tool call arguments.
 * @param ctx - Cordis context with the tool runtime mounted.
 * @param name - the tool name as advertised by {@link getMcpToolDefinitions}.
 * @param args - unvalidated arguments as received from the MCP client.
 * @param options - flags plus the caller's cancellation signal.
 * @returns the MCP tool result; every refusal and failure is an `isError` result.
 */
export async function executeMcpTool(
  ctx: Context,
  name: string,
  args: Record<string, unknown>,
  options?: McpToolOptions,
): Promise<McpToolCallResult> {
  if (!isMcpServerEnabled(ctx, options)) {
    return {
      content: [{ type: 'text', text: 'mcpServer is disabled: enable the mcpServer flag in agent-lab settings' }],
      isError: true,
    }
  }

  // MCP requests are cancelled by closing the request, not by an inner signal,
  // so an absent caller signal means "no cancellation" rather than "abort now".
  const signal = options?.signal ?? new AbortController().signal

  if (isSessionOpTool(name)) {
    if (options?.includeSessionOps === false) {
      return {
        content: [{ type: 'text', text: `session operations are not exposed by this MCP server: ${name}` }],
        isError: true,
      }
    }
    return await executeSessionOp(ctx, name, args, signal)
  }

  let result: ToolExecutionResult
  try {
    result = await ctx.tools.execute({
      callId: ToolCallId(`mcp-${randomUUID()}`),
      name,
      arguments: args,
      signal,
    })
  } catch (error: unknown) {
    return {
      content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
      isError: true,
    }
  }

  const blocks: McpContentBlock[] = []
  for (const block of result.content) blocks.push(await projectBlock(ctx, block))
  if (blocks.length === 0) {
    const value = result.isError ? result.error.message : JSON.stringify(result.value ?? null, null, 2)
    blocks.push({ type: 'text', text: value })
  }

  return { content: blocks, isError: result.isError }
}
