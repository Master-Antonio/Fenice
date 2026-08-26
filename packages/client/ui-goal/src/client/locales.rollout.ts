/**
 * Rollout-language dictionaries for this package's locale namespace.
 * Emitted by scripts/tmp-i18n-emit-all.ts; keys mirror the zh/en pair and
 * missing entries fall back to English at lookup time.
 */
import type { RolloutLocaleId } from '@deepseek-ai/dsh-client-locale'

const it: Record<string, string> = {
  'phase.active': 'Obiettivo in corso',
  'phase.paused': 'Obiettivo in pausa',
  'phase.blocked': 'Obiettivo bloccato',
  'objective.aria': "Testo dell'obiettivo",
  'commandInput.aria': 'Inserimento comando',
  'action.save': 'Salva obiettivo',
  'action.cancel': 'Annulla modifica',
  'action.pause': 'Sospendi obiettivo',
  'action.resume': 'Riprendi obiettivo',
  'action.edit': 'Modifica obiettivo',
  'action.clear': 'Cancella obiettivo',
}
const de: Record<string, string> = {
  'phase.active': 'Laufendes Ziel',
  'phase.paused': 'Pausiertes Ziel',
  'phase.blocked': 'Blockiertes Ziel',
  'objective.aria': 'Zielinhalt',
  'commandInput.aria': 'Befehlseingabe',
  'action.save': 'Ziel speichern',
  'action.cancel': 'Bearbeiten abbrechen',
  'action.pause': 'Ziel pausieren',
  'action.resume': 'Ziel fortsetzen',
  'action.edit': 'Ziel bearbeiten',
  'action.clear': 'Ziel löschen',
}
const es: Record<string, string> = {
  'phase.active': 'Objetivo en curso',
  'phase.paused': 'Objetivo en pausa',
  'phase.blocked': 'Objetivo bloqueado',
  'objective.aria': 'Contenido del objetivo',
  'commandInput.aria': 'Entrada de comando',
  'action.save': 'Guardar objetivo',
  'action.cancel': 'Cancelar edición',
  'action.pause': 'Pausar objetivo',
  'action.resume': 'Reanudar objetivo',
  'action.edit': 'Editar objetivo',
  'action.clear': 'Borrar objetivo',
}
const fr: Record<string, string> = {
  'phase.active': 'Objectif en cours',
  'phase.paused': 'Objectif en pause',
  'phase.blocked': 'Objectif bloqué',
  'objective.aria': "Contenu de l'objectif",
  'commandInput.aria': 'Entrée de commande',
  'action.save': "Enregistrer l'objectif",
  'action.cancel': 'Annuler la modification',
  'action.pause': "Mettre l'objectif en pause",
  'action.resume': "Reprendre l'objectif",
  'action.edit': "Modifier l'objectif",
  'action.clear': "Effacer l'objectif",
}
const ja: Record<string, string> = {
  'phase.active': '進行中のゴール',
  'phase.paused': '一時停止中のゴール',
  'phase.blocked': 'ブロック中のゴール',
  'objective.aria': 'ゴールの内容',
  'commandInput.aria': 'コマンド入力',
  'action.save': 'ゴールを保存',
  'action.cancel': '編集をキャンセル',
  'action.pause': 'ゴールを一時停止',
  'action.resume': 'ゴールを再開',
  'action.edit': 'ゴールを編集',
  'action.clear': 'ゴールをクリア',
}

export const rolloutGoal: Record<RolloutLocaleId, Record<string, string>> = {
  it, de, es, fr, ja,
}
