/** Live mirror of the durable `agent-lab` flags for the Settings section UI. */

import { defineStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'

export interface AgentLabState {
  /** Current flag values as persisted in the settings document (absent = default). */
  flags: Record<string, boolean | undefined>
}

type AgentLabActions = {
  setFlag: (draft: AgentLabState, payload: { flag: string; value: boolean }) => void
  replaceAll: (draft: AgentLabState, flags: Record<string, boolean | undefined>) => void
}

/**
 * The engine-backed handle backing the Agent Lab section. The plugin creates
 * the root-scope instance once and mirrors the durable settings scope into it;
 * the Settings shell consumes the handle itself (standard snapshot seat).
 */
export function createAgentLabStore(): EngineStoreHandle<AgentLabState, AgentLabActions> {
  return defineStore({
    init: (): AgentLabState => ({ flags: {} }),
    actions: {
      setFlag: (d, payload) => { d.flags[payload.flag] = payload.value },
      replaceAll: (d, flags) => { d.flags = { ...flags } },
    },
  })
}
