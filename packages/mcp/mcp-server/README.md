---
description: "Fenice-only standard MCP server that exposes registered DSH tools and session operations to external MCP clients."
kind: "package-reference"
---

# @deepseek-ai/dsh-mcp-server

English | [中文](README.zh.md)

## Summary

`dsh-mcp-server` publishes the harness's registered tools and session operations over the standard Model Context Protocol, so external MCP clients can drive one Fenice deployment's live tool surface without the TypeScript SDK. It is a Fenice fork addition, not an upstream harness package. The service wraps the ordinary tool registry and session controller — it registers no new model-facing tools of its own, and every call executes through the same permission and approval machinery as a native tool call.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

## Use this package
<a id="use-this-package"></a>

Mount this plugin when an external MCP client should reach Fenice's live tools; keep it unmounted when clients use the SDK or the web app.

### Minimal configuration

```yaml
- name: '@deepseek-ai/dsh-mcp-server'
  config:
    includeSessionOps: true
```

| Field | Default | Meaning |
|---|---|---|
| `includeSessionOps` | `true` | Advertise the session operations alongside the registered tools. |
| `flags.mcpServer` | `false` | Experiment gate; with the flag off the service stays inert. |

`executeTool` validates tool names against the registered tool surface and returns MCP-formatted `isError` results for refusals instead of throwing across the wire.

## Model Experience

### External MCP tool access

#### What the model sees

Nothing changes inside the harness conversation: the registered DSH tools keep their exact schemas and results, and the external MCP client receives standard tool definitions built from the same registry. Session operations, when enabled through `includeSessionOps`, expose the ordinary session-controller operations as MCP tools.

#### Token effect

Zero live-request tokens for the exposure itself. Tool calls executed by external clients enter the session log as ordinary tool events, so a resumed agent pays for their results like any other tool call.

#### KV Cache effect

None on live request prefixes; externally driven tool results append to the session exactly like native tool calls, so provider cache reuse follows the ordinary append rules.

## Known Limitations and Deferred Work
<a id="known-limitations-and-deferred-work"></a>

- The server is experimental and gated behind `flags.mcpServer`; its tool listing is not a stable public contract, and session operations add no per-operation authorization beyond the ordinary tool machinery.
- Transport options beyond the SDK defaults and a dedicated subsystems docs page are deferred until the surface stabilizes.

### Dev Note
<a id="dev-note"></a>

No runtime invariant companion is published because the server delegates every operation to the tools and session-controller services that own their own invariants.
