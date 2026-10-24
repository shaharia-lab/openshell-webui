import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { ChevronDownIcon, RefreshCwIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { REFRESH_INTERVALS, usePreferences, type RefreshInterval } from '@/lib/preferences'
import { cn } from '@/lib/utils'

const label = (ms: number) => (ms ? `${ms / 1000}s` : 'Off')

export function RefreshControl() {
  const qc = useQueryClient()
  const fetching = useIsFetching() > 0
  const interval = usePreferences((s) => s.refreshInterval)
  const setInterval = usePreferences((s) => s.setRefreshInterval)

  return (
    <ButtonGroup>
      <Button
        variant="outline"
        size="sm"
        onClick={() => qc.invalidateQueries()}
        aria-label="Refresh now"
        title="Refresh now"
      >
        <RefreshCwIcon className={cn(fetching && 'animate-spin')} />
        <span className="hidden @3xl/header:inline">{label(interval)}</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" size="icon-sm" aria-label="Auto-refresh interval" />}
        >
          <ChevronDownIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Auto-refresh</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={String(interval)}
              onValueChange={(v) => setInterval(Number(v) as RefreshInterval)}
            >
              {REFRESH_INTERVALS.map((ms) => (
                <DropdownMenuRadioItem key={ms} value={String(ms)}>
                  {ms ? `Every ${label(ms)}` : 'Off'}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  )
}
