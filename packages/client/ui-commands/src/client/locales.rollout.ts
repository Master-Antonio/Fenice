/**
 * Rollout-language dictionaries for this package's locale namespace.
 * Emitted by scripts/tmp-i18n-emit-all.ts; keys mirror the zh/en pair and
 * missing entries fall back to English at lookup time.
 */
import type { RolloutLocaleId } from '@deepseek-ai/dsh-client-locale'

const it: Record<string, string> = {
  'search.placeholder': 'Cerca…',
  'search.aria': 'Filtra opzioni',
  'status.loading': 'Caricamento opzioni…',
  'status.applying': 'Applicazione in corso…',
  'status.empty': 'Nessuna opzione',
  'overlay.aria': 'Opzioni di /{command}',
  'listbox.aria': 'Corrispondenze per /{command}',
  'notice.imagesUnsupported': '/{command} non accetta allegati immagine; rimuovili prima',
}
const de: Record<string, string> = {
  'search.placeholder': 'Suchen…',
  'search.aria': 'Optionen filtern',
  'status.loading': 'Optionen werden geladen…',
  'status.applying': 'Wird angewendet…',
  'status.empty': 'Keine Optionen',
  'overlay.aria': '/{command}-Optionen',
  'listbox.aria': '/{command}-Treffer',
  'notice.imagesUnsupported': '/{command} akzeptiert keine Bildanhänge; bitte zuerst entfernen',
}
const es: Record<string, string> = {
  'search.placeholder': 'Buscar…',
  'search.aria': 'Filtrar opciones',
  'status.loading': 'Cargando opciones…',
  'status.applying': 'Aplicando…',
  'status.empty': 'Sin opciones',
  'overlay.aria': 'Opciones de /{command}',
  'listbox.aria': 'Coincidencias de /{command}',
  'notice.imagesUnsupported': '/{command} no acepta adjuntos de imagen; elimínalos primero',
}
const fr: Record<string, string> = {
  'search.placeholder': 'Rechercher…',
  'search.aria': 'Filtrer les options',
  'status.loading': 'Chargement des options…',
  'status.applying': 'Application…',
  'status.empty': 'Aucune option',
  'overlay.aria': 'Options de /{command}',
  'listbox.aria': 'Correspondances pour /{command}',
  'notice.imagesUnsupported': "/{command} n'accepte pas les pièces jointes image ; retirez-les d'abord",
}
const ja: Record<string, string> = {
  'search.placeholder': '検索…',
  'search.aria': 'オプションを絞り込み',
  'status.loading': 'オプションを読み込んでいます…',
  'status.applying': '適用しています…',
  'status.empty': 'オプションなし',
  'overlay.aria': '/{command} のオプション',
  'listbox.aria': '/{command} の一致項目',
  'notice.imagesUnsupported': '/{command} は画像の添付ファイルを受け付けません。先に画像を削除してください',
}

export const rolloutCommand: Record<RolloutLocaleId, Record<string, string>> = {
  it, de, es, fr, ja,
}
