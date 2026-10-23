import {
  MaximizeIcon,
  MinimizeIcon,
  PlayIcon,
  PlugZapIcon,
  RotateCwIcon,
  UnplugIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { useTerminal, type TerminalStatus } from './use-terminal'
import { StatusBadge, type Tone } from '@/components/common/status-badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const STATUS: Record<TerminalStatus, { tone: Tone; label: string }> = {
  idle: { tone: 'neutral', label: 'Not connected' },
  connecting: { tone: 'info', label: 'Connecting' },
  open: { tone: 'success', label: 'Connected' },
  exited: { tone: 'neutral', label: 'Exited' },
  closed: { tone: 'neutral', label: 'Closed' },
  error: { tone: 'danger', label: 'Error' },
}

interface TerminalPanelProps {
  gw: string
  workspace: string
  sandbox: string
}

/** An interactive shell in a sandbox, or one command when given. */
export function TerminalPanel({ gw, workspace, sandbox }: TerminalPanelProps) {
  const { containerRef, status, detail, connect, disconnect } = useTerminal({
    gw,
    workspace,
    sandbox,
  })
  const [command, setCommand] = useState('')
  const [full, setFull] = useState(false)
  const active = status === 'open' || status === 'connecting'

  // Open a shell as soon as the tab shows.
  useEffect(() => {
    void connect()
  }, [connect])

  useEffect(() => {
    if (!full) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && e.shiftKey && setFull(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [full])

  return (
    <Card className={cn('gap-0 overflow-hidden py-0', full && 'fixed inset-2 z-50 shadow-2xl')}>
      <div className="flex flex-wrap items-center gap-2 border-b p-2">
        <StatusBadge tone={STATUS[status].tone} pulse={status === 'connecting'}>
          {STATUS[status].label}
        </StatusBadge>
        {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
        <form
          className="ml-auto flex min-w-0 flex-1 items-center gap-2 sm:max-w-md"
          onSubmit={(e) => {
            e.preventDefault()
            void connect(command.trim() || undefined)
          }}
        >
          <Input
            aria-label="Command to run"
            className="h-7 font-mono text-xs"
            placeholder="Command (empty: login shell)"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
          />
          <Button type="submit" size="sm" variant="outline">
            {status === 'idle' || status === 'connecting' ? <PlayIcon /> : <RotateCwIcon />}
            {command.trim() ? 'Run' : active ? 'Restart' : 'Connect'}
          </Button>
        </form>
        {active ? (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Disconnect"
            title="Disconnect"
            onClick={disconnect}
          >
            <UnplugIcon />
          </Button>
        ) : (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Reconnect"
            title="Reconnect"
            onClick={() => connect()}
          >
            <PlugZapIcon />
          </Button>
        )}
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={full ? 'Exit full screen' : 'Full screen'}
          title={full ? 'Exit full screen (Shift+Esc)' : 'Full screen'}
          onClick={() => setFull(!full)}
        >
          {full ? <MinimizeIcon /> : <MaximizeIcon />}
        </Button>
      </div>
      <div
        className={cn(
          'bg-[#0a0a0a] p-2',
          full ? 'h-[calc(100dvh-4.5rem)]' : 'h-[min(70dvh,40rem)]',
        )}
      >
        <div ref={containerRef} className="size-full" />
      </div>
    </Card>
  )
}
