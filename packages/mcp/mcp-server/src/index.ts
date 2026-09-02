/**
 * MCP Server Plugin: exposes DSH/Fenice tools and session operations via standard MCP definitions.
 * @module @deepseek-ai/dsh-mcp-server
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createDshMcpServer } from './server.ts'
import { executeMcpTool, getMcpToolDefinitions, isMcpServerEnabled } from './tools.ts'
import type { McpToolCallResult, McpToolDefinition, McpToolOptions } from './types.ts'

export type * from './types.ts'
export { createDshMcpServer } from './server.ts'
export { executeMcpTool, getMcpToolDefinitions, isMcpServerEnabled } from './tools.ts'
export { isSessionOpTool, SESSION_OPS_TOOLS } from './session-ops.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    mcpServer: McpServerService
  }
}

/**
 * Validated configuration of the MCP server surface.
 *
 * `flags.mcpServer` is a deployment-level override for the Agent-Lab switch of
 * the same name; omitting it (the default) leaves the operator's Agent-Lab
 * setting in charge, and no wire payload may assert it.
 */
export interface Config {
  /** Server name advertised during the MCP initialize handshake. */
  name?: string
  /** Server version advertised during the MCP initialize handshake. */
  version?: string
  /** Whether the standard `session_*` operations are exposed. Defaults to true. */
  includeSessionOps?: boolean
  /** Deployment override of the `mcpServer` Agent-Lab experiment switch. */
  flags?: { mcpServer?: boolean }
}

/** Cordis Service providing MCP Server integration. */
export class McpServerService extends Service {
  static inject = ['tools']

  /** Runtime schema for the MCP server surface. */
  static Config: z<Config> = z.object({
    name: z.string().min(1),
    version: z.string().min(1),
    includeSessionOps: z.boolean().default(true),
    flags: z.object({
      mcpServer: z.boolean(),
    }),
  })

  private server: McpServer | undefined

  constructor(ctx: Context, public readonly config: Config = {}) {
    super(ctx, 'mcpServer')
  }

  /** Whether the mcpServer experiment is enabled for this context. */
  isEnabled(options?: McpToolOptions): boolean {
    return isMcpServerEnabled(this.ctx, { ...this.scoped(), ...options })
  }

  /** Standard MCP tool definitions for the registered DSH tools and session operations. */
  getTools(options?: McpToolOptions): readonly McpToolDefinition[] {
    return getMcpToolDefinitions(this.ctx, { ...this.scoped(), ...options })
  }

  /**
   * Execute one tool call formatted according to standard MCP.
   * @param name - the advertised tool name.
   * @param args - unvalidated arguments as received from the client.
   * @param options - flag and cancellation overrides for this call.
   * @returns the MCP tool result; refusals and failures are `isError` results.
   */
  executeTool(
    name: string,
    args: Record<string, unknown>,
    options?: McpToolOptions,
  ): Promise<McpToolCallResult> {
    return executeMcpTool(this.ctx, name, args, { ...this.scoped(), ...options })
  }

  /** The MCP server instance for this service, created on first use. */
  getServer(): McpServer {
    this.server ??= createDshMcpServer(this.ctx, this.config)
    return this.server
  }

  /** Project the validated config onto the options every entry point shares. */
  private scoped(): McpToolOptions {
    return {
      includeSessionOps: this.config.includeSessionOps ?? true,
      ...this.config.flags === undefined ? {} : { flags: this.config.flags },
    }
  }
}

export default McpServerService
