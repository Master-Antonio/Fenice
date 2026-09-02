import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import SessionStore from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import LlmRuntime, { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { SettingsProvider, type SettingsNamespace } from '@deepseek-ai/dsh-settings'
import { evaluateTaskComplexity } from '../src/tier-router.ts'
import { MockAdapter, textResponse } from './mock-adapter.ts'

class MemorySettings extends SettingsProvider {
  doc: Record<string, unknown> = {}
  get writable(): boolean { return true }
  protected load(): Promise<Record<string, unknown>> {
    return Promise.resolve(structuredClone(this.doc))
  }
  protected persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    this.doc = { ...this.doc, [ns]: structuredClone(section) }
    return Promise.resolve()
  }
}

async function harness(adapter: MockAdapter, loopConfig: object = {}) {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt, { persona: '' })
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  const settings = ctx.plugin(MemorySettings)
  await settings.await()
  await ctx.plugin(AgentLoop, {
    agents: [],
    ...loopConfig,
  })
  ctx.llm.registerAdapter(['mock'], adapter)
  return ctx
}

function waitForIdle(ctx: Context, agent: Agent): Promise<void> {
  return new Promise((resolve) => {
    const dispose = ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject === agent && status === 'idle') { dispose(); resolve() }
    })
  })
}

describe('agent-loop tierRouter task complexity evaluation', () => {
  it('identifies fast queries and complex code generation', () => {
    const fastMsg = createUserMessage({
      content: [{ type: 'text', text: 'Hello, how are you today?' }],
      source: { kind: 'user' },
    })
    const fastReport = evaluateTaskComplexity([fastMsg])
    expect(fastReport.tier).toBe('fast')

    const codeMsg = createUserMessage({
      content: [{
        type: 'text',
        text: 'Refactor this JavaScript algorithm to be non-recursive and optimize runtime:\n```js\nfunction fib(n) { return n <= 1 ? n : fib(n-1) + fib(n-2); }\n```',
      }],
      source: { kind: 'user' },
    })
    const codeReport = evaluateTaskComplexity([codeMsg])
    expect(codeReport.tier).toBe('reasoning')
    expect(codeReport.recommendedReasoningEffort).toEqual(ReasoningEffortId('high'))
  })
})

describe('ReactLoopAgent tierRouter dynamic reasoning routing', () => {
  it('applies elevated reasoning effort when tierRouter is enabled on a complex code task', async () => {
    const adapter = new MockAdapter([
      textResponse('Here is the refactored code'),
    ], {
      efforts: [
        { id: ReasoningEffortId('low'), name: 'Low' },
        { id: ReasoningEffortId('high'), name: 'High' },
      ],
    })
    const ctx = await harness(adapter)

    const agent = await ctx.agentLoop.create(SessionId('a-tier-agent'), {
      provider: 'mock',
      model: 'mock',
      flags: { tierRouter: true },
    })

    agent.followup(createUserMessage({
      content: [{
        type: 'text',
        text: 'Implement a binary search tree in TypeScript with full type definitions and deleteNode method:\n```ts\nclass BST {}\n```',
      }],
      source: { kind: 'user' },
    }))

    await waitForIdle(ctx, agent)

    expect(adapter.requests).toHaveLength(1)
    expect(adapter.requests[0]!.reasoningEffort).toEqual(ReasoningEffortId('high'))
  })

  it('keeps baseline reasoning effort when tierRouter is disabled', async () => {
    const adapter = new MockAdapter([
      textResponse('Code written'),
    ], {
      efforts: [
        { id: ReasoningEffortId('low'), name: 'Low' },
        { id: ReasoningEffortId('high'), name: 'High' },
      ],
    })
    const ctx = await harness(adapter)

    const agent = await ctx.agentLoop.create(SessionId('a-no-tier-agent'), {
      provider: 'mock',
      model: 'mock',
      flags: { tierRouter: false },
    })

    agent.followup(createUserMessage({
      content: [{
        type: 'text',
        text: 'Implement a binary search tree in TypeScript:\n```ts\nclass BST {}\n```',
      }],
      source: { kind: 'user' },
    }))

    await waitForIdle(ctx, agent)

    expect(adapter.requests).toHaveLength(1)
    // When tierRouter is false and no effort was explicitly configured, reasoningEffort is not elevated
    expect(adapter.requests[0]!.reasoningEffort).toBeUndefined()
  })
})
