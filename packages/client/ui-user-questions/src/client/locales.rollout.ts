/**
 * Rollout-language dictionaries for this package's locale namespace.
 * Emitted by scripts/tmp-i18n-emit-all.ts; keys mirror the zh/en pair and
 * missing entries fall back to English at lookup time.
 */
import type { RolloutLocaleId } from '@deepseek-ai/dsh-client-locale'

const it: Record<string, string> = {
  'error.incomplete': 'Completa prima questa domanda.',
  'error.unanswered': "Seleziona un'opzione o inserisci una risposta personalizzata.",
  'nav.prev': 'Domanda precedente',
  'nav.next': 'Domanda successiva',
  'nav.minimize': 'Comprimi la scheda della domanda',
  'nav.maximize': 'Espandi la scheda della domanda',
  'nav.cancel': 'Ignora tutte le domande',
  'option.recommended': 'Consigliato',
  'custom.placeholder': 'Scrivi la tua risposta',
  'action.skip': 'Salta questa domanda',
  'action.next': 'Avanti',
  'plan.header': 'Revisione del piano',
  'plan.approve': 'Approva',
  'plan.decline': 'Rifiuta',
  'plan.discuss': 'Parliamone in chat',
}
const de: Record<string, string> = {
  'error.incomplete': 'Bitte zuerst diese Frage beantworten.',
  'error.unanswered': 'Bitte eine Option auswählen oder eine eigene Antwort eingeben.',
  'nav.prev': 'Vorherige Frage',
  'nav.next': 'Nächste Frage',
  'nav.minimize': 'Fragekarte einklappen',
  'nav.maximize': 'Fragekarte ausklappen',
  'nav.cancel': 'Alle Fragen verwerfen',
  'option.recommended': 'Empfohlen',
  'custom.placeholder': 'Antwort eingeben',
  'action.skip': 'Diese Frage überspringen',
  'action.next': 'Weiter',
  'plan.header': 'Planprüfung',
  'plan.approve': 'Genehmigen',
  'plan.decline': 'Ablehnen',
  'plan.discuss': 'Darüber chatten',
}
const es: Record<string, string> = {
  'error.incomplete': 'Completa primero esta pregunta.',
  'error.unanswered': 'Selecciona una opción o introduce una respuesta personalizada.',
  'nav.prev': 'Pregunta anterior',
  'nav.next': 'Pregunta siguiente',
  'nav.minimize': 'Contraer la tarjeta de pregunta',
  'nav.maximize': 'Expandir la tarjeta de pregunta',
  'nav.cancel': 'Descartar todas las preguntas',
  'option.recommended': 'Recomendado',
  'custom.placeholder': 'Escribe tu respuesta',
  'action.skip': 'Saltar esta pregunta',
  'action.next': 'Siguiente',
  'plan.header': 'Revisión del plan',
  'plan.approve': 'Aprobar',
  'plan.decline': 'Rechazar',
  'plan.discuss': 'Discutirlo en el chat',
}
const fr: Record<string, string> = {
  'error.incomplete': "Veuillez d'abord répondre à cette question.",
  'error.unanswered': 'Veuillez choisir une option ou saisir une réponse personnalisée.',
  'nav.prev': 'Question précédente',
  'nav.next': 'Question suivante',
  'nav.minimize': 'Réduire la carte de question',
  'nav.maximize': 'Développer la carte de question',
  'nav.cancel': 'Abandonner toutes les questions',
  'option.recommended': 'Recommandé',
  'custom.placeholder': 'Saisissez votre réponse',
  'action.skip': 'Ignorer cette question',
  'action.next': 'Suivant',
  'plan.header': 'Validation du plan',
  'plan.approve': 'Approuver',
  'plan.decline': 'Refuser',
  'plan.discuss': 'Aller en discuter dans la conversation',
}
const ja: Record<string, string> = {
  'error.incomplete': 'まずこの質問に回答してください。',
  'error.unanswered': '選択肢を選ぶか、自由回答を入力してください。',
  'nav.prev': '前の質問',
  'nav.next': '次の質問',
  'nav.minimize': '質問カードを折りたたむ',
  'nav.maximize': '質問カードを展開',
  'nav.cancel': '質問をすべて破棄',
  'option.recommended': '推奨',
  'custom.placeholder': '回答を入力',
  'action.skip': 'この質問をスキップ',
  'action.next': '次へ',
  'plan.header': 'プランレビュー',
  'plan.approve': '承認',
  'plan.decline': '拒否',
  'plan.discuss': 'チャットで相談',
}

export const rolloutQuestion: Record<RolloutLocaleId, Record<string, string>> = {
  it, de, es, fr, ja,
}
