---
description: "仅 Fenice 提供的标准 MCP 服务器，把已注册的 DSH 工具与会话操作暴露给外部 MCP 客户端。"
kind: "package-reference"
---

# @deepseek-ai/dsh-mcp-server

[English](README.md) | 中文

## 概述

`dsh-mcp-server` 通过标准 Model Context Protocol 发布 harness 已注册的工具与会话操作，外部 MCP 客户端无需 TypeScript SDK 即可驱动一个 Fenice 部署的实时工具表面。它是 Fenice fork 的增补包，不是上游 harness 包。该服务包装普通的工具注册表与会话控制器——自身不注册任何新的面向模型的工具，且每次调用都经由与原生工具调用相同的 permission 与 approval 机制执行。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与延后事项](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

## 使用本包
<a id="use-this-package"></a>

当外部 MCP 客户端需要触达 Fenice 的实时工具时挂载本插件；客户端走 SDK 或 web 应用时保持卸载。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-mcp-server'
  config:
    includeSessionOps: true
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `includeSessionOps` | `true` | 在已注册工具之外一并通告会话操作。 |
| `flags.mcpServer` | `false` | 实验开关；关闭时服务保持惰性。 |

`executeTool` 会对照已注册的工具表面校验工具名，对拒绝返回 MCP 格式的 `isError` 结果，而不是把异常抛过 wire。

## 模型体验
<a id="model-experience"></a>

### 外部 MCP 工具访问

#### 模型看到什么

harness 会话内部没有任何变化：已注册的 DSH 工具保持其原有的 schema 与结果，外部 MCP 客户端从同一注册表获得标准工具定义。经 `includeSessionOps` 启用时，会话操作把普通的 session-controller 操作作为 MCP 工具暴露。

#### Token 影响

暴露本身不消耗任何实时请求 token。外部客户端执行的工具调用会作为普通工具事件进入会话日志，因此恢复的 agent 为其结果付出的代价与其他工具调用相同。

#### KV Cache 影响

对实时请求前缀无影响；外部驱动的工具结果与原生工具调用完全一样追加进会话，provider 缓存复用遵循普通的追加规则。

## 已知限制与延后事项
<a id="known-limitations-and-deferred-work"></a>

- 本服务器是实验性的，受 `flags.mcpServer` 门控；其工具列表不是稳定的公开契约，会话操作在普通工具机制之外不增加任何按操作的授权。
- SDK 默认之外的传输选项与专门的 subsystems 文档页，待表面稳定后再做。

### 开发备注
<a id="dev-note"></a>

不发布运行时不变量伴随物：本服务器把每个操作都委托给拥有各自不变量的 tools 与 session-controller 服务。
