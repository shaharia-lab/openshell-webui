import { SquareTerminalIcon } from 'lucide-react'

import { EmptyState } from '@/components/common/empty-state'
import { Card } from '@/components/ui/card'
import { TerminalPanel } from '@/features/terminal/terminal-panel'
import type { Sandbox } from '@/gen/openshell'
import { useCanWrite } from '@/hooks/use-scope'
import { isReady, refOf } from '@/lib/sandbox'

export default function TerminalTab({ gw, sandbox }: { gw: string; sandbox: Sandbox }) {
  const canWrite = useCanWrite()
  const ref = refOf(sandbox)
  if (!canWrite || !isReady(sandbox)) {
    return (
      <Card>
        <EmptyState
          icon={<SquareTerminalIcon />}
          title="Terminal unavailable"
          description={
            !canWrite
              ? 'The console runs in read-only mode, which refuses terminal sessions.'
              : 'The sandbox must be ready. Start it, then come back.'
          }
        />
      </Card>
    )
  }
  return (
    <div className="space-y-2">
      <TerminalPanel gw={gw} workspace={ref.workspace} sandbox={ref.name} />
      <p className="text-xs text-muted-foreground">
        Runs under the sandbox policy. Closing the tab or leaving this page ends the session.
      </p>
    </div>
  )
}
