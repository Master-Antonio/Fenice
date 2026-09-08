/** Standard MCP server surface: flag gating, tool projection, and the session-operation bridge. */

import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import McpServerService, {
  createDshMcpServer,
  executeMcpTool,
  getMcpToolDefinitions,
  SESSION_OPS_TOOLS,
} from '../src/index.ts'
import type { McpContentBlock, McpToolCallResult } from '../src/index.ts'

/** The text of one projected block, or a stable marker for any other block kind. */
function textOf(block: McpContentBlock | undefined): string {
  return block?.type === 'text' ? block.text : `<non-text: ${block?.type ?? 'missing'}>`
}

/** Parse the JSON payload one session operation returned in its first text block. */
function payloadOf(result: McpToolCallResult): Record<string, unknown> {
  return JSON.parse(textOf(result.content[0])) as Record<string, unknown>
}

const TEXT_OUTPUT = {
  schema: { type: 'string' as const },
  render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
}

/** A Session controller stub recording the exact typed calls the bridge makes. */
function installSessionControllerStub(ctx: Context): {
  readonly calls: { name: string; request: unknown }[]
} {
  const calls: { name: string; request: unknown }[] = []
  const record = <T>(name: string, value: T) => (request: unknown): Promise<T> => {
    calls.push({ name, request })
    return Promise.resolve(value)
  }
  ctx.provide('sessionController', {
    create: record('create', { sessionId: SessionId('session-created') }),
    list: record('list', { items: [{ sessionId: SessionId('session-created') }] }),
    prompt: record('prompt', { accepted: true }),
    inspect: (sessionId: SessionId) => {
      calls.push({ name: 'inspect', request: { sessionId } })
      return Promise.resolve({
        meta: { id: sessionId },
        events: [{ seq: 0 }, { seq: 1 }, { seq: 2 }],
      })
    },
    truncate: record('truncate', { sessionId: SessionId('session-created'), truncatedAtSeq: 3 }),
    fork: record('fork', { sessionId: SessionId('session-forked') }),
  } as never)
  return { calls }
}

async function toolContext(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt, { personaPrefix: '' })
  await ctx.plugin(ToolRuntime)
  return ctx
}

describe('mcp-server flag gating', () => {
  it('advertises nothing and refuses execution while the mcpServer flag is off', async () => {
    const ctx = await toolContext()
    ctx.tools.register(defineTool({
      name: 'echo',
      description: 'Echo test tool',
      parameters: { msg: { type: 'string', required: true } },
      output: TEXT_OUTPUT,
      execute: args => Promise.resolve(args.msg),
    }))

    expect(getMcpToolDefinitions(ctx, { flags: { mcpServer: false } })).toEqual([])

    const result = await executeMcpTool(ctx, 'echo', { msg: 'hello' }, { flags: { mcpServer: false } })
    expect(result.isError).toBe(true)
    expect(textOf(result.content[0])).toMatch(/mcpServer is disabled/)

    await ctx.fiber.dispose()
  })

  it('reads the mcpServer switch from agent-lab settings when no flag override is given', async () => {
    const ctx = await toolContext()
    const get = vi.fn().mockReturnValue({ mcpServer: true })
    ctx.provide('settings', { get } as never)

    ctx.tools.register(defineTool({
      name: 'noop',
      description: 'noop',
      parameters: {},
      output: TEXT_OUTPUT,
      execute: () => Promise.resolve('ok'),
    }))

    expect(getMcpToolDefinitions(ctx).map(tool => tool.name)).toEqual(['noop'])
    expect(get).toHaveBeenCalledWith('agent-lab')

    get.mockReturnValue({ mcpServer: false })
    expect(getMcpToolDefinitions(ctx)).toEqual([])

    await ctx.fiber.dispose()
  })
})

describe('mcp-server tool projection', () => {
  it('projects registered DSH tools with their raw parameter schema', async () => {
    const ctx = await toolContext()
    ctx.tools.register(defineTool({
      name: 'calculate_sum',
      description: 'Calculate the sum of two numbers',
      parameters: {
        a: { type: 'number', required: true, description: 'First operand' },
        b: { type: 'number', required: true, description: 'Second operand' },
      },
      output: TEXT_OUTPUT,
      execute: args => Promise.resolve(String(args.a + args.b)),
    }))

    const tools = getMcpToolDefinitions(ctx, { flags: { mcpServer: true } })
    const sum = tools.find(tool => tool.name === 'calculate_sum')
    expect(sum?.description).toBe('Calculate the sum of two numbers')
    expect(sum?.inputSchema.type).toBe('object')
    expect(sum?.inputSchema.required).toEqual(['a', 'b'])

    await ctx.fiber.dispose()
  })

  it('omits session operations while no Session controller is mounted', async () => {
    const ctx = await toolContext()
    const names = getMcpToolDefinitions(ctx, { flags: { mcpServer: true } }).map(tool => tool.name)
    for (const tool of SESSION_OPS_TOOLS) expect(names).not.toContain(tool.name)
    await ctx.fiber.dispose()
  })

  it('advertises session operations once the Session controller is mounted', async () => {
    const ctx = await toolContext()
    installSessionControllerStub(ctx)

    const names = getMcpToolDefinitions(ctx, { flags: { mcpServer: true } }).map(tool => tool.name)
    expect(names).toEqual(expect.arrayContaining(SESSION_OPS_TOOLS.map(tool => tool.name)))

    const withoutOps = getMcpToolDefinitions(ctx, { flags: { mcpServer: true }, includeSessionOps: false })
    expect(withoutOps.map(tool => tool.name)).not.toContain('session_create')

    await ctx.fiber.dispose()
  })
})

