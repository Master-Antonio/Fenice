/**
 * Rollout-language dictionaries for this package's locale namespace.
 * Emitted by scripts/tmp-i18n-emit-all.ts; keys mirror the zh/en pair and
 * missing entries fall back to English at lookup time.
 */
import type { RolloutLocaleId } from '@deepseek-ai/dsh-client-locale'

const it: Record<string, string> = {
  'section.files': 'File e cartelle',
  'section.sessions': 'Conversazioni delle sessioni',
  'candidate.file': 'File',
  'candidate.folder': 'Cartella',
  'candidate.session': 'Sessione',
  'candidate.noCwd': '(nessun cwd)',
}
const de: Record<string, string> = {
  'section.files': 'Dateien & Ordner',
  'section.sessions': 'Sitzungs-Unterhaltungen',
  'candidate.file': 'Datei',
  'candidate.folder': 'Ordner',
  'candidate.session': 'Sitzung',
  'candidate.noCwd': '(kein cwd)',
}
const es: Record<string, string> = {
  'section.files': 'Archivos y carpetas',
  'section.sessions': 'Conversaciones de sesión',
  'candidate.file': 'Archivo',
  'candidate.folder': 'Carpeta',
  'candidate.session': 'Sesión',
  'candidate.noCwd': '(sin cwd)',
}
const fr: Record<string, string> = {
  'section.files': 'Fichiers et dossiers',
  'section.sessions': 'Conversations de session',
  'candidate.file': 'Fichier',
  'candidate.folder': 'Dossier',
  'candidate.session': 'Session',
  'candidate.noCwd': '(pas de répertoire de travail)',
}
const ja: Record<string, string> = {
  'section.files': 'ファイルとフォルダー',
  'section.sessions': 'セッションの会話',
  'candidate.file': 'ファイル',
  'candidate.folder': 'フォルダー',
  'candidate.session': 'セッション',
  'candidate.noCwd': '（作業ディレクトリなし）',
}

export const rolloutReference: Record<RolloutLocaleId, Record<string, string>> = {
  it, de, es, fr, ja,
}
