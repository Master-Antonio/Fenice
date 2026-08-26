/**
 * Rollout-language dictionaries for this package's locale namespace.
 * Emitted by scripts/tmp-i18n-emit-all.ts; keys mirror the zh/en pair and
 * missing entries fall back to English at lookup time.
 */
import type { RolloutLocaleId } from '@deepseek-ai/dsh-client-locale'

const it: Record<string, string> = {
  'appearance.title': 'Aspetto',
  'appearance.light': 'Chiaro',
  'appearance.dark': 'Scuro',
  'appearance.system': 'Sistema',
}
const de: Record<string, string> = {
  'appearance.title': 'Design',
  'appearance.light': 'Hell',
  'appearance.dark': 'Dunkel',
  'appearance.system': 'System',
}
const es: Record<string, string> = {
  'appearance.title': 'Apariencia',
  'appearance.light': 'Claro',
  'appearance.dark': 'Oscuro',
  'appearance.system': 'Sistema',
}
const fr: Record<string, string> = {
  'appearance.title': 'Apparence',
  'appearance.light': 'Clair',
  'appearance.dark': 'Sombre',
  'appearance.system': 'Système',
}
const ja: Record<string, string> = {
  'appearance.title': '外観',
  'appearance.light': 'ライト',
  'appearance.dark': 'ダーク',
  'appearance.system': 'システムに従う',
}

export const rolloutSettingsTheme: Record<RolloutLocaleId, Record<string, string>> = {
  it, de, es, fr, ja,
}
