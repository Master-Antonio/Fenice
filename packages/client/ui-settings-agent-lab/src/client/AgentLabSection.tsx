import { useCallback, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { AgentLabKey } from './locales.ts'
import css from './AgentLabSection.module.css'

/** Flags that ship with this build; the rest render a "coming soon" badge. */
const IMPLEMENTED: readonly AgentLabKey[] = [
  'flagCircuitBreaker',
  'flagCascadeMetrics',
  'flagTurnTelemetry',
  'flagPromptCacheStablePrefix',
  'flagCompactionPointer',
  'flagTierRouter',
  'flagSelfHealingLoop',
]

/** Ordered flag rows: section key + its locale label key. */
const ROWS: readonly { flag: string; labelKey: AgentLabKey }[] = [
  { flag: 'circuitBreaker', labelKey: 'flagCircuitBreaker' },
  { flag: 'cascadeMetrics', labelKey: 'flagCascadeMetrics' },
  { flag: 'turnTelemetry', labelKey: 'flagTurnTelemetry' },
  { flag: 'promptCacheStablePrefix', labelKey: 'flagPromptCacheStablePrefix' },
  { flag: 'compactionPointer', labelKey: 'flagCompactionPointer' },
  { flag: 'tierRouter', labelKey: 'flagTierRouter' },
  { flag: 'sessionTruncate', labelKey: 'flagSessionTruncate' },
  { flag: 'mcpServer', labelKey: 'flagMcpServer' },
  { flag: 'semanticMemory', labelKey: 'flagSemanticMemory' },
  { flag: 'selfHealingLoop', labelKey: 'flagSelfHealingLoop' },
]

/** Registration-side face handed to the section by the plugin. */
export interface AgentLabSectionInjected {
  /** Read the current mirrored flags map (stable reference until a change). */
  getFlags: () => Record<string, boolean | undefined>
  /** Subscribe to flag-map changes (store identity is stable across writes). */
  subscribe: (listener: () => void) => () => void
  /** Optimistically toggle a flag and persist it durably. */
  setFlag: (flag: string, value: boolean) => void
}

export type AgentLabSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.agentLab'>
  & InjectFace<AgentLabSectionInjected>

/**
 * The Agent Lab section: ten durable experiment switches over the `agent-lab`
 * settings namespace, rendered from the mirrored flags store. The `__busy`
 * synthetic key carries an in-flight toggle so its checkbox stays disabled
 * until the durable write settles.
 */
export function AgentLabSection(props: AgentLabSectionProps): ReactNode {
  const { getFlags, subscribe, setFlag, t } = props
  const getSnapshot = useCallback(() => getFlags(), [getFlags])
  const flags = useSyncExternalStore(subscribe, getSnapshot)
  const [busyFlag, setBusyFlag] = useState<string | undefined>(undefined)

  const toggle = useCallback((flag: string) => {
    setBusyFlag(flag)
    setFlag(flag, !(flags[flag] === true))
    // The plugin reverts optimistic toggles on refused writes; clear the busy
    // marker on a microtask so a fast durable write never leaves it stuck.
    queueMicrotask(() => { setBusyFlag(undefined) })
  }, [flags, setFlag])

  return (
    <div className={css.root}>
      <h2 className={css.title}>{t('title')}</h2>
      <p className={css.description}>{t('description')}</p>
      <div className={css.rows} role="group" aria-label={t('title')}>
        {ROWS.map(({ flag, labelKey }) => {
          const implemented = IMPLEMENTED.includes(labelKey)
          const isBusy = busyFlag === flag
          return (
            <div key={flag} className={css.rowWrap}>
              <label className={css.row}>
                <input
                  type="checkbox"
                  checked={flags[flag] === true}
                  disabled={isBusy}
                  onChange={() => { toggle(flag) }}
                  aria-label={t(labelKey)}
                />
                <span className={css.label}>{t(labelKey)}</span>
              </label>
              {!implemented && (
                <span className={css.badge} data-coming-soon>{t('comingSoon')}</span>
              )}
            </div>
          )
        })}
      </div>
      <p className={css.note}>{t('metersNote')}</p>
    </div>
  )
}
