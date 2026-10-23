import {
  EllipsisIcon,
  PlayIcon,
  ScrollTextIcon,
  SquareIcon,
  SquareTerminalIcon,
  Trash2Icon,
} from 'lucide-react'
import { useNavigate } from 'react-router'

import { useSandboxActions } from './use-sandbox-actions'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Sandbox } from '@/gen/openshell'
import { useCanWrite } from '@/hooks/use-scope'
import { canStart, canStop, isReady, refOf, sandboxHref } from '@/lib/sandbox'

export function SandboxActionsMenu({ gw, sandbox }: { gw: string; sandbox: Sandbox }) {
  const navigate = useNavigate()
  const actions = useSandboxActions(gw)
  const canWrite = useCanWrite()
  const ref = refOf(sandbox)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${ref.name}`} />}
      >
        <EllipsisIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuItem
          disabled={!isReady(sandbox) || !canWrite}
          onClick={() => navigate(sandboxHref(ref, 'terminal'))}
        >
          <SquareTerminalIcon /> Open terminal
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate(sandboxHref(ref, 'logs'))}>
          <ScrollTextIcon /> View logs
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {canStart(sandbox) ? (
          <DropdownMenuItem disabled={!canWrite} onClick={() => actions.start(ref)}>
            <PlayIcon /> Start
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            disabled={!canWrite || !canStop(sandbox)}
            onClick={() => actions.stop(ref)}
          >
            <SquareIcon /> Stop
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          variant="destructive"
          disabled={!canWrite}
          onClick={() => actions.remove(ref)}
        >
          <Trash2Icon /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
