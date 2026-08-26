/**
 * Rollout-language dictionaries for the Agent Lab section. Key parity with
 * locales.ts is compiler-enforced via AgentLabKey.
 */
import type { RolloutLocaleId } from '@deepseek-ai/dsh-client-locale'
import type { AgentLabKey } from './locales.ts'

const it: Record<AgentLabKey, string> = {
  nav: 'Agent Lab',
  title: 'Agent Lab — esperimenti',
  description: 'Interruttori sperimentali per l\u2019agente di coding. Le metriche finiscono nella directory esterna Agent-Lab (~/.dsh-agent-lab/telemetry).',
  metersNote: 'I due misuratori restano attivi: raccolgono le evidenze prima/dopo.',
  comingSoon: 'in arrivo',
  flagCircuitBreaker: 'Circuit breaker — salta un fornitore in difficoltà dopo ripetuti guasti ravvicinati',
  flagCascadeMetrics: 'Metriche cascata — registra ogni hop di fallback nella telemetria esterna',
  flagTurnTelemetry: 'Telemetria turno — token per turno, cache lette, latenza, esito',
  flagPromptCacheStablePrefix: 'Prefisso stabile — ordine strumenti deterministico per cache-hit del provider',
  flagCompactionPointer: 'Puntatore compattazione — collega gli output troncati alla copia integrale',
  flagTierRouter: 'Router a livelli — abbina difficoltà del compito e costo del modello',
  flagSessionTruncate: 'Troncamento sessione — rewind/eliminazione davvero in-place',
  flagMcpServer: 'Server MCP — espone sessioni/strumenti via MCP',
  flagSemanticMemory: 'Memoria semantica — ricerca per significato nelle sessioni passate',
  flagSelfHealingLoop: 'Ciclo auto-riparativo — riproduci/sistema/ritesta con limiti',
}

const de: Record<AgentLabKey, string> = {
  nav: 'Agent Lab',
  title: 'Agent Lab — experimentelle Schalter',
  description: 'Experimentelle Schalter für den Coding-Agenten. Messdaten landen im externen Agent-Lab-Verzeichnis (~/.dsh-agent-lab/telemetry).',
  metersNote: 'Die beiden Zähler bleiben standardmäßig an: Sie sammeln die Vorher/Nachher-Evidenz.',
  comingSoon: 'demnächst',
  flagCircuitBreaker: 'Circuit Breaker — überspringt einen ausgefallenen Anbieter nach schnellen Fehlern',
  flagCascadeMetrics: 'Kaskaden-Metriken — jeder Fallback-Hop in die externe Telemetrie',
  flagTurnTelemetry: 'Turn-Telemetrie — Token pro Durchlauf, Cache-Treffer, Latenz, Ergebnis',
  flagPromptCacheStablePrefix: 'Stabiles Request-Präfix — deterministische Tool-Reihenfolge für Cache-Treffer',
  flagCompactionPointer: 'Kompaktierung-Zeiger — gekürzte Tool-Ausgaben mit Vollkopie verknüpfen',
  flagTierRouter: 'Tier-Router — Aufgabenschwierigkeit zu Modellkosten zuordnen',
  flagSessionTruncate: 'Sitzungs-Kürzung — echtes Rewind/Löschen an Ort und Stelle',
  flagMcpServer: 'MCP-Server — Sitzungen/Tools über MCP bereitstellen',
  flagSemanticMemory: 'Semantischer Speicher — bedeutungsbasierte Suche in alten Sitzungen',
  flagSelfHealingLoop: 'Self-Healing-Schleife — begrenzt reproduzieren/fixen/neu testen',
}

