import type { Tone } from '@/components/common/status-badge'
import type { Sandbox, SandboxPhase } from '@/gen/openshell'
import { enumLabel } from './format'

const PHASE_TONE: Partial<Record<SandboxPhase, Tone>> = {
  SANDBOX_PHASE_READY: 'success',
  SANDBOX_PHASE_PROVISIONING: 'info',
  SANDBOX_PHASE_STARTING: 'info',
  SANDBOX_PHASE_STOPPING: 'warning',
  SANDBOX_PHASE_DELETING: 'warning',
  SANDBOX_PHASE_STOPPED: 'neutral',
  SANDBOX_PHASE_COMPLETED: 'neutral',
  SANDBOX_PHASE_ERROR: 'danger',
  SANDBOX_PHASE_UNKNOWN: 'danger',
}

const TRANSITIONAL = new Set<SandboxPhase>([
  'SANDBOX_PHASE_PROVISIONING',
  'SANDBOX_PHASE_STARTING',
  'SANDBOX_PHASE_STOPPING',
  'SANDBOX_PHASE_DELETING',
])

export const sandboxPhase = (s?: Sandbox): SandboxPhase =>
  s?.status?.phase ?? 'SANDBOX_PHASE_UNKNOWN'

export const phaseLabel = (p: SandboxPhase) => enumLabel(p, 'SANDBOX_PHASE_') || 'Unknown'
export const phaseTone = (p: SandboxPhase): Tone => PHASE_TONE[p] ?? 'neutral'
export const isTransitional = (p: SandboxPhase) => TRANSITIONAL.has(p)

export const isReady = (s?: Sandbox) => sandboxPhase(s) === 'SANDBOX_PHASE_READY'

/** Stopped sandboxes (and ones whose process ended) can be started again. */
export const canStart = (s?: Sandbox) =>
  ['SANDBOX_PHASE_STOPPED', 'SANDBOX_PHASE_COMPLETED', 'SANDBOX_PHASE_ERROR'].includes(
    sandboxPhase(s),
  )

export const canStop = (s?: Sandbox) =>
  ['SANDBOX_PHASE_READY', 'SANDBOX_PHASE_STARTING', 'SANDBOX_PHASE_PROVISIONING'].includes(
    sandboxPhase(s),
  )

export const sandboxName = (s?: Sandbox) => s?.metadata?.name ?? ''
export const sandboxWorkspace = (s?: Sandbox) => s?.metadata?.workspace || 'default'

/** Identifies a sandbox: names are unique within a workspace. */
export interface SandboxRef {
  workspace: string
  name: string
}

export const refOf = (s: Sandbox): SandboxRef => ({
  workspace: sandboxWorkspace(s),
  name: sandboxName(s),
})

/** Route of a sandbox's detail page. */
export const sandboxHref = (s: Sandbox | SandboxRef, tab?: string) => {
  const { workspace: ws, name } = 'name' in s ? s : refOf(s)
  return `/sandboxes/${encodeURIComponent(ws)}/${encodeURIComponent(name)}${tab ? `/${tab}` : ''}`
}
