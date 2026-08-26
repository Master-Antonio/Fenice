/**
 * Rollout-language dictionaries for this package's locale namespace.
 * Emitted by scripts/tmp-i18n-emit-all.ts; keys mirror the zh/en pair and
 * missing entries fall back to English at lookup time.
 */
import type { RolloutLocaleId } from '@deepseek-ai/dsh-client-locale'

const it: Record<string, string> = {
  'command': 'Comandi',
  'skill': 'Skill',
  'subagent': 'Subagenti',
  'loading': 'Caricamento…',
  'suggestions.aria': 'Suggerimenti di attivazione',
}
const de: Record<string, string> = {
  'command': 'Befehle',
  'skill': 'Skills',
  'subagent': 'Subagenten',
  'loading': 'Wird geladen…',
  'suggestions.aria': 'Trigger-Vorschläge',
}
const es: Record<string, string> = {
  'command': 'Comandos',
  'skill': 'Skills',
  'subagent': 'Subagentes',
  'loading': 'Cargando…',
  'suggestions.aria': 'Sugerencias de activación',
}
const fr: Record<string, string> = {
  'command': 'Commandes',
  'skill': 'Skills',
  'subagent': 'Sous-agents',
  'loading': 'Chargement…',
  'suggestions.aria': 'Suggestions de déclenchement',
}
const ja: Record<string, string> = {
  'command': 'コマンド',
  'skill': 'スキル',
  'subagent': 'サブエージェント',
  'loading': '読み込んでいます…',
  'suggestions.aria': 'トリガー候補',
}

export const rolloutSlashMenu: Record<RolloutLocaleId, Record<string, string>> = {
  it, de, es, fr, ja,
}