const es: Record<AgentLabKey, string> = {
  nav: 'Agent Lab',
  title: 'Agent Lab — interruptores experimentales',
  description: 'Interruptores experimentales para el agente de código. Las métricas se escriben en el directorio externo Agent-Lab (~/.dsh-agent-lab/telemetry).',
  metersNote: 'Los dos medidores permanecen activos: recogen la evidencia antes/después.',
  comingSoon: 'próximamente',
  flagCircuitBreaker: 'Circuit breaker — omite un proveedor que falla tras fallos rápidos repetidos',
  flagCascadeMetrics: 'Métricas de cascada — registra cada salto de respaldo en telemetría externa',
  flagTurnTelemetry: 'Telemetría de turno — tokens por turno, lecturas de caché, latencia, resultado',
  flagPromptCacheStablePrefix: 'Prefijo estable — orden de herramientas determinista para aciertos de caché',
  flagCompactionPointer: 'Puntero de compactación — enlaza salidas truncadas con su copia completa',
  flagTierRouter: 'Enrutador por niveles — ajusta dificultad de la tarea al coste del modelo',
  flagSessionTruncate: 'Truncado de sesión — rebobinar/borrar realmente en su sitio',
  flagMcpServer: 'Servidor MCP — expone sesiones/herramientas vía MCP',
  flagSemanticMemory: 'Memoria semántica — búsqueda por significado en sesiones pasadas',
  flagSelfHealingLoop: 'Bucle autocurativo — reproducir/arreglar/reprobar con límites',
}

const fr: Record<AgentLabKey, string> = {
  nav: 'Agent Lab',
  title: 'Agent Lab — commutateurs expérimentaux',
  description: 'Commutateurs expérimentaux pour l\u2019agent de code. Les métriques sont écrites dans le répertoire externe Agent-Lab (~/.dsh-agent-lab/telemetry).',
  metersNote: 'Les deux compteurs restent actifs par défaut : ils collectent les preuves avant/après.',
  comingSoon: 'bientôt disponible',
  flagCircuitBreaker: 'Disjoncteur — ignore un fournisseur défaillant après des échecs rapides répétés',
  flagCascadeMetrics: 'Métriques de cascade — enregistre chaque bascule dans la télémétrie externe',
  flagTurnTelemetry: 'Télémétrie par tour — tokens, lectures de cache, latence, résultat',
  flagPromptCacheStablePrefix: 'Préfixe stable — ordre d\u2019outils déterministe pour les succès de cache',
  flagCompactionPointer: 'Pointeur de compaction — relie les sorties tronquées à leur copie complète',
  flagTierRouter: 'Routeur à niveaux — associe difficulté de la tâche et coût du modèle',
  flagSessionTruncate: 'Troncature de session — rembobinage/suppression réellement en place',
  flagMcpServer: 'Serveur MCP — expose sessions/outils via MCP',
  flagSemanticMemory: 'Mémoire sémantique — recherche par sens dans les sessions passées',
  flagSelfHealingLoop: 'Boucle auto-réparatrice — reproduire/corriger/retester avec limites',
}

const ja: Record<AgentLabKey, string> = {
  nav: 'Agent Lab',
  title: 'Agent Lab —— 実験スイッチ',
  description: 'コーディングエージェントの実験スイッチ。計測データは外部の Agent-Lab ディレクトリ（~/.dsh-agent-lab/telemetry）に書き込まれます。',
  metersNote: '2つの計測スイッチは既定でオン：前後比較の証拠を収集します。',
  comingSoon: '近日提供',
  flagCircuitBreaker: 'サーキットブレーカー——短時間の連続失敗でそのプロバイダーをスキップ',
  flagCascadeMetrics: 'カスケード計測——フォールバックの各ホップを外部テレメトリに記録',
  flagTurnTelemetry: 'ターン計測——ターン毎のトークン・キャッシュ読み・遅延・結果',
  flagPromptCacheStablePrefix: '安定リクエストプレフィックス——ツール順を決定論的にしキャッシュ命中を向上',
  flagCompactionPointer: '圧縮ポインター——切り詰めたツール出力へ全文コピーをリンク',
  flagTierRouter: 'ティアルーター——課題の難易度とモデルコストを対応付け',
  flagSessionTruncate: 'セッション切詰め——本来の場所での巻き戻し/削除',
  flagMcpServer: 'MCPサーバー——セッション/ツールを MCP 経由で公開',
  flagSemanticMemory: '意味ベース記憶——過去セッションを意味で検索',
  flagSelfHealingLoop: '自己修復ループ——上限付きの再現/修正/再テスト',
}

/** Per-locale dictionaries; spread into the register call. */
export const rolloutAgentLab: Record<RolloutLocaleId, Record<AgentLabKey, string>> = { it, de, es, fr, ja }
