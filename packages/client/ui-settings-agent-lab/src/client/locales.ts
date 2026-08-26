/** Copy dictionaries for the Agent Lab settings section. */

/** Key union: zh is the source of truth, en is checked complete against it. */
export const en = {
  nav: 'Agent Lab',
  title: 'Agent Lab — experimental switches',
  description: 'Experimental switches for the coding agent. Meters write to the external Agent-Lab directory (~/.dsh-agent-lab/telemetry).',
  metersNote: 'The two meters stay on by default: they collect the before/after evidence.',
  comingSoon: 'coming soon',
  flagCircuitBreaker: 'Circuit breaker — skip a failing provider after repeated quick failures',
  flagCascadeMetrics: 'Cascade metrics — record every fallback hop to external telemetry',
  flagTurnTelemetry: 'Turn telemetry — per-turn tokens, cache reads, latency, outcome',
  flagPromptCacheStablePrefix: 'Stable request prefix — deterministic tool order for provider cache hits',
  flagCompactionPointer: 'Compaction pointer — link truncated tool outputs to their full copy',
  flagTierRouter: 'Tier router — match task difficulty to model cost',
  flagSessionTruncate: 'Session truncate — true in-place rewind/delete',
  flagMcpServer: 'MCP server — expose sessions/tools over MCP',
  flagSemanticMemory: 'Semantic memory — meaning-based search over past sessions',
  flagSelfHealingLoop: 'Self-healing loop — bounded reproduce/fix/retest',
} as const

export type AgentLabKey = keyof typeof en

export const NS = 'settings.agentLab'

export const zh: Record<AgentLabKey, string> = {
  nav: 'Agent 实验室',
  title: 'Agent 实验室 —— 实验开关',
  description: '编码代理的实验开关。计量数据写入外部 Agent-Lab 目录（~/.dsh-agent-lab/telemetry）。',
  metersNote: '两个计量项默认开启：它们负责采集前后对比的证据。',
  comingSoon: '即将推出',
  flagCircuitBreaker: '熔断器——连续快速失败时跳过该提供方',
  flagCascadeMetrics: '级联指标——将每次回退跳转写入外部遥测',
  flagTurnTelemetry: '回合遥测——每回合 token、缓存命中、延迟与结果',
  flagPromptCacheStablePrefix: '稳定请求前缀——工具顺序确定化以提升提供方缓存命中',
  flagCompactionPointer: '压缩指针——将截断的工具输出链接到完整副本',
  flagTierRouter: '分层路由——按任务难度匹配模型成本',
  flagSessionTruncate: '会话截断——原位回退/删除',
  flagMcpServer: 'MCP 服务器——通过 MCP 暴露会话与工具',
  flagSemanticMemory: '语义记忆——按语义检索历史会话',
  flagSelfHealingLoop: '自愈循环——有界的复现/修复/重测',
}
