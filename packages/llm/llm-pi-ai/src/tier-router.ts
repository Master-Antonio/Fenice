/**
 * Task complexity heuristics and model tier routing for Agent-Lab tierRouter.
 *
 * Evaluates request messages, system prompts, and tool configurations to categorize
 * task complexity into:
 * - 'fast' (flash/fast tier): short informational queries, simple greetings, lightweight lookups
 * - 'standard': regular dialogue, medium context without code generation or complex tools
 * - 'reasoning' (max/reasoning tier): code generation/refactoring, debugging, multi-step tool workflows,
 *   deep multi-turn reasoning, complex architecture/analysis
 *
 * @module dsh-llm-pi-ai/tier-router
 */

import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, Message } from '@deepseek-ai/dsh-llm'

export type ModelTier = 'fast' | 'standard' | 'reasoning'

export type ComplexityCategory =
  | 'informational'
  | 'standard'
  | 'code'
  | 'multi_step_tools'
  | 'deep_reasoning'

export interface TaskComplexityReport {
  tier: ModelTier
  score: number // 0 to 100
  category: ComplexityCategory
  reasons: string[]
  recommendedReasoningEffort?: ReturnType<typeof ReasoningEffortId>
  recommendedModelTier: 'flash' | 'standard' | 'max'
}

/** Regex patterns detecting code blocks, syntax, and programming constructs. */
const CODE_BLOCK_PATTERN = /```[\s\S]*?```/
const CODE_SYNTAX_PATTERN = new RegExp(
  '\\b(function\\s+\\w+|class\\s+\\w+|interface\\s+\\w+|type\\s+\\w+\\s*=|def\\s+\\w+\\(|import\\s+.*?from|'
    + 'export\\s+(default\\s+)?(class|function|const|let|var)|async\\s+function|public\\s+static\\s+void|'
    + 'SELECT\\s+.*?\\s+FROM|INSERT\\s+INTO|UPDATE\\s+.*?\\s+SET|DELETE\\s+FROM)\\b',
  'i',
)
const CODE_KEYWORDS_PATTERN = new RegExp(
  '\\b(refactor|implement|algorithm|traceback|stack\\s*trace|unit\\s*test|syntax\\s*error|type\\s*error|null\\s*pointer|'
    + 'segfault|memory\\s*leak|regex|AST|bytecode|transpile|serialize|deserialize|deadlock|race\\s*condition|concurrency|mutex)\\b',
  'i',
)

/** Regex patterns detecting multi-step reasoning, planning, or deep analysis. */
const REASONING_PATTERN = new RegExp(
  '\\b(step[- ]by[- ]step|think\\s+carefully|diagnose|troubleshoot|root\\s*cause|architect(ure)?|tradeoffs?|formal\\s*proof|'
    + 'mathematical\\s*proof|formal\\s*verification|in[- ]depth\\s+analysis|detailed\\s+breakdown|comparative\\s+analysis)\\b',
  'i',
)

/** Regex patterns detecting short greetings or direct informational lookups. */
const GREETING_PATTERN = /^(hi|hello|hey|greetings|good\s+(morning|afternoon|evening)|howdy|sup|ping|test)(\s*[!?.])?$/i
const INFORMATIONAL_LOOKUP_PATTERN = /^(what|who|where|when|which|how\s+(many|much|old))\s+(is|are|was|were|do|does|did)\b/i
const DEFINITION_PATTERN = /^(define|meaning\s+of|translate|synonym\s+for|capital\s+of|explain\s+briefly)\b/i

/** Extract all textual content from a message. */
function extractMessageText(message: Message | { content?: unknown }): string {
  if (typeof message.content === 'string') return message.content
  if (Array.isArray(message.content)) {
    return message.content
      .map((block: unknown) => {
        if (typeof block === 'string') return block
        if (block && typeof block === 'object') {
          if ('type' in block && block.type === 'text' && 'text' in block && typeof block.text === 'string') {
            return block.text
          }
          if ('type' in block && block.type === 'tool-result' && 'content' in block) {
            return extractMessageText({ content: block.content })
          }
        }
        return ''
      })
      .join('\n')
  }
  return ''
}

/** Count tool calls and tool results across conversation messages. */
function inspectToolHistory(messages: readonly (Message | { content?: unknown })[]): {
  toolCallCount: number
  toolResultCount: number
  hasToolErrors: boolean
} {
  let toolCallCount = 0
  let toolResultCount = 0
  let hasToolErrors = false

  for (const msg of messages) {
    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block && typeof block === 'object' && 'type' in block) {
          const item = block as { type?: unknown; isError?: unknown }
          if (item.type === 'tool-call') toolCallCount++
          if (item.type === 'tool-result') {
            toolResultCount++
            if (item.isError === true) hasToolErrors = true
          }
        }
      }
    }
  }

  return { toolCallCount, toolResultCount, hasToolErrors }
}

/**
 * Evaluates the task complexity of a request given its messages, tools, and context.
 *
 * @param messages - conversation messages in the request.
 * @param tools - tools available in this request.
 * @returns a structured {@link TaskComplexityReport} with score, tier, and recommendation.
 */
