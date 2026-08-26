/**
 * Rollout-language dictionaries for this package's locale namespace.
 * Emitted by scripts/tmp-i18n-emit-all.ts; keys mirror the zh/en pair and
 * missing entries fall back to English at lookup time.
 */
import type { RolloutLocaleId } from '@deepseek-ai/dsh-client-locale'

const it: Record<string, string> = {
  'produced.label': 'Prodotti',
  'produced.moreOne': '+ 1 file',
  'produced.more': '+ {count} file',
  'produced.open': 'Apri {name}',
  'produced.showInFolder': 'Mostra nella cartella',
}
const de: Record<string, string> = {
  'produced.label': 'Erzeugt',
  'produced.moreOne': '+ 1 Datei',
  'produced.more': '+ {count} Dateien',
  'produced.open': '{name} öffnen',
  'produced.showInFolder': 'Im Ordner anzeigen',
}
const es: Record<string, string> = {
  'produced.label': 'Generados',
  'produced.moreOne': '+ 1 archivo',
  'produced.more': '+ {count} archivos',
  'produced.open': 'Abrir {name}',
  'produced.showInFolder': 'Mostrar en carpeta',
}
const fr: Record<string, string> = {
  'produced.label': 'Produits',
  'produced.moreOne': '+ 1 fichier',
  'produced.more': '+ {count} fichiers',
  'produced.open': 'Ouvrir {name}',
  'produced.showInFolder': 'Afficher dans le dossier',
}
const ja: Record<string, string> = {
  'produced.label': '生成物',
  'produced.moreOne': '+ 1 ファイル',
  'produced.more': '+ {count} ファイル',
  'produced.open': '{name} を開く',
  'produced.showInFolder': 'フォルダー内で表示',
}

export const rolloutDeliverables: Record<RolloutLocaleId, Record<string, string>> = {
  it, de, es, fr, ja,
}
