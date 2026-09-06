# Agent Note: Request-economy round two (measure first)

Status: implemented

## Problem

The P1 batch shipped content-hiding wire knobs default-off (tombstone collapse, stale-reasoning window) pending production evidence, with a skill cap of 200 and trimmed but unmeasured guide sections. The open questions were whether recorded traffic justifies flipping the defaults, how far the fixed-cost surface compresses without losing meaning, and whether the hit-rate and PTC items need code at all.

## Decision

A corpus measurement harness (`/tmp/measure-economy.py`, intentionally uncommitted) statically analyzed all 82 recorded session fixtures: 11.4k tokens of tool-result mass contain 44 tokens of superseded duplicates (0%) and zero stale reasoning past a three-turn window. The fixtures are short synthetic scenarios that structurally underrepresent repeats, so the corpus cannot justify flipping content-hiding defaults; the knobs stay opt-in per deployment with the compare-workflow caveat (an older duplicate may be the comparison baseline) and the mounted session-query recovery path documented. Production token-meter evidence, not fixture analysis, is the stated bar for changing the defaults.

Skill catalog descriptions cap at 120 characters by default (was 200), keeping heads that carry routing signal with per-deployment override intact; the two recorded long descriptions re-truncate accordingly. Guide sections stop at their clarity floor with measured compression from the previous batch: subagent 89 to 28 tokens, goal 183 to 132, bash 20 to 12, all remaining sentences load-bearing orchestration that descriptions cannot carry for PTC-mode agents. No further section cuts are planned.

OpenAI cache stickiness is verified wired end to end (agent-loop session-id invariant through adapter forwarding to vendor prompt_cache_key and affinity headers), and Anthropic marker mechanics with placement live in the vendored provider, unverifiable without a provider key, so neither item adds harness code. PTC mode keeps its full output map on the earlier measurement, and tier routing stays opt-in because route changes need quality benchmarks no keyless gate can produce.

## Alternatives considered

**Flipping tombstone and stale-reasoning defaults on.** Rejected on the corpus measurement: near-zero addressable mass in recorded traffic against a real compare-workflow regression risk. Revisit with production token-meter data from heavy-loop deployments.

**Skill cap below 120 or further section cuts.** Rejected: description heads already carry the routing minimum and sections hold only orchestration; further cuts trade meaning for single-digit tokens.

**Near-duplicate collapsing on similar arguments.** Rejected: identical-argument tombstoning already covers provable staleness, while similarity heuristics risk hiding live data (different offsets of the same file) with no deterministic safety property.

## Consequences

Fixed request cost drops by roughly 20 tokens per cataloged skill with no behavior change beyond shorter summaries. Content-hiding features remain tested, documented, default-off capabilities with a named evidence bar. The hit-rate items need no code: stable prefix plus verified stickiness plus the cacheEfficiency projection cover measurement on every route.

## Verification

Unit tests pin the 120 default with truncation length, refreshed skill-load and badge snapshots show only deeper truncation, section sizes measured from shipped strings, corpus measurement script output recorded above, and the standard gates (build, typecheck, lint, unit, snapshot replay, expected suites, documentation checks, per-file coverage with no new violations) verify the round.
