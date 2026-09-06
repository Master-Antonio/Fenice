import { describe, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import {
  collectSupersedeCandidates,
  createMessage,
  createUserMessage,
  planSupersededCollapse,
  supersededMarker,
  type SupersedeCandidate,
  type ToolCallId,
} from '@deepseek-ai/dsh-llm'

function call(
  id: string,
  toolName = 'read',
  args = '{"path":"a"}',
  isError = false,
): SupersedeCandidate {
  return { toolCallId: brandString<ToolCallId>(id), toolName, argumentsJson: args, isError }
}

describe('planSupersededCollapse', () => {
  it('keeps the newest duplicate full and collapses older ones', () => {
    const calls = [call('old'), call('new')]
    expect([...planSupersededCollapse(calls)]).toEqual([[brandString<ToolCallId>('old'), 'read']])
  })

  it('renders a deterministic marker naming only the tool', () => {
    expect(supersededMarker('read')).toBe(
      '[superseded: a later identical read call carries the current output]',
    )
  })

  it('keeps distinct tools and distinct arguments independent', () => {
    const calls = [call('a', 'read'), call('b', 'grep'), call('c', 'read', '{"path":"b"}')]
    expect(planSupersededCollapse(calls).size).toBe(0)
  })

  it('treats key order as insignificant in arguments', () => {
    const calls = [call('old', 'edit', '{"path":"a","old":"x"}'), call('new', 'edit', '{"old":"x","path":"a"}')]
    expect([...planSupersededCollapse(calls).keys()].map(String)).toEqual(['old'])
  })

  it('exempts error results in both directions', () => {
    // A failed newest attempt must not hide the older success.
    expect(planSupersededCollapse([call('old'), call('new', 'read', '{"path":"a"}', true)]).size).toBe(0)
    // A failed older attempt never collapses either.
    expect(planSupersededCollapse([call('old', 'read', '{"path":"a"}', true), call('new')]).size).toBe(0)
  })

  it('exempts malformed and non-lossless arguments', () => {
    expect(planSupersededCollapse([call('a', 'read', 'not-json'), call('b', 'read', 'not-json')]).size).toBe(0)
    expect(planSupersededCollapse([call('a'), call('b')]).size).toBe(1)
  })

  it('collapses monotonically as history grows', () => {
    const first = [call('one'), call('two')]
    expect(planSupersededCollapse(first).size).toBe(1)
    // Appending an unrelated call never un-collapses an older duplicate.
    const grown = [...first, call('three', 'grep')]
    expect([...planSupersededCollapse(grown).keys()].map(String)).toEqual(['one'])
    // Appending a third identical call collapses the previous newest too.
    const grownAgain = [...grown, call('four')]
    expect([...planSupersededCollapse(grownAgain).keys()].map(String).sort()).toEqual(['one', 'two'])
  })

  it('handles empty input', () => {
    expect(planSupersededCollapse([]).size).toBe(0)
  })
})

describe('collectSupersedeCandidates', () => {
  it('joins assistant calls with their results by call id in wire order', () => {
    const messages = [
      createMessage({
        role: 'assistant',
        content: [
          { type: 'text', text: 'reading' },
          { type: 'tool-call', id: brandString<ToolCallId>('call-1'), name: 'read', arguments: '{"path":"a"}' },
        ],
        source: { kind: 'plugin', plugin: 'test' },
      }),
      createUserMessage({
        content: [{ type: 'tool-result', toolCallId: brandString<ToolCallId>('call-1'), content: [{ type: 'text', text: 'out' }] }],
        source: { kind: 'plugin', plugin: 'test' },
      }),
      createUserMessage({
        content: [{ type: 'tool-result', toolCallId: brandString<ToolCallId>('call-orphan'), content: [{ type: 'text', text: 'orphan' }] }],
        source: { kind: 'plugin', plugin: 'test' },
      }),
    ]
    const candidates = collectSupersedeCandidates(messages)
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({ toolName: 'read', argumentsJson: '{"path":"a"}', isError: false })
    expect(String(candidates[0]?.toolCallId)).toBe('call-1')
  })
})
