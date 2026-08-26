/**
 * Rollout-language dictionaries for this package's locale namespace.
 * Emitted by scripts/tmp-i18n-emit-all.ts; keys mirror the zh/en pair and
 * missing entries fall back to English at lookup time.
 */
import type { RolloutLocaleId } from '@deepseek-ai/dsh-client-locale'

const it: Record<string, string> = {
  'count.live.one': '{count} job in background in esecuzione',
  'count.live.other': '{count} job in background in esecuzione',
  'count.idle.one': '{count} job in background',
  'count.idle.other': '{count} job in background',
  'list.aria': 'Job in background',
  'status.running': 'in esecuzione',
  'status.stopping': 'in arresto',
  'status.completed': 'completato',
  'status.killed': 'annullato',
  'status.failed': 'non riuscito',
  'duration.seconds': '{seconds}s',
  'duration.minutes': '{minutes}m {seconds}s',
  'duration.hours': '{hours}h {minutes}m',
  'duration.title.live': 'In esecuzione da {duration}',
  'duration.title.done': 'Durata: {duration}',
}
const de: Record<string, string> = {
  'count.live.one': '{count} Hintergrund-Job läuft',
  'count.live.other': '{count} Hintergrund-Jobs laufen',
  'count.idle.one': '{count} Hintergrund-Job',
  'count.idle.other': '{count} Hintergrund-Jobs',
  'list.aria': 'Hintergrund-Jobs',
  'status.running': 'läuft',
  'status.stopping': 'wird gestoppt',
  'status.completed': 'abgeschlossen',
  'status.killed': 'abgebrochen',
  'status.failed': 'fehlgeschlagen',
  'duration.seconds': '{seconds} Sek.',
  'duration.minutes': '{minutes} Min. {seconds} Sek.',
  'duration.hours': '{hours} Std. {minutes} Min.',
  'duration.title.live': 'Läuft seit {duration}',
  'duration.title.done': 'Dauer: {duration}',
}
const es: Record<string, string> = {
  'count.live.one': '{count} tarea en segundo plano en ejecución',
  'count.live.other': '{count} tareas en segundo plano en ejecución',
  'count.idle.one': '{count} tarea en segundo plano',
  'count.idle.other': '{count} tareas en segundo plano',
  'list.aria': 'Tareas en segundo plano',
  'status.running': 'en ejecución',
  'status.stopping': 'deteniendo',
  'status.completed': 'completada',
  'status.killed': 'cancelada',
  'status.failed': 'fallida',
  'duration.seconds': '{seconds}s',
  'duration.minutes': '{minutes}m {seconds}s',
  'duration.hours': '{hours}h {minutes}m',
  'duration.title.live': 'En ejecución desde hace {duration}',
  'duration.title.done': 'Duró {duration}',
}
const fr: Record<string, string> = {
  'count.live.one': '{count} tâche en arrière-plan en cours',
  'count.live.other': '{count} tâches en arrière-plan en cours',
  'count.idle.one': '{count} tâche en arrière-plan',
  'count.idle.other': '{count} tâches en arrière-plan',
  'list.aria': 'Tâches en arrière-plan',
  'status.running': 'en cours',
  'status.stopping': 'arrêt en cours',
  'status.completed': 'terminé',
  'status.killed': 'annulé',
  'status.failed': 'échoué',
  'duration.seconds': '{seconds} s',
  'duration.minutes': '{minutes} min {seconds} s',
  'duration.hours': '{hours} h {minutes} min',
  'duration.title.live': 'En cours depuis {duration}',
  'duration.title.done': 'Durée : {duration}',
}
const ja: Record<string, string> = {
  'count.live.one': 'バックグラウンドジョブが {count} 件実行中',
  'count.live.other': 'バックグラウンドジョブが {count} 件実行中',
  'count.idle.one': 'バックグラウンドジョブ {count} 件',
  'count.idle.other': 'バックグラウンドジョブ {count} 件',
  'list.aria': 'バックグラウンドジョブ',
  'status.running': '実行中',
  'status.stopping': '停止中',
  'status.completed': '完了',
  'status.killed': 'キャンセル済み',
  'status.failed': '失敗',
  'duration.seconds': '{seconds}秒',
  'duration.minutes': '{minutes}分{seconds}秒',
  'duration.hours': '{hours}時間{minutes}分',
  'duration.title.live': '{duration} 実行中',
  'duration.title.done': '所要時間: {duration}',
}

export const rolloutJob: Record<RolloutLocaleId, Record<string, string>> = {
  it, de, es, fr, ja,
}
