/**
 * Standard MCP session operations tool definitions and handlers.
 *
 * Session operations are served by the Session business API (`ctx.sessionController`)
 * and by nothing else: the controller owns admission, ownership, and the
 * experiment flags these operations must respect. When it is absent the
 * operations are simply not advertised, so no half-privileged fallback path
 * exists for an MCP client to reach.
 *
 * Arguments arrive from an external MCP client, so this module is a WIRE
 * boundary: every payload is validated before it reaches a typed call.
 *
 * @module @deepseek-ai/dsh-mcp-server/session-ops
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type { SessionRequestId } from '@deepseek-ai/dsh-api-session-controller/types'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { McpToolCallResult, McpToolDefinition } from './types.ts'

/** One rejected MCP session-operation payload, reported back as an `isError` result. */
class McpArgumentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'McpArgumentError'
  }
}

/**
 * Read one required non-empty string field.
 * @param args - the unvalidated MCP payload.
 * @param field - the field name to read.
 * @returns the field's non-empty string value.
 * @throws {McpArgumentError} when absent, not a string, or empty.
 */
function requiredString(args: Record<string, unknown>, field: string): string {
  const value = args[field]
  if (typeof value !== 'string' || value.length === 0) {
    throw new McpArgumentError(`${field} must be a non-empty string`)
  }
  return value
}

/**
 * Read one optional non-empty string field.
 * @param args - the unvalidated MCP payload.
 * @param field - the field name to read.
 * @returns the field's value, or undefined when the field is absent.
 * @throws {McpArgumentError} when present but not a non-empty string.
 */
function optionalString(args: Record<string, unknown>, field: string): string | undefined {
  const value = args[field]
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length === 0) {
    throw new McpArgumentError(`${field} must be a non-empty string`)
  }
  return value
}

/**
 * Read one optional non-negative integer field (an event sequence or turn index).
 * @param args - the unvalidated MCP payload.
 * @param field - the field name to read.
 * @returns the field's value, or undefined when the field is absent.
 * @throws {McpArgumentError} when present but not a non-negative safe integer.
 */
function optionalIndex(args: Record<string, unknown>, field: string): number | undefined {
  const value = args[field]
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new McpArgumentError(`${field} must be a non-negative integer`)
  }
  return value
}

/**
 * Read the prompt delivery mode.
 * @param args - the unvalidated MCP payload.
 * @returns the requested mode, defaulting to `queue`.
 * @throws {McpArgumentError} when present but not one of the two modes.
 */
function promptMode(args: Record<string, unknown>): 'queue' | 'steer' {
  const value = args['mode']
  if (value === undefined) return 'queue'
  if (value !== 'queue' && value !== 'steer') {
    throw new McpArgumentError('mode must be "queue" or "steer"')
  }
  return value
}

export const SESSION_CREATE_TOOL: McpToolDefinition = {
  name: 'session_create',
  description: 'Create a new DSH/Fenice agent session with optional working directory and preset.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string', description: 'Working directory for the session' },
      agentPreset: { type: 'string', description: 'Agent preset configuration name' },
      sessionId: { type: 'string', description: 'Explicit session ID' },
    },
  },
}

export const SESSION_LIST_TOOL: McpToolDefinition = {
  name: 'session_list',
  description: 'List existing DSH/Fenice sessions.',
  inputSchema: {
    type: 'object',
    properties: {
      cursor: { type: 'string', description: 'Pagination cursor' },
    },
  },
}

export const SESSION_PROMPT_TOOL: McpToolDefinition = {
  name: 'session_prompt',
  description: 'Send a user prompt to a DSH/Fenice session.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'Target session ID' },
      text: { type: 'string', description: 'User message text' },
      mode: { type: 'string', enum: ['queue', 'steer'], description: 'Prompt delivery mode (queue or steer)' },
    },
    required: ['sessionId', 'text'],
  },
}

export const SESSION_HISTORY_TOOL: McpToolDefinition = {
  name: 'session_history',
  description: 'Inspect the event log and messages of a DSH/Fenice session.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'Target session ID' },
      throughSeq: { type: 'number', description: 'Fetch events through this sequence number' },
    },
    required: ['sessionId'],
  },
}

export const SESSION_TRUNCATE_TOOL: McpToolDefinition = {
  name: 'session_truncate',
  description: 'Truncate or rewind a DSH/Fenice session in place to a specific event sequence or turn index.'
    + ' Requires the sessionTruncate Agent-Lab flag to be enabled by the operator.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'Target session ID' },
      atSeq: { type: 'number', description: 'Event sequence number to truncate from (inclusive)' },
      turnIndex: { type: 'number', description: 'Turn index to rewind to' },
    },
    required: ['sessionId'],
  },
}

