/**
 * DE rollout dictionaries for the shared namespaces.
 * Key parity with the zh/en pair is enforced by the generator that emitted
 * this file; missing keys would fall back to English at lookup time.
 */
import type { CommonKey } from '../index.ts'
import type { SettingsLocaleKey } from '../settings.ts'

export const common: Record<CommonKey, string> = {
  'ok': 'OK',
  'cancel': 'Abbrechen',
  'close': 'Schließen',
  'copy': 'Kopieren',
  'copied': 'Kopiert',
  'retry': 'Wiederholen',
  'loading': 'Wird geladen…',
  'load.failed': 'Laden fehlgeschlagen',
  'submit': 'Absenden',
  'submitting': 'Wird abgesendet…',
  'next': 'Weiter',
  'previous': 'Zurück',
  'skip': 'Überspringen',
  'delete': 'Löschen',
  'edit': 'Bearbeiten',
  'save': 'Speichern',
  'search': 'Suchen',
  'more': 'Mehr',
  'collapse': 'Einklappen',
  'expand': 'Ausklappen',
  'back': 'Zurück',
  'unknown': 'Unbekannt',
  'none': 'Keine',
  'truncated': 'Abgeschnitten',
}

export const settingsLocale: Record<SettingsLocaleKey, string> = {
  'language.title': 'Sprache',
}
