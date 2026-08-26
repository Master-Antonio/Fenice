/** Locale preference stored in the Host user-settings document. */

import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by the locale plugin. */
export const LOCALE_SETTINGS_NAMESPACE = 'locale'

/** Field carrying an explicit locale selection; absence delegates to the browser. */
export const LOCALE_PREFERENCE_FIELD = 'preference'

/**
 * Locale identifiers shipped by the browser client. `zh`/`en` are REQUIRED in
 * every registered namespace (the bilingual-balance invariant); the rest are
 * rollout locales — optional per namespace, falling back to English per key,
 * so coverage can land surface by surface without blocking a release.
 */
export const LOCALE_IDS = ['zh', 'en', 'it', 'de', 'es', 'fr', 'ja'] as const

/** Shipped locale identifier. */
export type LocaleId = typeof LOCALE_IDS[number]

/** Locales beyond the required bilingual pair; namespaces may omit them. */
export const ROLLOUT_LOCALE_IDS = ['it', 'de', 'es', 'fr', 'ja'] as const

/** Rollout locale identifier. */
export type RolloutLocaleId = typeof ROLLOUT_LOCALE_IDS[number]

/** Durable locale section shared by the Host schema and the browser scope. */
export interface LocaleSettings {
  /** Explicit locale selection; absence delegates to the browser. */
  preference?: LocaleId
}

/** Durable locale schema; also the wire envelope the browser scope validates against. */
export const LocaleSettingsSchema: z<LocaleSettings> = z.object({
  [LOCALE_PREFERENCE_FIELD]: z.union([...LOCALE_IDS]).required(false),
})