export const SESSION_FORK_TOOL: McpToolDefinition = {
  name: 'session_fork',
  description: 'Fork a completed turn prefix from an existing session into a new session.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'Source session ID' },
      atSeq: { type: 'number', description: 'Sequence number boundary for fork' },
    },
    required: ['sessionId'],
  },
}

export const SESSION_OPS_TOOLS: readonly McpToolDefinition[] = [
  SESSION_CREATE_TOOL,
  SESSION_LIST_TOOL,
  SESSION_PROMPT_TOOL,
  SESSION_HISTORY_TOOL,
  SESSION_TRUNCATE_TOOL,
  SESSION_FORK_TOOL,
]

const SESSION_TOOL_NAMES: ReadonlySet<string> = new Set(SESSION_OPS_TOOLS.map(tool => tool.name))

/** Whether a tool name is one of the standard session operations. */
export function isSessionOpTool(name: string): boolean {
  return SESSION_TOOL_NAMES.has(name)
}

/** One JSON text block, the transport shape every session operation returns. */
function json(value: unknown): McpToolCallResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

/**
 * Execute a session operation tool call through the Session business API.
 * @param ctx - Cordis context; the Session controller must be mounted.
 * @param name - one of {@link SESSION_OPS_TOOLS} names.
 * @param args - unvalidated arguments as received from the MCP client.
 * @param signal - caller cancellation forwarded to controller reads.
 * @returns the operation's JSON result, or an `isError` result carrying the refusal.
 */
export async function executeSessionOp(
  ctx: Context,
  name: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
): Promise<McpToolCallResult> {
  const controller = ctx.get('sessionController')
  if (controller === undefined) {
    return {
      content: [{ type: 'text', text: 'the Session controller is not mounted, so session operations are unavailable' }],
      isError: true,
    }
  }

  try {
    switch (name) {
      case 'session_create': {
        const cwd = optionalString(args, 'cwd')
        const agentPreset = optionalString(args, 'agentPreset')
        const sessionId = optionalString(args, 'sessionId')
        return json(await controller.create({
          ...cwd === undefined ? {} : { cwd },
          ...agentPreset === undefined ? {} : { agentPreset },
          ...sessionId === undefined ? {} : { sessionId: brandString<SessionId>(sessionId) },
        }))
      }

      case 'session_list': {
        const cursor = optionalString(args, 'cursor')
        return json(await controller.list(cursor === undefined ? {} : { cursor }, signal))
      }

      case 'session_prompt': {
        return json(await controller.prompt({
          requestId: brandString<SessionRequestId>(`mcp-${randomUUID()}`),
          sessionId: brandString<SessionId>(requiredString(args, 'sessionId')),
          mode: promptMode(args),
          content: [{ type: 'text', text: requiredString(args, 'text') }],
        }, signal))
      }

      case 'session_history': {
        const sessionId = brandString<SessionId>(requiredString(args, 'sessionId'))
        const throughSeq = optionalIndex(args, 'throughSeq')
        const state = await controller.inspect(sessionId, signal)
        return json({
          meta: state.meta,
          events: throughSeq === undefined ? state.events : state.events.filter(event => event.seq <= throughSeq),
        })
      }

      case 'session_truncate': {
        const sessionId = brandString<SessionId>(requiredString(args, 'sessionId'))
        const atSeq = optionalIndex(args, 'atSeq')
        const turnIndex = optionalIndex(args, 'turnIndex')
        // No `flags` override: enabling this experiment is the operator's
        // Agent-Lab decision, not something an MCP client may assert.
        return json(await controller.truncate({
          sessionId,
          ...atSeq === undefined ? {} : { atSeq },
          ...turnIndex === undefined ? {} : { turnIndex },
        }))
      }

      case 'session_fork': {
        const sessionId = brandString<SessionId>(requiredString(args, 'sessionId'))
        const atSeq = optionalIndex(args, 'atSeq')
        return json(await controller.fork({
          sessionId,
          ...atSeq === undefined ? {} : { atSeq },
        }))
      }

      default:
        return {
          content: [{ type: 'text', text: `unknown session operation tool: ${name}` }],
          isError: true,
        }
    }
  } catch (error: unknown) {
    return {
      content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
      isError: true,
    }
  }
}
