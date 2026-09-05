import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMessage, createUserMessage, ReasoningEffortId, ToolCallId, type Message as LlmMessage } from '@deepseek-ai/dsh-llm'
import * as LlmPiAi from '@deepseek-ai/dsh-llm-pi-ai'
import { evaluateTaskComplexity, routeTier } from '../src/tier-router.ts'
import { resolveProfiles } from '../src/config.ts'
import { memoryAuth } from './auth-double.ts'
import { closeMockServers, mockServer, textEvents } from './mock-server.ts'

describe('tierRouter task complexity evaluation', () => {
  it('classifies simple greetings and short informational queries as fast tier', () => {
    const greetingMsg = createUserMessage({
      content: [{ type: 'text', text: 'Hello!' }],
      source: { kind: 'user' },
    })
    const greetingReport = evaluateTaskComplexity([greetingMsg])
    expect(greetingReport.tier).toBe('fast')
    expect(greetingReport.category).toBe('informational')
    expect(greetingReport.recommendedModelTier).toBe('flash')
    expect(greetingReport.score).toBeLessThan(35)

    const questionMsg = createUserMessage({
      content: [{ type: 'text', text: 'What is the capital of France?' }],
      source: { kind: 'user' },
    })
    const questionReport = evaluateTaskComplexity([questionMsg])
    expect(questionReport.tier).toBe('fast')
    expect(questionReport.category).toBe('informational')
    expect(questionReport.recommendedModelTier).toBe('flash')
  })

  it('classifies code generation and debugging queries as reasoning tier', () => {
    const codeMsg = createUserMessage({
      content: [{
        type: 'text',
        text: 'Write a TypeScript function to balance an AVL binary tree and handle rotations:\n```ts\nfunction rotateLeft(node: Node): Node {}\n```',
      }],
      source: { kind: 'user' },
    })
    const codeReport = evaluateTaskComplexity([codeMsg])
    expect(codeReport.tier).toBe('reasoning')
    expect(codeReport.category).toBe('code')
    expect(codeReport.recommendedModelTier).toBe('max')
    expect(codeReport.recommendedReasoningEffort).toEqual(ReasoningEffortId('high'))
    expect(codeReport.score).toBeGreaterThan(65)
  })

  it('classifies multi-step tool workflows with prior tool calls as reasoning tier', () => {
    const messages: LlmMessage[] = [
      createUserMessage({ content: [{ type: 'text', text: 'Analyze the codebase and run tests' }], source: { kind: 'user' } }),
      createMessage({
        role: 'assistant',
        content: [
          { type: 'tool-call', id: ToolCallId('c1'), name: 'run_tests', arguments: '{}' },
        ],
        source: { kind: 'model', provider: 'mock', model: 'mock' },
      }),
      createUserMessage({
        content: [
          { type: 'tool-result', toolCallId: ToolCallId('c1'), content: [{ type: 'text', text: 'FAIL: test_crypto_engine' }], isError: true },
        ],
        source: { kind: 'user' },
      }),
    ]

    const report = evaluateTaskComplexity(messages, [{ name: 'run_tests' }, { name: 'edit_file' }])
    expect(report.tier).toBe('reasoning')
    expect(report.category).toBe('multi_step_tools')
    expect(report.recommendedModelTier).toBe('max')
    expect(report.reasons.some(r => r.includes('Multi-step tool workflow'))).toBe(true)
    expect(report.reasons.some(r => r.includes('Prior tool execution error'))).toBe(true)
  })

  it('classifies deep reasoning and architectural questions as reasoning tier', () => {
    const reasoningMsg = createUserMessage({
      content: [{
        type: 'text',
        text: 'Please think carefully step-by-step and diagnose the root cause of this distributed deadlock with formal proof and detailed analysis.',
      }],
      source: { kind: 'user' },
    })
    const report = evaluateTaskComplexity([reasoningMsg])
    expect(report.tier).toBe('reasoning')
    expect(report.category).toBe('deep_reasoning')
    expect(report.recommendedModelTier).toBe('max')
  })

  it('classifies moderate conversational requests as standard tier', () => {
    const standardMsg = createUserMessage({
      content: [{
        type: 'text',
        text: 'Can you draft a friendly email invite to our team lunch next Wednesday at noon?',
      }],
      source: { kind: 'user' },
    })
    const report = evaluateTaskComplexity([standardMsg])
    expect(report.tier).toBe('standard')
    expect(report.category).toBe('standard')
    expect(report.recommendedModelTier).toBe('standard')
  })
})

