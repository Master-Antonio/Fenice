---
description: "仅 Fenice 提供的设置分节，展示 agent-lab 实验开关及其外部 JSONL 遥测。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-agent-lab

[English](README.md) | 中文

## 概述

`ui-settings-agent-lab` 渲染 Agent Lab 设置分节：集中读取与切换部署的实验开关（Fenice 增补项，例如 tier router、self-healing loop、compaction spill 与 session truncate RPC），以及外部 JSONL 遥测文件的路径。它是 Fenice fork 的增补包，不是上游 harness 包。该分节通过普通的 settings 文档写入，因此它翻转的每个开关都由所属特性的 config schema 校验，并经该特性自己的解析路径生效。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与延后事项](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

## 使用本包
<a id="use-this-package"></a>

该分节与其他设置分节一样，经标准的 settings slot 机制挂载；除加载 client 插件外不需要单独的组合步骤。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-client-ui-settings-agent-lab'
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| — | — | 该分节读写 `agent-lab` settings namespace；不接受任何插件配置。 |

## 模型体验
<a id="model-experience"></a>

无；本分节只渲染设置文案与实验开关，不注册任何面向模型的内容。

#### KV Cache 影响

无；本包既不组装也不发送任何 provider 请求。

## 已知限制与延后事项
<a id="known-limitations-and-deferred-work"></a>

- 各开关与遥测文件路径属于实验性表面，可能在 fork 同步之间移动或退役。
- 按开关的来源说明与实时遥测预览尚未渲染。

### 开发备注
<a id="dev-note"></a>

不发布运行时不变量伴随物：本分节不拥有任何运行时关系——它只编辑一个 settings 文档，其一致性已由 settings 能力与每个开关的属主各自保证。
