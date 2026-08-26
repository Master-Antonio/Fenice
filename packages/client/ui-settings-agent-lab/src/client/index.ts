/** Agent-Lab experimental switches registered into Web Settings. */

import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { AgentLabSection, type AgentLabSectionInjected } from './AgentLabSection.tsx'
import { createAgentLabStore } from './store.ts'
import { rolloutAgentLab } from './locales.rollout.ts'
import { en, zh, type AgentLabKey } from './locales.ts'

export type { AgentLabKey } from './locales.ts'
export type { AgentLabSectionInjected, AgentLabSectionProps } from './AgentLabSection.tsx'
export type { AgentLabState } from './store.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Agent-Lab experiment switches copy. */
    'settings.agentLab': AgentLabKey
  }
}

/** Dictionary namespace owned by this plugin. */
const LOCALE_NS = 'settings.agentLab'

/** The durable settings namespace the switches read/write (host-validated). */
const FLAGS_NAMESPACE = 'agent-lab'

/** Services required by the Settings registration. */
export const inject = ['slots', 'locale', 'settingsScope']

/**
 * Register the Agent Lab section once the `settings.section` ledger is up.
 * The section reads its flags from a store that MIRRORS the `agent-lab`
 * settings scope; writes go optimistically to the store and durably through
 * `scope.set` (the Host side of that namespace, owned by llm-pi-ai, validates).
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.locale.register(LOCALE_NS, { zh, en, ...rolloutAgentLab }),
    'ui-settings-agent-lab: dictionaries',
  )

  const labHandle = createAgentLabStore()
  const lab = labHandle.create() // root scope: one flags mirror per browser
  const scope = ctx.settingsScope.bind<Record<string, boolean | undefined>>({ namespace: FLAGS_NAMESPACE })

  const mirror = (): void => { lab.actions.replaceAll(scope.getSnapshot().value ?? {}) }
  ctx.effect(() => {
    mirror()
    return scope.subscribe(mirror)
  }, 'ui-settings-agent-lab: scope → store mirror')

  const t = ctx.locale.bind(LOCALE_NS)
  const injected = (): AgentLabSectionInjected => ({
    getFlags: () => lab.store.getSnapshot().flags,
    subscribe: listener => lab.store.subscribe(listener),
    setFlag: (flag, value) => {
      // Optimistic toggle; a refused durable write reverts it, and any
      // concurrent change reconciles through the scope subscription anyway.
      lab.actions.setFlag({ flag, value })
      void scope.set(flag, value).catch(() => { lab.actions.setFlag({ flag, value: !value }) })
    },
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'agent-lab',
    order: 40,
    label: () => t('nav'),
    locale: LOCALE_NS,
    // The settings shell synthesizes a standard snapshot seat from this
    // handle; omitting it crashes the section wrapper before we mount.
    store: labHandle,
    inject: injected,
  }, AgentLabSection))
}
