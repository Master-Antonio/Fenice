/** Rollout dictionaries for the `trajectory` namespace. */
import type { RolloutLocaleId } from '@deepseek-ai/dsh-client-locale'
import type { TrajectoryKey } from './locales.ts'

const it: Record<TrajectoryKey, string> = {
  'view.trajectory': 'Traiettoria',
  'toolbar.aria': 'Barra strumenti traiettoria',
  'toolbar.duration': 'Durata',
  'toolbar.useActualDuration': 'Usa durata effettiva',
  'toolbar.useEqualWidth': 'Usa operazioni a larghezza uguale',
  'toolbar.actualTime': 'Tempo effettivo',
  'toolbar.turns': 'Turni',
  'toolbar.expandTurns': 'Espandi turni',
  'toolbar.collapseTurns': 'Comprimi turni',
  'toolbar.calls': 'Chiamate',
  'toolbar.expandCalls': 'Espandi chiamate',
  'toolbar.collapseCalls': 'Comprimi chiamate',
  'toolbar.search': 'Cerca nella traiettoria',
  'toolbar.searchPlaceholder': 'Cerca',
}

const de: Record<TrajectoryKey, string> = {
  'view.trajectory': 'Verlauf',
  'toolbar.aria': 'Verlaufs-Symbolleiste',
  'toolbar.duration': 'Dauer',
  'toolbar.useActualDuration': 'Tatsächliche Dauer verwenden',
  'toolbar.useEqualWidth': 'Operationen gleich breit anzeigen',
  'toolbar.actualTime': 'Tatsächliche Zeit',
  'toolbar.turns': 'Durchläufe',
  'toolbar.expandTurns': 'Durchläufe aufklappen',
  'toolbar.collapseTurns': 'Durchläufe einklappen',
  'toolbar.calls': 'Aufrufe',
  'toolbar.expandCalls': 'Aufrufe aufklappen',
  'toolbar.collapseCalls': 'Aufrufe einklappen',
  'toolbar.search': 'Verlauf durchsuchen',
  'toolbar.searchPlaceholder': 'Suchen',
}

const es: Record<TrajectoryKey, string> = {
  'view.trajectory': 'Trayectoria',
  'toolbar.aria': 'Barra de herramientas de trayectoria',
  'toolbar.duration': 'Duración',
  'toolbar.useActualDuration': 'Usar duración real',
  'toolbar.useEqualWidth': 'Usar operaciones del mismo ancho',
  'toolbar.actualTime': 'Tiempo real',
  'toolbar.turns': 'Turnos',
  'toolbar.expandTurns': 'Expandir turnos',
  'toolbar.collapseTurns': 'Contraer turnos',
  'toolbar.calls': 'Llamadas',
  'toolbar.expandCalls': 'Expandir llamadas',
  'toolbar.collapseCalls': 'Contraer llamadas',
  'toolbar.search': 'Buscar en la trayectoria',
  'toolbar.searchPlaceholder': 'Buscar',
}

const fr: Record<TrajectoryKey, string> = {
  'view.trajectory': 'Trajectoire',
  'toolbar.aria': 'Barre d’outils de trajectoire',
  'toolbar.duration': 'Durée',
  'toolbar.useActualDuration': 'Utiliser la durée réelle',
  'toolbar.useEqualWidth': 'Utiliser des opérations de largeur égale',
  'toolbar.actualTime': 'Temps réel',
  'toolbar.turns': 'Tours',
  'toolbar.expandTurns': 'Développer les tours',
  'toolbar.collapseTurns': 'Réduire les tours',
  'toolbar.calls': 'Appels',
  'toolbar.expandCalls': 'Développer les appels',
  'toolbar.collapseCalls': 'Réduire les appels',
  'toolbar.search': 'Rechercher dans la trajectoire',
  'toolbar.searchPlaceholder': 'Rechercher',
}

const ja: Record<TrajectoryKey, string> = {
  'view.trajectory': '軌跡',
  'toolbar.aria': '軌跡ツールバー',
  'toolbar.duration': '期間',
  'toolbar.useActualDuration': '実際の期間を使用',
  'toolbar.useEqualWidth': '操作を同じ幅で表示',
  'toolbar.actualTime': '実時間',
  'toolbar.turns': 'ターン',
  'toolbar.expandTurns': 'ターンを展開',
  'toolbar.collapseTurns': 'ターンを折りたたむ',
  'toolbar.calls': '呼び出し',
  'toolbar.expandCalls': '呼び出しを展開',
  'toolbar.collapseCalls': '呼び出しを折りたたむ',
  'toolbar.search': '軌跡を検索',
  'toolbar.searchPlaceholder': '検索',
}

export const rolloutTrajectory: Record<RolloutLocaleId, Record<TrajectoryKey, string>> = { it, de, es, fr, ja }
