/**
 * IT rollout dictionaries for the shared namespaces.
 * Key parity with the zh/en pair is enforced by the generator that emitted
 * this file; missing keys would fall back to English at lookup time.
 */
import type { CommonKey } from '../index.ts'
import { en } from '../en.ts'
import type { SettingsLocaleKey } from '../settings.ts'

export const common: Record<CommonKey, string> = {
  ...en,
  'ok': 'OK',
  'cancel': 'Annulla',
  'close': 'Chiudi',
  'copy': 'Copia',
  'copied': 'Copiato',
  'copy.failed': 'Copia non riuscita',
  'copy.value': 'Copia valore',
  'copy.json': 'Copia JSON',
  'copy.path': 'Copia percorso proprietà',
  'copy.prettyJson': 'Copia JSON formattato',
  'copy.compactJson': 'Copia JSON compatto',
  'copy.optionsHint': '{action}; clic destro per opzioni di copia',
  'retry': 'Riprova',
  'loading': 'Caricamento…',
  'load.failed': 'Caricamento non riuscito',
  'submit': 'Invia',
  'submitting': 'Invio in corso…',
  'next': 'Avanti',
  'previous': 'Precedente',
  'skip': 'Salta',
  'delete': 'Elimina',
  'edit': 'Modifica',
  'save': 'Salva',
  'search': 'Cerca',
  'more': 'Altro',
  'collapse': 'Comprimi',
  'expand': 'Espandi',
  'back': 'Indietro',
  'unknown': 'Sconosciuto',
  'none': 'Nessuno',
  'truncated': 'Troncato',
}

export const settingsLocale: Record<SettingsLocaleKey, string> = {
  'language.title': 'Lingua',
}
