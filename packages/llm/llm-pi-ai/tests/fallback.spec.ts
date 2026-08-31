import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Message as LlmMessage } from '@deepseek-ai/dsh-llm'
import * as LlmPiAi from '@deepseek-ai/dsh-llm-pi-ai'
import { assemble } from './assemble.ts'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { closeMockServers, mockServer, textEvents } from './mock-server.ts'
import { resolveProfiles } from '../src/config.ts'
import { memoryAuth } from './auth-double.ts'

/** A role-opening delta followed by one visible token, no terminal event. */
const truncatedAfterTokenEvents = [
  '{"choices":[{"delta":{"role":"assistant","content":""},"index":0,"finish_reason":null}]}',
  '{"choices":[{"delta":{"content":"hello"},"index":0,"finish_reason":null}]}',
]

describe('PiAiAdapter fallback cascade', () => {
  afterEach(async () => {
    await closeMockServers()
    vi.unstubAllEnvs()
  })

  it('cascades to fallback provider when primary provider fails on initial stream', async () => {
    vi.stubEnv('PI_FALLBACK_PRIMARY_KEY', 'test-primary')
    vi.stubEnv('PI_FALLBACK_SECONDARY_KEY', 'test-secondary')
    const primaryServer = await mockServer([{
      status: 429,
      // The flattened provider message must carry a transient signature for
      // the eligibility allow-list (RATE_LIMIT here, never quota wording).
      body: JSON.stringify({ error: { message: 'Rate limit reached (429): too many concurrent requests' } }),
    }])

    const fallbackServer = await mockServer([{
      events: textEvents,
    }])

    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(LlmPiAi, {
      providers: {
        primary: {
          api: 'openai-completions',
          baseURL: `${primaryServer.url}/v1`,
          apiKeyEnv: 'PI_FALLBACK_PRIMARY_KEY',
          models: [{ id: 'primary-model' }],
          fallbackProvider: 'secondary',
          fallbackModel: 'fallback-model',
        },
        secondary: {
          api: 'openai-completions',
          baseURL: `${fallbackServer.url}/v1`,
          apiKeyEnv: 'PI_FALLBACK_SECONDARY_KEY',
          models: [{ id: 'fallback-model' }],
        },
      },
    })

    const result = await assemble(ctx, {
      provider: 'primary',
      model: 'primary-model',
      messages: [createUserMessage({
        content: [{ type: 'text', text: 'hello' }],
        source: { kind: 'plugin', plugin: 'test' },
      })],
    })

    expect(result.message.content).toEqual([{ type: 'text', text: 'hello' }])
    expect(result.finish).toEqual({ kind: 'stop' })
    expect(primaryServer.requests.length).toBeGreaterThanOrEqual(1)
    expect(fallbackServer.requests.length).toBe(1)
  })

  it('never restarts an answer after the fallback itself fails mid-stream', async () => {
    vi.stubEnv('PI_FALLBACK_PRIMARY_KEY', 'test-primary')
    vi.stubEnv('PI_FALLBACK_SECONDARY_KEY', 'test-secondary')
    const primaryServer = await mockServer([{
      status: 503,
      body: JSON.stringify({ error: { message: 'Service Unavailable' } }),
    }])
    // One scripted response that streams a token and then dies mid-wire
    // (no terminal event): the delegated attempt fails AFTER yielding, which
    // is exactly where a naive cascade would restart the answer.
    const fallbackServer = await mockServer([
      { events: truncatedAfterTokenEvents },
      { events: textEvents },
    ])

    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(LlmPiAi, {
      providers: {
        primary: {
          api: 'openai-completions',
          baseURL: `${primaryServer.url}/v1`,
          apiKeyEnv: 'PI_FALLBACK_PRIMARY_KEY',
          models: [{ id: 'primary-model' }],
          fallbackProvider: 'secondary',
          fallbackModel: 'fallback-model',
        },
        secondary: {
          api: 'openai-completions',
          baseURL: `${fallbackServer.url}/v1`,
          apiKeyEnv: 'PI_FALLBACK_SECONDARY_KEY',
          models: [{ id: 'fallback-model' }],
        },
      },
    })

    const chunks: StreamChunk[] = []
    let threw: unknown
    try {
      for await (const chunk of ctx.llm.stream({
        provider: 'primary',
        model: 'primary-model',
        messages: [createUserMessage({
          content: [{ type: 'text', text: 'hello' }],
          source: { kind: 'plugin', plugin: 'test' },
        })],
      })) chunks.push(chunk)
    } catch (error) {
      threw = error
    }

    // The streamed token reached the consumer EXACTLY once, the failed hop
    // was not retried, and the turn ended in a terminal error — either thrown
    // by the runtime or delivered as the final error finish chunk.
    const hellos = chunks.filter(chunk => chunk.type === 'text-delta' && chunk.text.includes('hello'))
    expect(hellos).toHaveLength(1)
    const last = chunks[chunks.length - 1]
    const terminalError = threw !== undefined
      || (last?.type === 'finish' && last.reason.kind === 'error')
    expect(terminalError).toBe(true)
    expect(fallbackServer.requests.length).toBe(1)
  })

  it('does not cascade on non-transient failures (invalid request)', async () => {
    vi.stubEnv('PI_FALLBACK_PRIMARY_KEY', 'test-primary')
    vi.stubEnv('PI_FALLBACK_SECONDARY_KEY', 'test-secondary')
    const primaryServer = await mockServer([{
      status: 400,
      body: JSON.stringify({ error: { message: 'Invalid request: unsupported parameter', code: 'invalid_request_error' } }),
    }])
    const fallbackServer = await mockServer([{ events: textEvents }])

    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(LlmPiAi, {
      providers: {
        primary: {
          api: 'openai-completions',
          baseURL: `${primaryServer.url}/v1`,
          apiKeyEnv: 'PI_FALLBACK_PRIMARY_KEY',
          models: [{ id: 'primary-model' }],
          fallbackProvider: 'secondary',
          fallbackModel: 'fallback-model',
        },
        secondary: {
          api: 'openai-completions',
          baseURL: `${fallbackServer.url}/v1`,
          apiKeyEnv: 'PI_FALLBACK_SECONDARY_KEY',
          models: [{ id: 'fallback-model' }],
        },
      },
    })

    const result = await assemble(ctx, {
      provider: 'primary',
      model: 'primary-model',
      messages: [createUserMessage({
        content: [{ type: 'text', text: 'hello' }],
        source: { kind: 'plugin', plugin: 'test' },
      })],
    })

    // The same payload would be invalid everywhere: no hop, loud terminal error.
    expect(result.finish).toMatchObject({ kind: 'error', failure: { code: 'INVALID_REQUEST' } })
    expect(fallbackServer.requests.length).toBe(0)
  })

  it('rejects a self-referencing fallback route at registration', async () => {
    const server = await mockServer([{ events: textEvents }])
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await expect(ctx.plugin(LlmPiAi, {
      providers: {
        looped: {
          api: 'openai-completions',
          baseURL: `${server.url}/v1`,
          apiKeyEnv: 'PI_FALLBACK_PRIMARY_KEY',
          models: [{ id: 'm' }],
          fallbackProvider: 'looped',
        },
      },
    })).rejects.toThrow(/cycle/)
  })

  it('rejects a mutual fallback cycle at registration', async () => {
    const serverA = await mockServer([{ events: textEvents }])
    const serverB = await mockServer([{ events: textEvents }])
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await expect(ctx.plugin(LlmPiAi, {
      providers: {
        alpha: {
          api: 'openai-completions',
          baseURL: `${serverA.url}/v1`,
          apiKeyEnv: 'PI_FALLBACK_PRIMARY_KEY',
          models: [{ id: 'm-a' }],
          fallbackProvider: 'beta',
        },
        beta: {
          api: 'openai-completions',
          baseURL: `${serverB.url}/v1`,
          apiKeyEnv: 'PI_FALLBACK_SECONDARY_KEY',
          models: [{ id: 'm-b' }],
          fallbackProvider: 'alpha',
        },
      },
    })).rejects.toThrow(/cycle/)
  })

  it('rejects a fallback naming an unconfigured route at registration', async () => {
    const server = await mockServer([{ events: textEvents }])
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await expect(ctx.plugin(LlmPiAi, {
      providers: {
        lonely: {
          api: 'openai-completions',
          baseURL: `${server.url}/v1`,
          apiKeyEnv: 'PI_FALLBACK_PRIMARY_KEY',
          models: [{ id: 'm' }],
          fallbackProvider: 'nowhere',
        },
      },
    })).rejects.toThrow(/not a configured route/)
  })
})