describe('tierRouter routeTier dynamic model & effort selection', () => {
  it('selects flash model for fast tasks when available models list candidate', () => {
    const options = {
      provider: 'openai',
      model: 'gpt-4o',
      messages: [createUserMessage({ content: [{ type: 'text', text: 'Hello' }], source: { kind: 'user' } })],
    }
    const available = ['gpt-4o', 'gpt-4o-mini', 'o3-mini']
    const result = routeTier(options, available)
    expect(result.report.tier).toBe('fast')
    expect(result.options.model).toBe('gpt-4o-mini')
  })

  it('selects reasoning model and effort for code/reasoning tasks', () => {
    const options = {
      provider: 'openai',
      model: 'gpt-4o-mini',
      messages: [createUserMessage({
        content: [{ type: 'text', text: 'Refactor this algorithm in TypeScript:\n```ts\nfunction sort() {}\n```' }],
        source: { kind: 'user' },
      })],
    }
    const available = ['gpt-4o-mini', 'gpt-4o', 'o3-mini']
    const result = routeTier(options, available)
    expect(result.report.tier).toBe('reasoning')
    expect(result.options.model).toBe('o3-mini')
    expect(result.options.reasoningEffort).toEqual(ReasoningEffortId('high'))
  })

  it('preserves caller-explicit reasoningEffort override', () => {
    const options = {
      provider: 'openai',
      model: 'gpt-4o',
      reasoningEffort: ReasoningEffortId('low'),
      messages: [createUserMessage({
        content: [{ type: 'text', text: 'Refactor this class: ```ts\nclass A{}\n```' }],
        source: { kind: 'user' },
      })],
    }
    const result = routeTier(options, ['gpt-4o', 'o3-mini'])
    expect(result.options.reasoningEffort).toEqual(ReasoningEffortId('low'))
  })
})

describe('PiAiAdapter with tierRouter flag in stream and telemetry', () => {
  afterEach(async () => {
    await closeMockServers()
    vi.unstubAllEnvs()
  })

  it('evaluates complexity and records tier in telemetry when tierRouter is enabled', async () => {
    vi.stubEnv('TEST_TIER_KEY', 'test-key')
    const server = await mockServer([{ events: textEvents }])
    const turns: Array<Record<string, unknown>> = []

    const adapter = new LlmPiAi.PiAiAdapter({
      profiles: () => resolveProfiles({
        main: {
          api: 'openai-completions',
          baseURL: `${server.url}/v1`,
          apiKeyEnv: 'TEST_TIER_KEY',
          models: [{
            id: 'deepseek-chat',
            reasoningEfforts: { off: null, high: 'high', max: 'max' },
          }],
        },
      }),
      resolveApiKey: () => Promise.resolve('test-key'),
      auth: memoryAuth(),
      labFlags: () => ({
        circuitBreaker: false,
        cascadeMetrics: false,
        turnTelemetry: true,
        promptCacheStablePrefix: false,
        compactionPointer: false,
        tierRouter: true,
        sessionTruncate: false,
        mcpServer: false,
        semanticMemory: false,
        selfHealingLoop: false,
      }),
      onTurnTelemetry: (detail) => { turns.push(detail) },
    })

    // 1. Fast query
    for await (const _chunk of adapter.stream({
      provider: 'main',
      model: 'deepseek-chat',
      messages: [createUserMessage({ content: [{ type: 'text', text: 'Hi!' }], source: { kind: 'user' } })],
    })) {}

    expect(turns.length).toBe(1)
    expect(turns[0]!.tier).toBe('fast')
    expect(typeof turns[0]!.tierScore).toBe('number')
    expect(turns[0]!.tierScore).toBeLessThan(35)

    // 2. Code query
    for await (const _chunk of adapter.stream({
      provider: 'main',
      model: 'deepseek-chat',
      messages: [createUserMessage({
        content: [{ type: 'text', text: 'Write a quicksort implementation in Python:\n```python\ndef quicksort(arr):\n  pass\n```' }],
        source: { kind: 'user' },
      })],
    })) {}

    expect(turns.length).toBe(2)
    expect(turns[1]!.tier).toBe('reasoning')
    expect(turns[1]!.tierScore).toBeGreaterThan(65)
  })
})
