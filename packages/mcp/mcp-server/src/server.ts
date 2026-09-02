/**
 * Standard Model Context Protocol (MCP) Server factory.
 * @module @deepseek-ai/dsh-mcp-server/server
 */

import type { Context } from '@deepseek-ai/cordis'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js'
import { executeMcpTool, getMcpToolDefinitions } from './tools.ts'
import type { McpServerConfig, McpToolOptions } from './types.ts'

/** Default identity advertised during the MCP initialize handshake. */
const DEFAULT_SERVER_NAME = 'fenice-mcp-server'
/** Protocol-facing server version, matching the sibling `dsh-mcp-client` convention. */
const DEFAULT_SERVER_VERSION = '0.0.1'

/**
 * Project the config onto the listing/execution options both handlers share, so
 * one server cannot advertise a surface its call handler then refuses.
 */
function optionsOf(config: McpServerConfig): McpToolOptions {
  return {
    includeSessionOps: config.includeSessionOps ?? true,
    ...config.flags === undefined ? {} : { flags: config.flags },
  }
}

/**
 * Create a standard MCP Server exposing DSH tools and session operations.
 *
 * The low-level request handlers are installed directly rather than through
 * `registerTool`, because DSH tools carry raw JSON Schema parameters while
 * `registerTool` accepts only Zod shapes — round-tripping them would add a
 * second schema dialect the tool registry does not own.
 * @param ctx - Cordis context with the harness services.
 * @param config - server identity and feature flags.
 * @returns the configured MCP server, ready for `connect(transport)`.
 */
export function createDshMcpServer(
  ctx: Context,
  config: McpServerConfig = {},
): McpServer {
  const server = new McpServer(
    { name: config.name ?? DEFAULT_SERVER_NAME, version: config.version ?? DEFAULT_SERVER_VERSION },
    { capabilities: { tools: {} } },
  )

  server.server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: getMcpToolDefinitions(ctx, optionsOf(config)) as Tool[],
  }))

  server.server.setRequestHandler(CallToolRequestSchema, async (request, extra): Promise<CallToolResult> => {
    const result = await executeMcpTool(
      ctx,
      request.params.name,
      request.params.arguments ?? {},
      { ...optionsOf(config), signal: extra.signal },
    )
    return {
      content: [...result.content],
      ...result.isError === undefined ? {} : { isError: result.isError },
    }
  })

  return server
}