describe('PiAiAdapter fallback telemetry', () => {
  afterEach(async () => { await closeMockServers() })

  it('reports the hop to onFallback before delegating, containing observer crashes', async () => {
    vi.stubEnv('PI_FALLBACK_PRIMARY_KEY', 'k1')
    const primaryServer = await mockServer([{
      status: 429,
      body: JSON.stringify({ error: { message: 'Rate limit reached (429)' } }),
    }])
    const fallbackServer = await mockServer([{ events: textEvents }])
    const seen: unknown[] = []
    const onFallback = vi.fn((detail: unknown): void => {
      seen.push(detail)
      throw new Error('observer boom')
    })
    const adapter = new LlmPiAi.PiAiAdapter({
      profiles: () => resolveProfiles({
        primary: {
          api: 'openai-completions',
          baseURL: `${primaryServer.url}/v1`,
          apiKeyEnv: 'PI_FALLBACK_PRIMARY_KEY',
          models: [{ id: 'm1' }],
          fallbackProvider: 'secondary',
          fallbackModel: 'm2',
        },
        secondary: {
          api: 'openai-completions',
          baseURL: `${fallbackServer.url}/v1`,
          apiKeyEnv: 'PI_FALLBACK_PRIMARY_KEY',
          models: [{ id: 'm2' }],
        },
      }),
      resolveApiKey: () => Promise.resolve('k'),
      auth: memoryAuth(),
      onFallback,
    })
    const chunks: StreamChunk[] = []
    for await (const chunk of adapter.stream({
      provider: 'primary',
      model: 'm1',
      messages: [createUserMessage({
        content: [{ type: 'text', text: 'hi' }],
        source: { kind: 'plugin', plugin: 'test' },
      })],
    })) chunks.push(chunk)
    expect(chunks[chunks.length - 1]).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
    expect(onFallback).toHaveBeenCalledTimes(1)
    expect(seen[0]).toMatchObject({
      fromProvider: 'primary',
      toProvider: 'secondary',
      model: 'm1',
      fallbackModel: 'm2',
      code: 'RATE_LIMIT',
    })
    expect(fallbackServer.requests.length).toBe(1)
  })
})

