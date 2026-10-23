import { StatusBadge } from './status-badge'
import type { SandboxPhase } from '@/gen/openshell'
import { isTransitional, phaseLabel, phaseTone } from '@/lib/sandbox'

export function PhaseBadge({ phase }: { phase: SandboxPhase }) {
  return (
    <StatusBadge tone={phaseTone(phase)} pulse={isTransitional(phase)}>
      {phaseLabel(phase)}
    </StatusBadge>
  )
}
