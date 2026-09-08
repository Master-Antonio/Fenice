/** Session Controller truncate / rewind tests. */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent, AgentHandle, CreateAgentOptions } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import type { Session, SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import type { Workspace } from '@deepseek-ai/dsh-workspace'
import {
  createSessionTestRemote, installSessionReadTestServices,
} from './test-remote.ts'

const sid = (id: string): SessionId => id as SessionId

async function composed(
  workspaces: readonly Workspace[] = [],
  hooks: { onTruncate?: (id: SessionId, fromSeq: number) => void } = {},
): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, { personaPrefix: '' })
  await ctx.plugin(AgentRegistry)
  installSessionReadTestServices(ctx)
  ctx.provide('workspaceRegistry', { list: () => workspaces } as never)
  // Durable-truncate recorder: the command requires a backend implementing
  // the optional truncateFrom seam and refuses loudly without one. `stat`
  // reports every cold session as absent so not-found handling stays live.
  const stat = (): Promise<undefined> => Promise.resolve(undefined)
  if (hooks.onTruncate === undefined) {
    ctx.provide('sessionPersistence', { stat } as never)
  } else {
    ctx.provide('sessionPersistence', {
      stat,
      truncateFrom: (id: SessionId, fromSeq: number) => {
        hooks.onTruncate?.(id, fromSeq)
        return Promise.resolve()
      },
    } as never)
  }
  ctx.agents.setFactory({
    createAgent: async (ownerCtx: Context, options: CreateAgentOptions): Promise<AgentHandle> => {
      const session = ctx.sessions.create(options.sessionId, {
        ...options.seed === undefined ? {} : { seed: [...options.seed] },
        ...options.meta === undefined ? {} : { meta: options.meta },
      })
      const agent = {} as Agent
      const agentCtx = ownerCtx.extend({ agent })
      Object.assign(agent, { id: session.id, session, status: 'idle', ctx: agentCtx })
      await options.setup?.(agentCtx, agent)
      ctx.agents.register(agent)
      return { agent, dispose: () => Promise.resolve() }
    },
    resume: () => Promise.reject(new Error('test sources are live')),
  })
  return ctx
}

function liveAgent(
  ctx: Context,
  id: string,
  turns: number,
): Session {
  const session = ctx.sessions.create(sid(id), { meta: { cwd: '/proj' } })
  for (let turn = 1; turn <= turns; turn++) {
    session.append('turn/start', { turn })
    session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: `prompt ${String(turn)}` }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    session.append('turn/end', { turn, reason: { kind: 'completed' } })
  }
  ctx.agents.register({ id: session.id, session, status: 'idle', ctx } as Agent)
  return session
}

const remote = (ctx: Context) => createSessionTestRemote(ctx, {
  defaultModelSelection: () => ({ provider: 'default-provider', model: 'default-model' }),
  cwd: '/tmp',
})

describe('sessions.truncate', () => {
  it('rejects when flags.sessionTruncate is not enabled', async () => {
    const ctx = await composed()
    const session = liveAgent(ctx, 'session-truncate-disabled', 2)
    const res = await remote(ctx).truncate({ sessionId: session.id })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error.code).toBe('session/truncate-unavailable')
    }
    await ctx.fiber.dispose()
  })

  it('truncates to a specific turnIndex when sessionTruncate is enabled', async () => {
    const truncated: Array<{ id: SessionId; fromSeq: number }> = []
    const ctx = await composed([], { onTruncate: (id, fromSeq) => { truncated.push({ id, fromSeq }) } })
    const session = liveAgent(ctx, 'session-truncate-turn', 3)
    expect(session.snapshotEvents().length).toBe(9) // 3 turns * 3 events each

    const res = await remote(ctx).truncate({
      sessionId: session.id,
      turnIndex: 1,
      flags: { sessionTruncate: true },
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.value.sessionId).toBe(session.id)
      expect(res.value.truncatedAtSeq).toBe(3) // turn 1 starts at seq 3
    }
    expect(truncated).toEqual([{ id: session.id, fromSeq: 3 }])
    await ctx.fiber.dispose()
  })

  it('truncates to a specific atSeq when sessionTruncate is enabled', async () => {
    const truncated: Array<{ id: SessionId; fromSeq: number }> = []
    const ctx = await composed([], { onTruncate: (id, fromSeq) => { truncated.push({ id, fromSeq }) } })
    const session = liveAgent(ctx, 'session-truncate-seq', 3)

    const res = await remote(ctx).truncate({
      sessionId: session.id,
      atSeq: 6,
      flags: { sessionTruncate: true },
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.value.truncatedAtSeq).toBe(6)
    }
    expect(truncated).toEqual([{ id: session.id, fromSeq: 6 }])
    await ctx.fiber.dispose()
  })

  it('defaults to rewinding the last turn when atSeq/turnIndex is omitted', async () => {
    const truncated: Array<{ id: SessionId; fromSeq: number }> = []
    const ctx = await composed([], { onTruncate: (id, fromSeq) => { truncated.push({ id, fromSeq }) } })
    const session = liveAgent(ctx, 'session-truncate-default', 3)

    const res = await remote(ctx).truncate({
      sessionId: session.id,
      flags: { sessionTruncate: true },
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.value.truncatedAtSeq).toBe(6) // turn 3 starts at seq 6
    }
    expect(truncated).toEqual([{ id: session.id, fromSeq: 6 }])
    await ctx.fiber.dispose()
  })

  it('rejects when the persistence backend cannot truncate', async () => {
    const ctx = await composed() // stub backend without truncateFrom
    const session = liveAgent(ctx, 'session-truncate-unsupported', 2)

    const res = await remote(ctx).truncate({
      sessionId: session.id,
      flags: { sessionTruncate: true },
    })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error.code).toBe('session/truncate-unavailable')
    }
    await ctx.fiber.dispose()
  })

  it('rejects when turnIndex is out of range', async () => {
    const ctx = await composed()
    const session = liveAgent(ctx, 'session-truncate-oob', 2)

    const res = await remote(ctx).truncate({
      sessionId: session.id,
      turnIndex: 10,
      flags: { sessionTruncate: true },
    })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error.code).toBe('session/truncate-unavailable')
    }
    await ctx.fiber.dispose()
  })

  it('rejects when session is running', async () => {
    const ctx = await composed()
    const session = liveAgent(ctx, 'session-truncate-running', 2)
    const agent = ctx.agents.get(session.id)
    if (agent) {
      Object.assign(agent, { status: 'running' })
    }

    const res = await remote(ctx).truncate({
      sessionId: session.id,
      flags: { sessionTruncate: true },
    })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error.code).toBe('session/agent-busy')
    }
    await ctx.fiber.dispose()
  })

  it('rejects when session is not found', async () => {
    const ctx = await composed()
    const res = await remote(ctx).truncate({
      sessionId: sid('non-existent'),
      flags: { sessionTruncate: true },
    })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error.code).toBe('session/not-found')
    }
    await ctx.fiber.dispose()
  })
})