describe('mcp-server execution bridge', () => {
  it('executes a DSH tool and returns its projected content', async () => {
    const ctx = await toolContext()
    ctx.tools.register(defineTool({
      name: 'greet',
      description: 'Greet someone',
      parameters: { name: { type: 'string', required: true } },
      output: TEXT_OUTPUT,
      execute: args => Promise.resolve(`Hello, ${args.name}!`),
    }))

    const result = await executeMcpTool(ctx, 'greet', { name: 'World' }, { flags: { mcpServer: true } })
    expect(result.isError).toBe(false)
    expect(result.content).toEqual([{ type: 'text', text: 'Hello, World!' }])

    await ctx.fiber.dispose()
  })

  it('materializes an unknown tool as an isError result instead of throwing', async () => {
    const ctx = await toolContext()
    const result = await executeMcpTool(ctx, 'missing_tool', {}, { flags: { mcpServer: true } })
    expect(result.isError).toBe(true)
    expect(textOf(result.content[0]).length).toBeGreaterThan(0)
    await ctx.fiber.dispose()
  })

  it('validates session-operation arguments before reaching the controller', async () => {
    const ctx = await toolContext()
    const { calls } = installSessionControllerStub(ctx)

    const missing = await executeMcpTool(ctx, 'session_prompt', {}, { flags: { mcpServer: true } })
    expect(missing.isError).toBe(true)
    expect(calls).toHaveLength(0)

    const wrongType = await executeMcpTool(
      ctx,
      'session_truncate',
      { sessionId: 'session-created', atSeq: 'not-a-number' },
      { flags: { mcpServer: true } },
    )
    expect(wrongType.isError).toBe(true)
    expect(calls).toHaveLength(0)

    await ctx.fiber.dispose()
  })

  it('routes every session operation through the Session controller', async () => {
    const ctx = await toolContext()
    const { calls } = installSessionControllerStub(ctx)
    const flags = { flags: { mcpServer: true } }

    const created = await executeMcpTool(ctx, 'session_create', { cwd: '/workspace' }, flags)
    expect(created.isError).toBeUndefined()
    expect(payloadOf(created).sessionId).toBe('session-created')

    const listed = await executeMcpTool(ctx, 'session_list', {}, flags)
    expect(payloadOf(listed).items).toHaveLength(1)

    const history = await executeMcpTool(
      ctx,
      'session_history',
      { sessionId: 'session-created', throughSeq: 1 },
      flags,
    )
    expect(payloadOf(history).events).toEqual([{ seq: 0 }, { seq: 1 }])

    const truncated = await executeMcpTool(
      ctx,
      'session_truncate',
      { sessionId: 'session-created', turnIndex: 1 },
      flags,
    )
    expect(payloadOf(truncated).truncatedAtSeq).toBe(3)

    const forked = await executeMcpTool(ctx, 'session_fork', { sessionId: 'session-created' }, flags)
    expect(payloadOf(forked).sessionId).toBe('session-forked')

    expect(calls.map(call => call.name)).toEqual(['create', 'list', 'inspect', 'truncate', 'fork'])
    await ctx.fiber.dispose()
  })

  it('never lets an MCP client assert the sessionTruncate experiment flag', async () => {
    const ctx = await toolContext()
    const { calls } = installSessionControllerStub(ctx)

    await executeMcpTool(
      ctx,
      'session_truncate',
      { sessionId: 'session-created', flags: { sessionTruncate: true } },
      { flags: { mcpServer: true } },
    )

    expect(calls).toHaveLength(1)
    expect(calls[0]?.request).not.toHaveProperty('flags')
    await ctx.fiber.dispose()
  })

  it('refuses a session operation when the surface excludes them', async () => {
    const ctx = await toolContext()
    const { calls } = installSessionControllerStub(ctx)

    const result = await executeMcpTool(
      ctx,
      'session_list',
      {},
      { flags: { mcpServer: true }, includeSessionOps: false },
    )
    expect(result.isError).toBe(true)
    expect(calls).toHaveLength(0)
    await ctx.fiber.dispose()
  })

  it('refuses a session operation while no Session controller is mounted', async () => {
    const ctx = await toolContext()
    const result = await executeMcpTool(ctx, 'session_list', {}, { flags: { mcpServer: true } })
    expect(result.isError).toBe(true)
    expect(textOf(result.content[0])).toMatch(/Session controller is not mounted/)
    await ctx.fiber.dispose()
  })
})

describe('McpServerService', () => {
  it('exposes the validated config through the service surface', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SystemPrompt, { personaPrefix: '' })
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(McpServerService, { flags: { mcpServer: true } })

    expect(ctx.mcpServer.isEnabled()).toBe(true)
    expect(ctx.mcpServer.config.includeSessionOps).toBe(true)
    expect(ctx.mcpServer.getTools()).toEqual([])

    const server = ctx.mcpServer.getServer()
    expect(server).toBe(ctx.mcpServer.getServer())

    await ctx.fiber.dispose()
  })

  it('rejects a misconfigured surface at plugin time', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt, { personaPrefix: '' })
    await ctx.plugin(ToolRuntime)
    await expect(ctx.plugin(McpServerService, { name: '' })).rejects.toThrow()
    await ctx.fiber.dispose()
  })

  it('creates a server instance directly through createDshMcpServer', async () => {
    const ctx = await toolContext()
    const server = createDshMcpServer(ctx, { flags: { mcpServer: true } })
    expect(server.server).toBeDefined()
    await ctx.fiber.dispose()
  })
})