export function evaluateTaskComplexity(
  messages: readonly (Message | { role?: string; content?: unknown })[],
  tools?: readonly unknown[],
): TaskComplexityReport {
  let score = 50 // baseline
  const reasons: string[] = []

  // Analyze latest user/assistant messages
  const userMessages = messages.filter(m => ('role' in m ? m.role === 'user' : ('source' in m && typeof m.source === 'object' && m.source !== null && 'kind' in m.source && m.source.kind === 'user')))
  const lastUserMsg = userMessages[userMessages.length - 1]
  const lastUserText = lastUserMsg ? extractMessageText(lastUserMsg).trim() : ''

  const allText = messages.map(m => extractMessageText(m)).join('\n')
  const totalLength = allText.length

  const { toolCallCount, toolResultCount, hasToolErrors } = inspectToolHistory(messages)
  const hasTools = (tools && tools.length > 0) || toolCallCount > 0

  // Check for greetings or trivial short informational queries
  if (userMessages.length <= 1 && toolCallCount === 0) {
    if (GREETING_PATTERN.test(lastUserText)) {
      score -= 40
      reasons.push('Simple greeting detected')
    } else if (lastUserText.length < 100 && (INFORMATIONAL_LOOKUP_PATTERN.test(lastUserText) || DEFINITION_PATTERN.test(lastUserText))) {
      score -= 30
      reasons.push('Short informational query detected')
    } else if (lastUserText.length < 60 && !CODE_SYNTAX_PATTERN.test(lastUserText) && !REASONING_PATTERN.test(lastUserText)) {
      score -= 20
      reasons.push('Brief query with low contextual overhead')
    }
  }

  // Check for code generation / programming patterns
  let codeMatches = 0
  if (CODE_BLOCK_PATTERN.test(lastUserText) || CODE_BLOCK_PATTERN.test(allText)) {
    codeMatches += 25
    reasons.push('Markdown code blocks detected')
  }
  if (CODE_SYNTAX_PATTERN.test(lastUserText) || CODE_SYNTAX_PATTERN.test(allText)) {
    codeMatches += 25
    reasons.push('Programming language syntax/keywords detected')
  }
  if (CODE_KEYWORDS_PATTERN.test(lastUserText) || CODE_KEYWORDS_PATTERN.test(allText)) {
    codeMatches += 20
    reasons.push('Code modification/debugging keywords detected')
  }
  score += Math.min(codeMatches, 45)

  // Check for deep reasoning / analysis
  if (REASONING_PATTERN.test(lastUserText) || REASONING_PATTERN.test(allText)) {
    score += 30
    reasons.push('Deep reasoning / planning keywords detected')
  }

  // Check for multi-step tool workflows
  if (hasTools) {
    if (toolCallCount > 0 || toolResultCount > 0) {
      const toolBonus = Math.min(25 + toolCallCount * 5, 40)
      score += toolBonus
      reasons.push(`Multi-step tool workflow with ${toolCallCount} prior tool call(s)`)
    }
    if (hasToolErrors) {
      score += 15
      reasons.push('Prior tool execution error requires diagnosis/recovery')
    }
  }

  // Context size factor
  if (totalLength > 8000) {
    score += 15
    reasons.push(`Large context length (${totalLength} characters)`)
  } else if (totalLength < 300 && toolCallCount === 0 && !codeMatches) {
    score -= 10
  }

  // Clamp score to [0, 100]
  const clampedScore = Math.max(0, Math.min(100, score))

  let tier: ModelTier
  let category: ComplexityCategory
  let recommendedModelTier: 'flash' | 'standard' | 'max'
  let recommendedReasoningEffort: ReturnType<typeof ReasoningEffortId> | undefined

  if (clampedScore < 35) {
    tier = 'fast'
    category = 'informational'
    recommendedModelTier = 'flash'
    recommendedReasoningEffort = undefined
  } else if (clampedScore > 65) {
    tier = 'reasoning'
    if (REASONING_PATTERN.test(lastUserText) || REASONING_PATTERN.test(allText)) {
      category = 'deep_reasoning'
    } else if (toolCallCount > 0) {
      category = 'multi_step_tools'
    } else if (codeMatches > 0) {
      category = 'code'
    } else {
      category = 'deep_reasoning'
    }
    recommendedModelTier = 'max'
    recommendedReasoningEffort = ReasoningEffortId('high')
  } else {
    tier = 'standard'
    category = 'standard'
    recommendedModelTier = 'standard'
    recommendedReasoningEffort = undefined
  }

  return {
    tier,
    score: clampedScore,
    category,
    reasons,
    ...recommendedReasoningEffort !== undefined ? { recommendedReasoningEffort } : {},
    recommendedModelTier,
  }
}

/**
 * Dynamically routes or adjusts request options based on task complexity when tierRouter is active.
 *
 * @param options - input generate options.
 * @param availableModelIds - list of model IDs available on the provider route (if known).
 * @returns the adjusted generate options and the complexity report.
 */
export function routeTier(
  options: GenerateOptions,
  availableModelIds?: readonly string[],
): { options: GenerateOptions; report: TaskComplexityReport } {
  const report = evaluateTaskComplexity(options.messages, options.tools)

  let adjustedReasoningEffort = options.reasoningEffort
  let adjustedModel = options.model

  // If caller did not explicitly fix a reasoning effort, apply tier recommendation
  if (adjustedReasoningEffort === undefined && report.recommendedReasoningEffort !== undefined) {
    adjustedReasoningEffort = report.recommendedReasoningEffort
  }

  // If model candidates are available, find a matched model for the tier
  if (availableModelIds && availableModelIds.length > 1) {
    if (report.tier === 'fast') {
      const fastCandidate = availableModelIds.find(id => /flash|fast|mini|haiku|nano|lite|turbo/i.test(id))
      if (fastCandidate) adjustedModel = fastCandidate
    } else if (report.tier === 'reasoning') {
      const reasoningCandidate = availableModelIds.find(id => /r1|o1|o3|reasoner|pro|max|opus|thinking/i.test(id))
      if (reasoningCandidate) adjustedModel = reasoningCandidate
    }
  }

  return {
    options: {
      ...options,
      model: adjustedModel,
      ...adjustedReasoningEffort !== undefined ? { reasoningEffort: adjustedReasoningEffort } : {},
    },
    report,
  }
}