describe('PiAiAdapter Agent-Lab: circuit breaker + telemetry', () => {
  afterEach(async () => { await closeMockServers() })

  function makeAdapter(
    primaryUrl: string,
    fallbackUrl: string,
    hooks: { onFallback?: (d: unknown) => void; onTurnTelemetry?: (d: unknown) => void },
  ) {
    return new LlmPiAi.PiAiAdapter({
      profiles: () => resolveProfiles({
        primary: {
          api: 'openai-completions',
          baseURL: `${primaryUrl}/v1`,
          apiKeyEnv: 'PI_FALLBACK_PRIMARY_KEY',
          models: [{ id: 'm1' }],
          fallbackProvider: 'secondary',
          fallbackModel: 'm2',
        },
        secondary: {
          api: 'openai-completions',
          baseURL: `${fallbackUrl}/v1`,
          apiKeyEnv: 'PI_FALLBACK_PRIMARY_KEY',
          models: [{ id: 'm2' }],
        },
      }),
      resolveApiKey: () => Promise.resolve('k'),
      auth: memoryAuth(),
      labFlags: () => ({
        circuitBreaker: true, cascadeMetrics: true, turnTelemetry: true,
        promptCacheStablePrefix: false, compactionPointer: false, tierRouter: false,
        sessionTruncate: false, mcpServer: false, semanticMemory: false, selfHealingLoop: false,
      }),
      ...hooks,
    })
  }

  const messages = (): LlmMessage[] => [createUserMessage({ content: [{ type: 'text', text: 'hi' }], source: { kind: 'plugin', plugin: 'test' } })]

  it('skips the primary once the breaker opens and records telemetry for both legs', async () => {
    vi.stubEnv('PI_FALLBACK_PRIMARY_KEY', 'k')
    const primary = await mockServer([
      { status: 429, body: JSON.stringify({ error: { message: 'Rate limit reached (429)' } }) },
      { status: 429, body: JSON.stringify({ error: { message: 'Rate limit reached (429)' } }) },
      { status: 429, body: JSON.stringify({ error: { message: 'Rate limit reached (429)' } }) },
    ])
    const secondary = await mockServer([
      { events: textEvents }, { events: textEvents }, { events: textEvents }, { events: textEvents },
    ])
    const turns: Array<Record<string, unknown>> = []
    const adapter = makeAdapter(primary.url, secondary.url, {
      onTurnTelemetry: (d) => { turns.push(d as Record<string, unknown>) },
    })

    // Attempts 1-3: the primary fails with an eligible error each time and
    // the cascade serves — the THIRD failure trips the breaker (threshold 3).
    for (let i = 0; i < 3; i += 1) {
      const result = await assembleDirect(adapter, messages())
      expect(result.finish).toEqual({ kind: 'stop' })
    }
    expect(primary.requests.length).toBe(3)

    // Attempt 4: the breaker is now open — the primary must NOT be touched.
    const result4 = await assembleDirect(adapter, messages())
    expect(result4.finish).toEqual({ kind: 'stop' })
    expect(primary.requests.length).toBe(3)
    expect(secondary.requests.length).toBe(4)

    // Telemetry: four failed/skipped primary legs + four healthy secondary legs.
    const primaryLegs = turns.filter(t => t.provider === 'primary')
    const secondaryLegs = turns.filter(t => t.provider === 'secondary')
    expect(primaryLegs).toHaveLength(4)
    expect(primaryLegs.every(t => t.finish === 'fallback')).toBe(true)
    expect(secondaryLegs).toHaveLength(4)
    expect(secondaryLegs.every(t => t.finish === 'stop')).toBe(true)
    // Every leg that built a context carries the prefix fingerprint; the
    // breaker-skipped primary legs legitimately do not.
    expect(secondaryLegs.every(t => typeof t.prefixHash === 'string' && t.prefixHash.length === 8)).toBe(true)
  })

  it('a clean outcome resets the failure window', async () => {
    vi.stubEnv('PI_FALLBACK_PRIMARY_KEY', 'k')
    const primary = await mockServer([
      { status: 429, body: JSON.stringify({ error: { message: 'Rate limit reached (429)' } }) },
      { status: 200, events: textEvents },
    ])
    const secondary = await mockServer([{ events: textEvents }])
    const adapter = makeAdapter(primary.url, secondary.url, {})
    await assembleDirect(adapter, messages()) // primary fails, cascade serves
    const ok = await assembleDirect(adapter, messages()) // primary healthy again
    expect(ok.finish).toEqual({ kind: 'stop' })
    // Window reset: an isolated later failure must not trip the breaker alone.
    expect(primary.requests.length).toBe(2)
    expect(secondary.requests.length).toBe(1)
  })
})

/** Drive one turn straight through the adapter and collect the finish reason. */
async function assembleDirect(adapter: LlmPiAi.PiAiAdapter, msgs: LlmMessage[]): Promise<{ finish: unknown }> {
  let finish: unknown
  for await (const chunk of adapter.stream({
    provider: 'primary',
    model: 'm1',
    messages: msgs,
  })) {
    if (chunk.type === 'finish') finish = chunk.reason
  }
  return { finish }
}
