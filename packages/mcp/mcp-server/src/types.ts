/**
 * Standard MCP Server types and definitions for DSH/Fenice tools and session operations.
 * @module @deepseek-ai/dsh-mcp-server/types
 */

import type { ScopeKey } from '@deepseek-ai/dsh-scope'

/** Feature flags for the MCP server. */
export interface McpServerFlags {
  readonly mcpServer?: boolean
}

/** Standard Model Context Protocol Tool Definition. */
export interface McpToolDefinition {
  readonly name: string
  readonly description?: string
  readonly inputSchema: {
    readonly type: 'object'
    readonly properties?: Readonly<Record<string, unknown>>
    readonly required?: readonly string[]
    readonly [key: string]: unknown
  }
}

/**
 * MCP tool call content block. Only the two shapes this package actually
 * produces are declared: an `embedded resource` block would need a durable
 * resource URI vocabulary the harness does not own yet.
 */
export type McpContentBlock =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'image'; readonly data: string; readonly mimeType: string }

/** Standard MCP tool call response shape. */
export interface McpToolCallResult {
  readonly content: readonly McpContentBlock[]
  readonly isError?: boolean
}

/** Options for tool listing and execution. */
export interface McpToolOptions {
  readonly scope?: ScopeKey
  readonly includeSessionOps?: boolean
  readonly flags?: McpServerFlags
  readonly signal?: AbortSignal
}

/** MCP Server Configuration. */
export interface McpServerConfig {
  readonly name?: string
  readonly version?: string
  readonly includeSessionOps?: boolean
  readonly flags?: McpServerFlags
}
