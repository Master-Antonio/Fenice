import { describe, expect, it } from 'vitest'
import { createUserMessage, type GenerateOptions, type ToolSchema } from '@deepseek-ai/dsh-llm'
import {
  canonicalizeJsonSchema,
  normalizeSystemPrompt,
  prefixFingerprint,
  stableToolOrder,
  toPiContext,
} from '../src/context.ts'
import { PiAiAdapter } from '../src/adapter.ts'
import { resolveProfiles } from '../src/config.ts'
import { resolveLabFlags } from '../src/lab.ts'
import { memoryAuth } from './auth-double.ts'

describe('promptCacheStablePrefix unit tests', () => {
  describe('canonicalizeJsonSchema', () => {
    it('sorts object keys deeply and deterministically', () => {
      const unordered = {
        z: 1,
        a: 2,
        nested: {
          foo: 'bar',
          baz: [3, { y: 10, x: 20 }],
        },
      }
      const canonical = canonicalizeJsonSchema(unordered)
      expect(Object.keys(canonical)).toEqual(['a', 'nested', 'z'])
      expect(Object.keys((canonical.nested as Record<string, unknown>))).toEqual(['baz', 'foo'])
      const nestedItem = (canonical.nested as { baz: unknown[] }).baz[1] as Record<string, unknown>
      expect(Object.keys(nestedItem)).toEqual(['x', 'y'])
    })

    it('produces identical JSON strings for objects with different initial key insertion order', () => {
      const obj1 = {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'User name' },
          age: { type: 'number', description: 'User age' },
          address: {
            type: 'object',
            properties: {
              zip: { type: 'string' },
              city: { type: 'string' },
            },
            required: ['city', 'zip'],
          },
        },
        required: ['name', 'age'],
      }

      const obj2 = {
        required: ['name', 'age'],
        properties: {
          address: {
            required: ['city', 'zip'],
            properties: {
              city: { type: 'string' },
              zip: { type: 'string' },
            },
            type: 'object',
          },
          age: { description: 'User age', type: 'number' },
          name: { description: 'User name', type: 'string' },
        },
        type: 'object',
      }

      const canonical1 = canonicalizeJsonSchema(obj1)
      const canonical2 = canonicalizeJsonSchema(obj2)
      expect(JSON.stringify(canonical1)).toBe(JSON.stringify(canonical2))
    })

    it('preserves primitive values and null correctly', () => {
      expect(canonicalizeJsonSchema(null)).toBe(null)
      expect(canonicalizeJsonSchema('hello')).toBe('hello')
      expect(canonicalizeJsonSchema(42)).toBe(42)
      expect(canonicalizeJsonSchema(true)).toBe(true)
      expect(canonicalizeJsonSchema([1, 2, 3])).toEqual([1, 2, 3])
    })
  })

  describe('normalizeSystemPrompt', () => {
    it('returns undefined when system prompt is undefined', () => {
      expect(normalizeSystemPrompt(undefined)).toBeUndefined()
    })

    it('normalizes CRLF line endings to LF', () => {
      const crlf = 'Line 1\r\nLine 2\r\nLine 3'
      expect(normalizeSystemPrompt(crlf)).toBe('Line 1\nLine 2\nLine 3')
    })

    it('leaves standard LF line endings untouched', () => {
      const lf = 'Line 1\nLine 2\nLine 3'
      expect(normalizeSystemPrompt(lf)).toBe(lf)
    })
  })

  describe('stableToolOrder', () => {
    it('sorts tools alphabetically by name', () => {
      const tools = [
        { name: 'write_file', description: 'Write' },
        { name: 'bash', description: 'Bash' },
        { name: 'edit_file', description: 'Edit' },
        { name: 'read_file', description: 'Read' },
      ]
      const sorted = stableToolOrder(tools)
      expect(sorted.map(t => t.name)).toEqual(['bash', 'edit_file', 'read_file', 'write_file'])
      // Input array is not mutated
      expect(tools.map(t => t.name)).toEqual(['write_file', 'bash', 'edit_file', 'read_file'])
    })

    it('canonicalizes parameters schemas when canonicalizeSchemas is true', () => {
      const tools = [
        {
          name: 'toolB',
          parameters: {
            z: 1,
            a: 2,
          },
        },
        {
          name: 'toolA',
          parameters: {
            b: 3,
            a: 4,
          },
        },
      ]
      const sorted = stableToolOrder(tools, true)
      expect(sorted[0]?.name).toBe('toolA')
      expect(Object.keys(sorted[0]?.parameters as Record<string, unknown>)).toEqual(['a', 'b'])
      expect(sorted[1]?.name).toBe('toolB')
      expect(Object.keys(sorted[1]?.parameters as Record<string, unknown>)).toEqual(['a', 'z'])
    })
  })

  describe('toPiContext with promptCacheStablePrefix', () => {
    const tools: ToolSchema[] = [
      { name: 'zeta_tool', description: 'Zeta', parameters: { b: 1, a: 2 } },
      { name: 'alpha_tool', description: 'Alpha', parameters: { y: 10, x: 20 } },
      { name: 'beta_tool', description: 'Beta', parameters: { type: 'object' } },
    ]

    it('preserves tool declaration order when promptCacheStablePrefix is false', () => {
      const req: GenerateOptions = {
        provider: 'mock',
        model: 'm1',
        system: 'You are an assistant.\r\nBe concise.',
        tools,
        messages: [createUserMessage({ content: [{ type: 'text', text: 'hi' }], source: { kind: 'plugin', plugin: 'test' } })],
      }
      const ctx = toPiContext(req, undefined, undefined, undefined, { promptCacheStablePrefix: false })
      expect(ctx.tools?.map(t => t.name)).toEqual(['zeta_tool', 'alpha_tool', 'beta_tool'])
      expect(ctx.systemPrompt).toBe('You are an assistant.\r\nBe concise.')
    })

    it('sorts tools alphabetically and canonicalizes schemas when promptCacheStablePrefix is true', () => {
      const req: GenerateOptions = {
        provider: 'mock',
        model: 'm1',
        system: 'You are an assistant.\r\nBe concise.',
        tools,
        messages: [createUserMessage({ content: [{ type: 'text', text: 'hi' }], source: { kind: 'plugin', plugin: 'test' } })],
      }
      const ctx = toPiContext(req, undefined, undefined, undefined, { promptCacheStablePrefix: true })
      expect(ctx.tools?.map(t => t.name)).toEqual(['alpha_tool', 'beta_tool', 'zeta_tool'])
      expect(ctx.systemPrompt).toBe('You are an assistant.\nBe concise.')
      const alphaParams = ctx.tools?.[0]?.parameters as Record<string, unknown>
      expect(Object.keys(alphaParams)).toEqual(['x', 'y'])
    })

    it('produces identical prefix fingerprints for reversed tool inputs when promptCacheStablePrefix is true', () => {
      const req1: GenerateOptions = {
        provider: 'mock',
        model: 'm1',
        system: 'System prompt',
        tools: [
          { name: 'tool_2', description: 'Two', parameters: { b: 1, a: 2 } },
          { name: 'tool_1', description: 'One', parameters: { d: 3, c: 4 } },
        ],
        messages: [createUserMessage({ content: [{ type: 'text', text: 'hello' }], source: { kind: 'plugin', plugin: 'test' } })],
      }
      const req2: GenerateOptions = {
        provider: 'mock',
        model: 'm1',
        system: 'System prompt',
        tools: [
          { name: 'tool_1', description: 'One', parameters: { c: 4, d: 3 } },
          { name: 'tool_2', description: 'Two', parameters: { a: 2, b: 1 } },
        ],
        messages: [createUserMessage({ content: [{ type: 'text', text: 'hello' }], source: { kind: 'plugin', plugin: 'test' } })],
      }

      const ctx1 = toPiContext(req1, undefined, undefined, undefined, { promptCacheStablePrefix: true })
      const ctx2 = toPiContext(req2, undefined, undefined, undefined, { promptCacheStablePrefix: true })

      expect(prefixFingerprint(ctx1)).toBe(prefixFingerprint(ctx2))
      expect(JSON.stringify(ctx1.tools)).toBe(JSON.stringify(ctx2.tools))
    })
  })

  describe('PiAiAdapter with promptCacheStablePrefix', () => {
    it('sorts tools and computes stable prefix fingerprint in adapter stream', async () => {
      const turnEvents: Array<Record<string, unknown>> = []
      const adapter = new PiAiAdapter({
        profiles: () => resolveProfiles({
          'test-prov': {
            api: 'openai-completions',
            baseURL: 'http://127.0.0.1:9999/v1',
            displayName: 'Test Provider',
            models: [{ id: 'test-model' }],
          },
        }),
        resolveApiKey: () => Promise.resolve('key'),
        auth: memoryAuth(),
        labFlags: () => resolveLabFlags({
          promptCacheStablePrefix: true,
          turnTelemetry: true,
        }),
        onTurnTelemetry: (detail) => {
          turnEvents.push(detail)
        },
      })

      const prepared = await adapter.prepareCall('test-prov', 'test-model')
      expect(prepared.model.id).toBe('test-model')
    })
  })
})
