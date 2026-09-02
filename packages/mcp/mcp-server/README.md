---
description: "Fenice-only standard MCP server that exposes registered DSH tools and session operations to external MCP clients."
kind: "package-reference"
---

# @deepseek-ai/dsh-mcp-server

## Summary

`dsh-mcp-server` publishes the harness's registered tools and session operations over the standard Model Context Protocol, so external MCP clients can drive one Fenice deployment's live tool surface without the TypeScript SDK. It is a Fenice fork addition, not an upstream harness package. The service wraps the ordinary tool registry and session controller — it registers no new model-facing tools of its own, and every call executes through the same permission and approval machinery as a native tool call. No runtime invariant companion is published because the server delegates every operation to the tools and session-controller services that own their own invariants.

## Configuration

```yaml
- name: '@deepseek-ai/dsh-mcp-server'
  config:
    includeSessionOps: true
```

`flags.mcpServer` gates the experiment; with the flag off the service stays inert. `executeTool` validates tool names against the registered tool surface and returns MCP-formatted `isError` results for refusals instead of throwing across the wire.

## Model Experience

The model's tool surface is unchanged: this package exposes the already-registered DSH tools and session operations to external MCP clients under their standard names. Session operations are opt-in through `includeSessionOps`, and every executed call keeps the host's permission, approval, and audit behavior.
