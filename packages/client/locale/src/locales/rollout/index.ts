/** Aggregated rollout dictionaries for the locale-owned namespaces. */
import type { RolloutLocaleId } from '../../locale-settings.ts'
import type { CommonKey } from '../index.ts'
import type { SettingsLocaleKey } from '../settings.ts'
import { common as itCommon, settingsLocale as itSettings } from './it.ts'
import { common as deCommon, settingsLocale as deSettings } from './de.ts'
import { common as esCommon, settingsLocale as esSettings } from './es.ts'
import { common as frCommon, settingsLocale as frSettings } from './fr.ts'
import { common as jaCommon, settingsLocale as jaSettings } from './ja.ts'

/** Shared-vocabulary dictionaries per rollout locale (EN fallback covers gaps elsewhere). */
export const rolloutCommon: Record<RolloutLocaleId, Record<CommonKey, string>> = {
  it: itCommon, de: deCommon, es: esCommon, fr: frCommon, ja: jaCommon,
}

/** Language-row dictionaries per rollout locale. */
export const rolloutSettingsLocale: Record<RolloutLocaleId, Record<SettingsLocaleKey, string>> = {
  it: itSettings, de: deSettings, es: esSettings, fr: frSettings, ja: jaSettings,
}
