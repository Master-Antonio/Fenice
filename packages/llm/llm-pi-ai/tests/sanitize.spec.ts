import { describe, expect, it } from 'vitest'
import { sanitizeBlockText, sanitizeToolArguments, StreamDeltaSanitizer } from '../src/sanitize.ts'

/** Push every delta through one sanitizer and join everything emitted. */
function drain(chunks: readonly string[]): string {
  const sanitizer = new StreamDeltaSanitizer()
  const emitted: string[] = []
  for (const chunk of chunks) {
    const out = sanitizer.push(chunk)
    if (out.length > 0) emitted.push(out)
  }
  const remainder = sanitizer.flush()
  if (remainder.length > 0) emitted.push(remainder)
  return emitted.join('')
}

describe('sanitizeBlockText', () => {
  it('strips completed details telemetry envelopes injected by router proxies', () => {
    const raw = 'Hello world!\n<details>\n<summary></summary>\n\n```\nResponse ID: resp_12345\nRequest ID: req_67890\nRaw Model: qwen-3.8-max\nProvider: bluesminds\n```\n</details>'
    expect(sanitizeBlockText(raw)).toBe('Hello world!')
  })

  it('leaves a legitimate complete details block untouched (no markers)', () => {
    const raw = 'Use it like this:\n\n<details>\n<summary>Options</summary>\nBody text.\n</details>\nDone.'
    expect(sanitizeBlockText(raw)).toBe(raw)
  })

  it('strips a trailing unclosed details tail that carries telemetry markers', () => {
    const raw = 'Here is your solution:\n```python\nprint(1)\n```\n<details><summary>telemetry\nResponse ID: resp_1'
    expect(sanitizeBlockText(raw)).toBe('Here is your solution:\n```python\nprint(1)\n```')
  })

  it('keeps an unmarked trailing fragment that merely mentions markup in passing', () => {
    const raw = 'Note: the tag <details opens sections.'
    expect(sanitizeBlockText(raw)).toBe(raw)
  })

  it('streams telemetry envelopes out in real time across chunk boundaries', () => {
    const joined = drain([
      'Hello ',
      'there! ',
      '<details>',
      '<summary></summary>',
      '\n```\nResponse ID: 123\n```\n',
      '</details>',
      ' How are you?',
    ])
    expect(joined).toBe('Hello there!  How are you?')
  })
  it('streams legitimate details blocks through instead of suppressing them', () => {
    const joined = drain([
      'Before ',
      '<details>',
      '<summary>',
      'Info',
      '</summary>',
      'Body',
      '</details>',
      ' After',
    ])
    expect(joined).toBe('Before <details><summary>Info</summary>Body</details> After')
  })

  it('reassembles an opening tag split across deltas and drops the marked envelope', () => {
    const joined = drain(['OK <det', 'ails><sum', 'mary>x</sum', 'mary>Response', ' ID: 1</det', 'ails>!'])
    expect(joined).toBe('OK !')
  })

  it('releases an unmarked suppressed tail at flush instead of eating it', () => {
    const joined = drain(['<details>\nsome plain unfinished note'])
    expect(joined).toBe('<details>\nsome plain unfinished note')
  })
})

describe('sanitizeToolArguments', () => {
  it('returns a pure JSON payload byte-identical, dropping appended envelope garbage', () => {
    const payload = '{"command":"ls","flags":["-l"]}'
    const raw = `${payload}\n<details><summary></summary>Response ID: 1</details>`
    expect(sanitizeToolArguments(raw)).toBe(payload)
  })

  it('never rewrites values inside the payload — even HTML-details-looking ones', () => {
    const raw = '{"html":"","count":2}'
    expect(sanitizeToolArguments(raw)).toBe(raw)
  })

  it('survives escaped quotes and braces inside string values while scanning', () => {
    const raw = '{"code":"if (a[\\"{\\"]) {}","s":"}{"}'
    expect(sanitizeToolArguments(raw)).toBe(raw)
  })

  it('falls back to envelope stripping for non-JSON-shaped payloads', () => {
    expect(sanitizeToolArguments('garbage ')).toBe('garbage')
  })
})
