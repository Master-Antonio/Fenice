/**
 * JA rollout dictionaries for the shared namespaces.
 * Key parity with the zh/en pair is enforced by the generator that emitted
 * this file; missing keys would fall back to English at lookup time.
 */
import type { CommonKey } from '../index.ts'
import type { SettingsLocaleKey } from '../settings.ts'

export const common: Record<CommonKey, string> = {
  'ok': 'OK',
  'cancel': 'キャンセル',
  'close': '閉じる',
  'copy': 'コピー',
  'copied': 'コピーしました',
  'retry': '再試行',
  'loading': '読み込み中…',
  'load.failed': '読み込みに失敗しました',
  'submit': '送信',
  'submitting': '送信中…',
  'next': '次へ',
  'previous': '前へ',
  'skip': 'スキップ',
  'delete': '削除',
  'edit': '編集',
  'save': '保存',
  'search': '検索',
  'more': 'その他',
  'collapse': '折りたたむ',
  'expand': '展開',
  'back': '戻る',
  'unknown': '不明',
  'none': 'なし',
  'truncated': '切り詰め済み',
}

export const settingsLocale: Record<SettingsLocaleKey, string> = {
  'language.title': '言語',
}
