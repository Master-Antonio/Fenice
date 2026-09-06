# Agent Note: English-only documentation

Status: implemented

## Problem

The documentation corpus was bilingual: every README, subsystem page, and Agent Note carried a Chinese counterpart (`*.zh.md`) with a machine-checked pairing record (`*.i18n.yaml`), maintained through `verify-translation-pairing`, updated in the same change as the English side, and re-recorded by every generated-catalog writer. Fenice is an international project with one contributor-facing language; the counterpart layer doubled the documentation surface, made every doc edit a two-file change, and made every upstream sync carry Chinese files the fork deletes again.

## Decision

The documentation corpus is English-only. Product UI copy keeps its runtime locales (`packages/client/locale` and the per-package rollout dictionaries) — that is application internationalization, not documentation. Removed with the counterparts: the pairing gate and its scripts, the `docs/i18n/` governance pages, the `dsh-translate-docs` skill, the zh branches in the generated-catalog writers, the zh locale in the website build, and the zh requirements in the note-format and archive gates. `FORK.md` owns what this fork changes relative to `deepseek-ai/deepseek-harness`, and docs point there for the fork's differences.

## Alternatives considered

**Keeping zh counterparts and regenerating them on demand** — the pairing machinery exists precisely to keep them consistent; keeping it for an audience of one writer pays the two-file cost on every edit for content nobody reads in the loop that produces it.

**Keeping zh for the website only** — the website projects `docs/` sources; a zh site needs zh sources, which is the same doubled surface with the same upkeep.

## Consequences

- Every future upstream sync re-introduces `*.zh.md` and `*.i18n.yaml` files from upstream; the sync resolution deletes them again, and the retired gates no longer fail on their absence.
- The superseded bilingual-machinery notes (the pairing gate, localized bilingual links, the translation-prompt contract, the routine-translation workflow) remain as history; this note is the current authority where their decisions conflict with English-only reality.
- `verify-md-links` and `verify-agent-note-format` no longer know about counterparts; the archive gate accepts English-only sealed notes.
