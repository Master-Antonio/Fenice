import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as AgentLabInvariant from '../src/invariant.ts'

describe('ui-settings-agent-lab invariant companion', () => {
  it('registers the empty installer and keeps the package ownership seat', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(AgentLabInvariant).await()).resolves.toBeDefined()
    await ctx.fiber.dispose()
  })
})
