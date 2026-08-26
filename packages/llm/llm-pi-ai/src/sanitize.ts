/**
 * Sanitization utilities for proxy-router telemetry envelopes injected into
 * streamed model output (e.g. TokenRouter, BluesMinds, NanaRouter `Response
 * ID:` blocks).
 *
 * Design rules:
 * - Only content carrying telemetry markers is removed. Ordinary markdown —
 *   including legitimate `<details>` documentation a model may legitimately
 *   produce — passes through untouched.
 * - Tool arguments are inspected OUTSIDE their JSON string literals: a
 *   payload that parses is returned byte-identical; envelope garbage appended
 *   after the top-level value is stripped. String values are never rewritten
 *   in place, so tool semantics cannot be silently corrupted.
 * - Every scan is linear (no nested or unbounded quantifiers), so hostile
 *   payloads cannot stall the event loop.
 *
 * @module dsh-llm-pi-ai/sanitize
 */

/** A block counts as router telemetry only when it names one of these keys. */
const TELEMETRY_MARKER = /\b(?:Response ID|Request ID|Raw Model|Provider ID)\b/

const DETAILS_OPEN = '<details'
const DETAILS_CLOSE = '</details>'
/** Longest tag we must be able to recognize across chunk boundaries. */
const HOLD_BACK_CHARS = DETAILS_CLOSE.length

/**
 * Case-insensitive indexOf. Buffers here are small (stream deltas plus a
 * bounded hold-back tail), so the lowercase copy costs less than a manual
 * scanner and keeps the hot path simple.
 */
function indexOfTag(haystack: string, needle: string, from: number): number {
  return haystack.toLowerCase().indexOf(needle.toLowerCase(), from)
}

/**
 * Remove every WELL-FORMED `<details>…</details>` span that carries a
 * telemetry marker, in one linear pass. Untagged blocks are preserved
 * verbatim. Two cursors keep the passes independent: `searchFrom` advances
 * past every closed block (marked or not), while `emitFrom` only jumps when a
 * marked span is actually removed.
 */
function stripMarkedDetailsBlocks(text: string): string {
  let out = ''
  let emitFrom = 0
  let searchFrom = 0
  while (true) {
    const open = indexOfTag(text, DETAILS_OPEN, searchFrom)
    if (open === -1) break
    const close = indexOfTag(text, DETAILS_CLOSE, open + DETAILS_OPEN.length)
    if (close === -1) break // unclosed: left for the trailing pass
    const closeEnd = close + DETAILS_CLOSE.length
    if (TELEMETRY_MARKER.test(text.slice(open, closeEnd))) {
      out += text.slice(emitFrom, open)
      emitFrom = closeEnd
    }
    searchFrom = closeEnd
  }
  return out + text.slice(emitFrom)
}

/**
 * Drop an UNCLOSED `<details…` tail only when it carries a telemetry marker;
 * a legitimate unclosed fragment (a model still writing its answer) survives.
 */
function stripTrailingMarkedDetails(text: string): string {
  const open = text.toLowerCase().lastIndexOf(DETAILS_OPEN)
  if (open === -1) return text
  if (indexOfTag(text, DETAILS_CLOSE, open + DETAILS_OPEN.length) !== -1) return text
  if (!TELEMETRY_MARKER.test(text.slice(open))) return text
  return text.slice(0, open).trimEnd()
}

/**
 * One fenced codeblock whose content carries a telemetry key (` ```\n
 * Response ID: … ```). Line-bounded character classes keep the match linear;
 * there are no nested quantifiers, so no catastrophic backtracking exists.
 */
