import { describe, expect, it } from 'vitest'
import {
  canonicalizeJsonValue, deepEqualJson, isJsonValue, snapshotJsonValue,
} from '../src/index.ts'

describe('canonicalizeJsonValue', () => {
  it('sorts object keys recursively while preserving array order', () => {
    const input = {
      type: 'object',
      properties: {
        zeta: { type: 'string', description: 'z' },
        alpha: { type: 'number', enum: [3, 1, 2] },
      },
      required: ['zeta'],
    }
    const canonical = canonicalizeJsonValue(input)
    expect(canonical).toBeDefined()
    expect(Object.keys((canonical as Record<string, unknown>).properties as object)).toEqual(['alpha', 'zeta'])
    // Arrays keep their element order: sorting them would change the data.
    expect((canonical as typeof input).required).toEqual(['zeta'])
    expect((canonical as typeof input).properties.alpha.enum).toEqual([3, 1, 2])
  })

  it('is a detach: the returned graph shares no reference with the input', () => {
    const input = { nested: { list: [1, 2] } }
    const canonical = canonicalizeJsonValue(input)
    expect(canonical).not.toBe(input)
    expect((canonical as typeof input).nested).not.toBe(input.nested)
    expect((canonical as typeof input).nested.list).not.toBe(input.nested.list)
  })

  it('agrees structurally with the plain snapshot and rejects the same values', () => {
    const value = { b: 1, a: [{ y: true, x: null }] }
    expect(deepEqualJson(canonicalizeJsonValue(value), snapshotJsonValue(value))).toBe(true)
    expect(canonicalizeJsonValue({ bad: () => 1 })).toBeUndefined()
    expect(canonicalizeJsonValue(new Date())).toBeUndefined()
    expect(isJsonValue({ a: 1 })).toBe(true)
  })

  it('serializes identically to the sorted form of an equal value', () => {
    const first = JSON.stringify(canonicalizeJsonValue({ bb: 1, aa: { dd: 2, cc: 3 } }))
    const second = JSON.stringify(canonicalizeJsonValue({ aa: { cc: 3, dd: 2 }, bb: 1 }))
    expect(first).toBe(second)
  })
})
