import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import SessionStore from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import LlmRuntime, { createUserMessage } from '@deepseek-ai/dsh-llm'
import ToolRuntime, { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { SettingsProvider, type SettingsNamespace } from '@deepseek-ai/dsh-settings'
import { MockAdapter, textResponse, toolCallResponse } from './mock-adapter.ts'

/** Match user/message events injected by the self-healing loop plugin. */
function isSelfHealingDiagnosis(event: SessionEvent): boolean {
  if (event.type !== 'user/message') return false
  const source = (event.data as { source?: { kind?: string; plugin?: string } }).source
  return source?.kind === 'plugin' && source?.plugin === 'self-healing-loop'
}

/** First text block of a self-healing diagnosis message payload. */
function diagnosisText(event: SessionEvent): string {
  const content = (event.data as { content?: Array<{ type?: string; text?: string }> }).content
  return content?.[0]?.text ?? ''
}

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
  await ctx.plugin(SystemPrompt, { personaPrefix: '' })
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

function events(agent: Agent): SessionEvent[] {
  return [...agent.session.snapshotEvents()]
}

describe('selfHealingLoop in agent loop', () => {
  it('does not trigger self-healing retry when flags.selfHealingLoop is false', async () => {
    let callCount = 0
    const adapter = new MockAdapter([
      // Step 1: Model calls tool which fails
      toolCallResponse('c1', 'exec_tool', { input: 'bad' }),
    ])
    const ctx = await harness(adapter)

    ctx.tools.register(defineContentToolFixture({
      name: 'exec_tool',
      description: 'exec tool',
      parameters: { input: { type: 'string', required: true } },
      async execute(args) {
        callCount++
        throw new Error(`Execution failed for input ${args.input}`)
      },
    }))

    const agent = await ctx.agentLoop.create(SessionId('a-no-heal'), {
      provider: 'mock',
      model: 'mock',
      flags: { selfHealingLoop: false },
    })

    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'run tool' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)

    expect(callCount).toBe(1)
    const log = events(agent)
    // No self-healing diagnosis message should be present in the user/messages
    const healingMessages = log.filter(e => e.type === 'user/message' && isSelfHealingDiagnosis(e))
    expect(healingMessages).toHaveLength(0)
    // Turn finishes
    expect(log.some(e => e.type === 'turn/end')).toBe(true)
  })

  it('triggers self-healing diagnosis step when a tool errors and model fixes it on retry', async () => {
    let callCount = 0
    const adapter = new MockAdapter([
      // Step 1: Model calls tool with bad arg
      toolCallResponse('c1', 'failing_tool', { cmd: 'wrong_param' }),
      // Step 2: Model receives tool error + self-healing diagnosis prompt, and issues corrected tool call
      toolCallResponse('c2', 'failing_tool', { cmd: 'correct_param' }),
      // Step 3: Model sees successful tool result and completes
      textResponse('Tool executed successfully with correct_param'),
    ])
    const ctx = await harness(adapter)

    ctx.tools.register(defineContentToolFixture({
      name: 'failing_tool',
      description: 'tool that fails on wrong_param',
      parameters: { cmd: { type: 'string', required: true } },
      async execute(args) {
        callCount++
        if (args.cmd === 'wrong_param') {
          throw new Error('Invalid parameter wrong_param')
        }
        return [{ type: 'text', text: `Success with ${args.cmd}` }]
      },
    }))

    const agent = await ctx.agentLoop.create(SessionId('a-heal-success'), {
      provider: 'mock',
      model: 'mock',
      flags: { selfHealingLoop: true },
    })

    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'run failing tool' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)

    expect(callCount).toBe(2)
    const log = events(agent)
    // Check that self-healing diagnosis message was injected into session
    const healingMessages = log.filter(isSelfHealingDiagnosis)
    expect(healingMessages).toHaveLength(1)
    const diagnosisContent = diagnosisText(healingMessages[0]!)
    expect(diagnosisContent).toContain('[Self-Healing Diagnosis]')
    expect(diagnosisContent).toContain('Tool "failing_tool" failed')
    expect(diagnosisContent).toContain('Attempt 1/3')

    // Verify turn ended cleanly with stop reason
    const turnEnd = log.find(e => e.type === 'turn/end')
    expect(turnEnd).toBeDefined()
    expect(turnEnd!.data.reason).toEqual({ kind: 'completed' })
  })

  it('bounds self-healing retries up to maxSelfHealingRetries when tool continuously fails', async () => {
    let callCount = 0
    const adapter = new MockAdapter([
      // Step 1: Initial call
      toolCallResponse('c1', 'always_fails', { attempt: 1 }),
      // Step 2: Retry 1 (self-healing attempt 1)
      toolCallResponse('c2', 'always_fails', { attempt: 2 }),
      // Step 3: Retry 2 (self-healing attempt 2)
      toolCallResponse('c3', 'always_fails', { attempt: 3 }),
    ])
    const ctx = await harness(adapter)

    ctx.tools.register(defineContentToolFixture({
      name: 'always_fails',
      description: 'always failing tool',
      parameters: { attempt: { type: 'number', required: true } },
      async execute(args) {
        callCount++
        throw new Error(`disk full on attempt ${args.attempt}`)
      },
    }))

    const agent = await ctx.agentLoop.create(SessionId('a-heal-bounded'), {
      provider: 'mock',
      model: 'mock',
      flags: { selfHealingLoop: true },
      maxSelfHealingRetries: 2, // limit to 2 retries
    })

    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'start task' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)

    // Initial call (1) + retry 1 (2) + retry 2 (3) = 3 total tool calls
    expect(callCount).toBe(3)

    const log = events(agent)
    const healingMessages = log.filter(isSelfHealingDiagnosis)
    // Exactly 2 self-healing retry prompts injected before capping out
    expect(healingMessages).toHaveLength(2)
    expect(diagnosisText(healingMessages[0]!)).toContain('Attempt 1/2')
    expect(diagnosisText(healingMessages[1]!)).toContain('Attempt 2/2')

    // Turn concludes after exhausting retries
    const turnEnd = log.find(e => e.type === 'turn/end')
    expect(turnEnd).toBeDefined()
  })

  it('can be enabled dynamically via agent-lab settings namespace', async () => {
    let callCount = 0
    const adapter = new MockAdapter([
      toolCallResponse('c1', 'lab_tool', {}),
      textResponse('resolved after diagnosis'),
    ])
    const ctx = await harness(adapter)

    // Register agent-lab settings section with selfHealingLoop: true
    ctx.settings.register('agent-lab', z.object({
      selfHealingLoop: z.boolean().default(false),
    }), { base: { selfHealingLoop: true } })

    ctx.tools.register(defineContentToolFixture({
      name: 'lab_tool',
      description: 'lab tool',
      parameters: {},
      async execute() {
        callCount++
        throw new Error('socket timeout')
      },
    }))

    const agent = await ctx.agentLoop.create(SessionId('a-lab-settings'), {
      provider: 'mock',
      model: 'mock',
    })

    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'run lab test' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)

    expect(callCount).toBe(1)
    const log = events(agent)
    const healingMessages = log.filter(isSelfHealingDiagnosis)
    expect(healingMessages).toHaveLength(1)
  })
})
