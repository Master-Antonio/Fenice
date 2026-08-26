/**
 * Rollout-language dictionaries for this package's locale namespace.
 * Emitted by scripts/tmp-i18n-emit-all.ts; keys mirror the zh/en pair and
 * missing entries fall back to English at lookup time.
 */
import type { RolloutLocaleId } from '@deepseek-ai/dsh-client-locale'

const it: Record<string, string> = {
  'chip.on.aria': 'Modalità piano attiva, premi per disattivare',
  'chip.on.title': 'Modalità piano attiva — clicca per disattivare (/plan off)',
  'chip.off.aria': 'Modalità piano disattivata, premi per attivare',
  'chip.off.title': 'Modalità piano disattivata — clicca per attivare (/plan)',
}
const de: Record<string, string> = {
  'chip.on.aria': 'Planmodus aktiv, zum Ausschalten drücken',
  'chip.on.title': 'Planmodus aktiv — zum Ausschalten anklicken (/plan off)',
  'chip.off.aria': 'Planmodus aus, zum Einschalten drücken',
  'chip.off.title': 'Planmodus aus — zum Einschalten anklicken (/plan)',
}
const es: Record<string, string> = {
  'chip.on.aria': 'Modo plan activado; pulsa para desactivar',
  'chip.on.title': 'Modo plan activado — clic para desactivar (/plan off)',
  'chip.off.aria': 'Modo plan desactivado; pulsa para activar',
  'chip.off.title': 'Modo plan desactivado — clic para activar (/plan)',
}
const fr: Record<string, string> = {
  'chip.on.aria': 'Mode plan activé, appuyez pour désactiver',
  'chip.on.title': 'Mode plan activé — cliquez pour désactiver (/plan off)',
  'chip.off.aria': 'Mode plan désactivé, appuyez pour activer',
  'chip.off.title': 'Mode plan désactivé — cliquez pour activer (/plan)',
}
const ja: Record<string, string> = {
  'chip.on.aria': 'プランモードがオンです。押すとオフになります',
  'chip.on.title': 'プランモード オン — クリックでオフ (/plan off)',
  'chip.off.aria': 'プランモードがオフです。押すとオンになります',
  'chip.off.title': 'プランモード オフ — クリックでオン (/plan)',
}

export const rolloutPlan: Record<RolloutLocaleId, Record<string, string>> = {
  it, de, es, fr, ja,
}
