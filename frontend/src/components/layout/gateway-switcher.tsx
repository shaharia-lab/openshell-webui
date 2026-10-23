import { CheckIcon, ChevronsUpDownIcon, ServerIcon, TerminalIcon } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import { useScope } from '@/hooks/use-scope'
import { usePreferences } from '@/lib/preferences'

/** Brand and gateway picker at the top of the sidebar. */
export function GatewaySwitcher() {
  const { gw, gateway, gateways } = useScope()
  const setGateway = usePreferences((s) => s.setGateway)
  const list = gateways.data ?? []

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<SidebarMenuButton size="lg" className="data-popup-open:bg-sidebar-accent" />}
          >
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <TerminalIcon className="size-4" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">OpenShell Console</span>
              <span className="truncate text-xs text-muted-foreground">
                {gw
                  ? `${gw} · ${gateway?.local ? 'local' : 'remote'}`
                  : gateways.isPending
                    ? 'Loading…'
                    : 'No gateway'}
              </span>
            </div>
            <ChevronsUpDownIcon className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-64" align="start">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Gateways (from the OpenShell CLI)</DropdownMenuLabel>
              {list.map((g) => (
                <DropdownMenuItem key={g.name} onClick={() => setGateway(g.name)}>
                  <ServerIcon />
                  <div className="grid flex-1">
                    <span className="truncate">
                      {g.name}
                      {g.active && <span className="text-muted-foreground"> (CLI active)</span>}
                    </span>
                    <span className="truncate font-mono text-[11px] text-muted-foreground">
                      {g.endpoint}
                    </span>
                  </div>
                  {g.name === gw && <CheckIcon />}
                </DropdownMenuItem>
              ))}
              {!list.length && <DropdownMenuItem disabled>No gateways registered</DropdownMenuItem>}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal">
                Add one with <code className="font-mono">openshell gateway add</code>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
