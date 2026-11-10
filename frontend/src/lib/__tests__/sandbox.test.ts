import { describe, expect, it } from 'vitest'

import type { Sandbox, SandboxPhase } from '@/gen/openshell'
import { canStart, canStop, isError } from '../sandbox'

const inPhase = (phase: SandboxPhase) => ({ status: { phase } }) as Sandbox

describe('sandbox actions by phase', () => {
  it('starts stopped and completed sandboxes', () => {
    expect(canStart(inPhase('SANDBOX_PHASE_STOPPED'))).toBe(true)
    expect(canStart(inPhase('SANDBOX_PHASE_COMPLETED'))).toBe(true)
    expect(canStart(inPhase('SANDBOX_PHASE_READY'))).toBe(false)
  })

  it('does not start or stop a sandbox in the Error phase (reset it with the CLI)', () => {
    const errored = inPhase('SANDBOX_PHASE_ERROR')
    expect(isError(errored)).toBe(true)
    expect(canStart(errored)).toBe(false)
    expect(canStop(errored)).toBe(false)
  })
})
