/**
 * Rollout-language dictionaries for this package's locale namespace.
 * Emitted by scripts/tmp-i18n-emit-all.ts; keys mirror the zh/en pair and
 * missing entries fall back to English at lookup time.
 */
import type { RolloutLocaleId } from '@deepseek-ai/dsh-client-locale'

const it: Record<string, string> = {
  'title': 'Permessi',
  'description': 'Scegli la modalità di permessi predefinita per le nuove sessioni',
  'loading': 'Caricamento',
  'unavailable': 'Non disponibile',
  'confirm.title': 'Abilitare Full access?',
  'confirm.description': 'Full access consente alle nuove sessioni di ridurre i passaggi di conferma ed eseguire direttamente più azioni, incluse operazioni sensibili, modifiche ai file o comandi esterni. Usalo solo quando ti fidi delle attività successive.',
  'confirm.acknowledge': 'Ho capito i rischi e voglio continuare',
  'confirm.cancel': 'Annulla',
  'confirm.enable': 'Abilita Full access',
}
const de: Record<string, string> = {
  'title': 'Berechtigungen',
  'description': 'Standard-Berechtigungsmodus für neue Sitzungen auswählen',
  'loading': 'Wird geladen',
  'unavailable': 'Nicht verfügbar',
  'confirm.title': 'Full access aktivieren?',
  'confirm.description': 'Mit Full access führen neue Sitzungen weniger Bestätigungsschritte aus und können mehr Aktionen direkt ausführen, einschließlich sensibler Vorgänge, Dateiänderungen oder externer Befehle. Nur verwenden, wenn den nachfolgenden Aufgaben vertraut wird.',
  'confirm.acknowledge': 'Ich habe die Risiken verstanden und möchte fortfahren',
  'confirm.cancel': 'Abbrechen',
  'confirm.enable': 'Full access aktivieren',
}
const es: Record<string, string> = {
  'title': 'Permisos',
  'description': 'Elige el modo de permisos predeterminado para las nuevas sesiones',
  'loading': 'Cargando',
  'unavailable': 'No disponible',
  'confirm.title': '¿Activar Full access?',
  'confirm.description': 'Full access permite que las nuevas sesiones reduzcan los pasos de confirmación y realicen más acciones directamente, incluidas operaciones sensibles, cambios en archivos o comandos externos. Úsalo solo cuando confíes en las tareas siguientes.',
  'confirm.acknowledge': 'Entiendo los riesgos y quiero continuar',
  'confirm.cancel': 'Cancelar',
  'confirm.enable': 'Activar Full access',
}
const fr: Record<string, string> = {
  'title': 'Autorisations',
  'description': "Choisir le mode d'autorisation par défaut des nouvelles sessions",
  'loading': 'Chargement',
  'unavailable': 'Indisponible',
  'confirm.title': 'Activer Full access ?',
  'confirm.description': "Full access permet aux nouvelles sessions de réduire les étapes de confirmation et d'effectuer directement davantage d'actions, y compris des opérations sensibles, des modifications de fichiers ou des commandes externes. À utiliser uniquement si vous avez confiance dans les tâches à venir.",
  'confirm.acknowledge': 'Je comprends les risques et souhaite continuer',
  'confirm.cancel': 'Annuler',
  'confirm.enable': 'Activer Full access',
}
const ja: Record<string, string> = {
  'title': '権限',
  'description': '新しいセッションのデフォルトの権限モードを選択します',
  'loading': '読み込み中',
  'unavailable': '利用不可',
  'confirm.title': 'Full access を有効にしますか？',
  'confirm.description': 'Full access を有効にすると、新しいセッションでは確認ステップが減り、機密性の高い操作、ファイル変更、外部コマンドなど、より多くの操作を直接実行できるようになります。後続のタスクを信頼できる場合にのみ使用してください。',
  'confirm.acknowledge': 'リスクを理解した上で続行します',
  'confirm.cancel': 'キャンセル',
  'confirm.enable': 'Full access を有効にする',
}

export const rolloutSettingsPermission: Record<RolloutLocaleId, Record<string, string>> = {
  it, de, es, fr, ja,
}
