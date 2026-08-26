/**
 * Rollout-language dictionaries for this package's locale namespace.
 * Emitted by scripts/tmp-i18n-emit-all.ts; keys mirror the zh/en pair and
 * missing entries fall back to English at lookup time.
 */
import type { RolloutLocaleId } from '@deepseek-ai/dsh-client-locale'

const it: Record<string, string> = {
  'trigger': 'Impostazioni',
  'title': 'Impostazioni',
  'close': 'Chiudi',
  'openDocument': 'Apri file di configurazione',
  'openDocument.error': 'Impossibile aprire il file di configurazione',
  'general.nav': 'Generali',
}
const de: Record<string, string> = {
  'trigger': 'Einstellungen',
  'title': 'Einstellungen',
  'close': 'Schließen',
  'openDocument': 'Konfigurationsdatei öffnen',
  'openDocument.error': 'Konfigurationsdatei konnte nicht geöffnet werden',
  'general.nav': 'Allgemein',
}
const es: Record<string, string> = {
  'trigger': 'Ajustes',
  'title': 'Ajustes',
  'close': 'Cerrar',
  'openDocument': 'Abrir archivo de configuración',
  'openDocument.error': 'No se pudo abrir el archivo de configuración',
  'general.nav': 'General',
}
const fr: Record<string, string> = {
  'trigger': 'Paramètres',
  'title': 'Paramètres',
  'close': 'Fermer',
  'openDocument': 'Ouvrir le fichier de configuration',
  'openDocument.error': "Impossible d'ouvrir le fichier de configuration",
  'general.nav': 'Général',
}
const ja: Record<string, string> = {
  'trigger': '設定',
  'title': '設定',
  'close': '閉じる',
  'openDocument': '設定ファイルを開く',
  'openDocument.error': '設定ファイルを開けませんでした',
  'general.nav': '全般',
}

export const rolloutSettingsGeneral: Record<RolloutLocaleId, Record<string, string>> = {
  it, de, es, fr, ja,
}
