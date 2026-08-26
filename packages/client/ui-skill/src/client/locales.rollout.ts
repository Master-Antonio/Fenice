/**
 * Rollout-language dictionaries for this package's locale namespace.
 * Emitted by scripts/tmp-i18n-emit-all.ts; keys mirror the zh/en pair and
 * missing entries fall back to English at lookup time.
 */
import type { RolloutLocaleId } from '@deepseek-ai/dsh-client-locale'

const it: Record<string, string> = {
  'row.running': 'Caricamento skill',
  'row.failed': 'Caricamento della skill non riuscito',
  'row.stopped': 'Caricamento della skill interrotto',
  'row.instructions': 'Istruzioni',
  'menu.userOnly': 'solo utente',
}
const de: Record<string, string> = {
  'row.running': 'Skill wird geladen',
  'row.failed': 'Skill-Laden fehlgeschlagen',
  'row.stopped': 'Skill-Laden gestoppt',
  'row.instructions': 'Anweisungen',
  'menu.userOnly': 'nur Benutzer',
}
const es: Record<string, string> = {
  'row.running': 'Cargando skill',
  'row.failed': 'Fallo al cargar el skill',
  'row.stopped': 'Carga del skill detenida',
  'row.instructions': 'Instrucciones',
  'menu.userOnly': 'solo usuario',
}
const fr: Record<string, string> = {
  'row.running': 'Chargement du skill',
  'row.failed': 'Échec du chargement du skill',
  'row.stopped': 'Chargement du skill arrêté',
  'row.instructions': 'Instructions',
  'menu.userOnly': 'utilisateur uniquement',
}
const ja: Record<string, string> = {
  'row.running': 'スキルを読み込んでいます',
  'row.failed': 'スキルの読み込みに失敗しました',
  'row.stopped': 'スキルの読み込みを中止しました',
  'row.instructions': '指示内容',
  'menu.userOnly': 'ユーザー専用',
}

export const rolloutSkill: Record<RolloutLocaleId, Record<string, string>> = {
  it, de, es, fr, ja,
}
