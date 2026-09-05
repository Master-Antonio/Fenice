# Agent Note: 面向多 provider 的请求经济性默认值

Status: implemented

[English](2026-09-05-provider-neutral-request-economy-defaults.md) | 中文

## 问题

2026 年 9 月对本 harness 的效率审计发现：请求经济性的机制本身状态良好，但默认值让大部分价值
停留在了纸面上。工具 schema 按声明顺序序列化，结构相同的 schema 在重启与配置合并后会序列化成
不同文本，使 provider 的 prompt cache 失效；修复这一问题的 pi-ai stable-prefix 开关存在却默认
关闭；web fetch 的输出上限（200,000 字符）允许单个结果把六倍于 pi-ai wire 预算（32,768）的体量
带进会话日志；而无模型调用的工具结果修剪器只在摘要压力出现后运行，在那之前超大结果会随每个
请求一路搭车。下面每一项修复都不依赖任何厂商的定价或缓存机制——它们对每个 provider 都成立。

## 决策

改动四个默认值，让经济性开箱即用：

- **工具 schema 在 wire 层做规范化**（`packages/llm/llm-deepseek/src/serialize.ts`，经由
  `dsh-util-values` 新增的 `canonicalizeJsonValue`；pi-ai 路径早已在 stable-prefix 开关后做
  同样的事）：构建请求体时，每个 parameters 对象都按键排序重建，因此结构相同的 schema 对每个
  provider——DeepSeek、OpenAI 兼容、Anthropic、Bedrock——都序列化为相同文本，与插入顺序和
  进程生命周期无关。**持久会话日志保持声明顺序**：规范化只是一种 wire 呈现，不是格式变更，
  重放的 history 与其中的 `request/header` 事件在 harness 升级前后保持字节稳定。
- **`promptCacheStablePrefix` 默认开启**（`packages/llm/llm-pi-ai/src/lab.ts`）：排序工具块、
  规范 wire schema、归一化 CRLF 的这个开关是基线保证而非实验。保持关闭等于对从未打开
  Agent-Lab 分节的部署默默加税；该开关仍可在其中切换。
- **`DEFAULT_FETCH_MAX_OUTPUT_CHARS` 改为 32,768**（`packages/web/tool-web`），与 pi-ai 的
  wire 预算对齐。截断在源与输出两层都改为头尾保留（70/30，带省略标记）；HTML 的源截断保持
  只保留头部，因为在标记中间断开可能破坏标签匹配转换、导致整页被省略。
- **工具结果修剪器在每次自动压缩检查时运行**，而不是只在压力阈值满足后
  （`packages/compaction/compaction-basic`）：无模型调用的过程是幂等的，按步骤落地刚超限的
  结果，稳态成本是每步一次扫描、零新增事件。按步骤运行时，**最新的工具结果始终保留**——
  模型这一回合可能正要使用它（刚加载的 skill、刚读取的文件）；只有 context-overflow 恢复
  才会连最新结果一起修剪，那时最大化的缓解优先。

## 已考虑的替代方案

**在 `dsh-tools` 定义注册时或 `system-prompt` 组装时做规范化**——不采纳：规范化的形态会落入
持久的 `request/header` 事件，改变会话日志格式的字节内容，并使所有嵌入了 header 事件的已录制
fixture 失效。会话日志保持声明顺序；规范化位于各 adapter 的 wire 序列化层——重放永远看不到的
呈现层。PTC SDK 投影（`sdkSchemas`）同样保持不动：其渲染的 TypeScript 成员顺序按构建是稳定的，
重渲染会为纯粹的装饰性收益移动所有 PTC golden。

**把 fetch 上限仅做成 provider/工具级可配置**——上限本来就是配置项（`fetchMaxOutputChars`），
本次只改默认值；想要旧行为的部署离一行 `config:` 就能拿回来。

**给按步骤修剪再加一个配置开关**——修剪器的挂载本身就是 opt-in；再加一个开关只会制造"修剪器
已挂载却在压力之下才生效"的状态，而这正是本次改动要移除的行为。

## 后果

- provider prompt cache 的命中率不再依赖声明顺序的稳定性，覆盖每一个在 wire 体上做规范化的
  adapter（DeepSeek 原生，pi-ai 经由现已默认开启的 stable-prefix 开关）。
- 20 万字符的 fetch 体在日志中只落约 8k token 而非约 5 万；文本体保留结尾（尾部），旧截断会把
  上限之后的一切丢掉。
- 有大工具结果的会话按步骤削减体量，不需要任何摘要请求，同时最新的结果保持原样；摘要路径仍是
  最后阶段的工具，只是更少被需要。
- Agent-Lab 分节默认开启的集合现为 {cascadeMetrics, turnTelemetry, promptCacheStablePrefix}；
  已切换开关的部署不受影响，新部署开箱即得这套经济性。