const TELEMETRY_CODEBLOCK_REGEX =
  /```[^\n]*\n(?:(?!```)[^\n]*\n)*?[ \t]*(?:Response ID|Request ID|Raw Model|Provider ID):[^\n]*\n(?:(?!```)[^\n]*\n)*?```/gi

/**
 * Sanitize completed text block content (text or reasoning): marked telemetry
 * envelopes — complete `<details>` blocks, trailing unclosed ones, and fenced
 * metadata codeblocks — are removed; everything else stays.
 * @param text - the accumulated block content.
 * @returns the cleaned text, trailing whitespace trimmed.
 */
export function sanitizeBlockText(text: string): string {
  if (!text || typeof text !== 'string') return text
  let cleaned = stripMarkedDetailsBlocks(text)
  cleaned = stripTrailingMarkedDetails(cleaned)
  cleaned = cleaned.replace(TELEMETRY_CODEBLOCK_REGEX, '')
  return cleaned.trimEnd()
}

/**
 * Find the index one past the end of the top-level JSON value that begins
 * `text`, honoring string literals and escapes. Linear single pass.
 * @returns -1 when `text` does not begin a JSON object/array or is truncated.
 */
function jsonPayloadEnd(text: string): number {
  const first = text[0]
  if (first !== '{' && first !== '[') return -1
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; continue }
    if (ch === '{' || ch === '[') depth += 1
    else if (ch === '}' || ch === ']') {
      depth -= 1
      if (depth === 0) return i + 1
    }
  }
  return -1
}

/**
 * Sanitize serialized tool-call arguments WITHOUT touching their values.
 * Telemetry routers append envelopes after the payload, never inside it, so:
 * a string that parses as one top-level JSON value is returned byte-identical
 * up to trimming; anything after that value is router garbage and is dropped;
 * a non-JSON-shaped or truncated payload falls back to block-text sanitation,
 * which can salvage an envelope-suffixed remnant but never rewrites values.
 * @param argsJson - the raw serialized arguments string.
 * @returns the sanitized arguments string.
 */
export function sanitizeToolArguments(argsJson: string): string {
  if (!argsJson || typeof argsJson !== 'string') return argsJson
  const trimmed = argsJson.trim()
  const end = jsonPayloadEnd(trimmed)
  if (end === -1) return sanitizeBlockText(trimmed)
  return trimmed.slice(0, end)
}

/**
 * Stateful stream sanitizer that filters injected telemetry chunks on the fly.
 * Complete marked `<details>` spans are suppressed across delta boundaries;
 * untagged spans pass through verbatim, and only a small tag-sized tail is
 * ever held back from unmarked content, so legitimate output keeps flowing at
 * interactive latency.
 */
export class StreamDeltaSanitizer {
  /**
   * Held-back tail: either the ≤ {@link HOLD_BACK_CHARS} suffix of clean
   * content (so a split opening tag is recognized next push) or an entire
   * still-unclosed `<details…` span awaiting its close.
   */
  private buffer = ''

  /**
   * Process an incoming text delta.
   * @param delta - the raw provider delta.
   * @returns the cleaned text to emit now (may be empty).
   */
  public push(delta: string): string {
    if (!delta) return ''
    const buf = this.buffer + delta
    this.buffer = ''
    let out = ''
    let pos = 0
    while (true) {
      const open = indexOfTag(buf, DETAILS_OPEN, pos)
      if (open === -1) break
      out += buf.slice(pos, open)
      const close = indexOfTag(buf, DETAILS_CLOSE, open + DETAILS_OPEN.length)
      if (close === -1) {
        // Unclosed so far: hold from the tag on; flush() resolves by marker,
        // and the next push resumes scanning right after the held span.
        this.buffer = buf.slice(open)
        return out
      }
      const closeEnd = close + DETAILS_CLOSE.length
      // Marked envelope: drop. Legitimate block: keep verbatim.
      if (!TELEMETRY_MARKER.test(buf.slice(open, closeEnd))) {
        out += buf.slice(open, closeEnd)
      }
      pos = closeEnd
    }
    // No unclosed span pending: emit the settled prefix and hold back a
    // tag-sized tail so an opening tag split across deltas still matches.
    const hold = Math.min(HOLD_BACK_CHARS, buf.length - pos)
    out += buf.slice(pos, buf.length - hold)
    this.buffer = buf.slice(buf.length - hold)
    return out
  }

  /**
   * Flush remaining buffered content at block end. An unclosed held span
   * resolves by marker: telemetry tails are dropped, legitimate fragments
   * (tag included) are released.
   * @returns the final cleaned remainder (may be empty).
   */
  public flush(): string {
    const rest = this.buffer
    this.buffer = ''
    // A held SPAN always contains its opening `<details`; a held clean TAIL
    // never does (push would have taken the span branch otherwise).
    if (rest.toLowerCase().includes(DETAILS_OPEN)) {
      return TELEMETRY_MARKER.test(rest) ? '' : rest
    }
    return sanitizeBlockText(rest)
  }
}
