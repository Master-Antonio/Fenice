/**
 * Rollout-language dictionaries for this package's locale namespace.
 * Emitted by scripts/tmp-i18n-emit-all.ts; keys mirror the zh/en pair and
 * missing entries fall back to English at lookup time.
 */
import type { RolloutLocaleId } from '@deepseek-ai/dsh-client-locale'

const it: Record<string, string> = {
  'action.like': 'Buona risposta',
  'action.likeActive': 'Rimuovi valutazione',
  'action.dislike': 'Risposta scarsa',
  'action.dislikeActive': 'Rimuovi valutazione',
  'note.open': 'Aggiungi una nota',
  'note.dialog': 'Feedback',
  'note.placeholder': 'Cosa andava bene o cosa è andato storto? (facoltativo)',
  'note.save': 'Salva',
  'note.cancel': 'Annulla',
  'note.aria': 'Nota di feedback',
  'error.conflict': 'Questo feedback è stato modificato altrove; viene mostrato lo stato più recente',
  'error.load': 'Impossibile caricare il feedback',
  'error.generic': 'Impossibile salvare il feedback',
}
const de: Record<string, string> = {
  'action.like': 'Gute Antwort',
  'action.likeActive': 'Bewertung entfernen',
  'action.dislike': 'Schlechte Antwort',
  'action.dislikeActive': 'Bewertung entfernen',
  'note.open': 'Notiz hinzufügen',
  'note.dialog': 'Feedback',
  'note.placeholder': 'Was war gut oder was ist schiefgelaufen? (optional)',
  'note.save': 'Speichern',
  'note.cancel': 'Abbrechen',
  'note.aria': 'Feedback-Notiz',
  'error.conflict': 'Dieses Feedback wurde an anderer Stelle geändert; der neueste Stand wird angezeigt',
  'error.load': 'Feedback konnte nicht geladen werden',
  'error.generic': 'Feedback konnte nicht gespeichert werden',
}
const es: Record<string, string> = {
  'action.like': 'Buena respuesta',
  'action.likeActive': 'Quitar valoración',
  'action.dislike': 'Mala respuesta',
  'action.dislikeActive': 'Quitar valoración',
  'note.open': 'Añadir una nota',
  'note.dialog': 'Comentarios',
  'note.placeholder': '¿Qué estuvo bien o qué falló? (opcional)',
  'note.save': 'Guardar',
  'note.cancel': 'Cancelar',
  'note.aria': 'Nota de comentarios',
  'error.conflict': 'Estos comentarios cambiaron en otro lugar; se muestra el estado más reciente',
  'error.load': 'No se pudieron cargar los comentarios',
  'error.generic': 'No se pudieron guardar los comentarios',
}
const fr: Record<string, string> = {
  'action.like': 'Bonne réponse',
  'action.likeActive': 'Retirer la note',
  'action.dislike': 'Mauvaise réponse',
  'action.dislikeActive': 'Retirer la note',
  'note.open': 'Ajouter une remarque',
  'note.dialog': 'Votre avis',
  'note.placeholder': "Qu'est-ce qui était bien, ou qu'est-ce qui a posé problème ? (facultatif)",
  'note.save': 'Enregistrer',
  'note.cancel': 'Annuler',
  'note.aria': 'Remarque',
  'error.conflict': 'Ce retour a été modifié ailleurs ; le dernier état est affiché',
  'error.load': 'Impossible de charger le retour',
  'error.generic': "Impossible d'enregistrer le retour",
}
const ja: Record<string, string> = {
  'action.like': '良い回答',
  'action.likeActive': '評価を解除',
  'action.dislike': '問題のある回答',
  'action.dislikeActive': '評価を解除',
  'note.open': 'メモを追加',
  'note.dialog': 'フィードバック',
  'note.placeholder': 'どこが良かったか、どこに問題があったかをご記入ください（省略可）',
  'note.save': '保存',
  'note.cancel': 'キャンセル',
  'note.aria': 'フィードバックのメモ',
  'error.conflict': 'このフィードバックは他の場所で変更されました。最新の状態を表示しています',
  'error.load': 'フィードバックを読み込めませんでした',
  'error.generic': 'フィードバックを保存できませんでした',
}

export const rolloutFeedback: Record<RolloutLocaleId, Record<string, string>> = {
  it, de, es, fr, ja,
}
