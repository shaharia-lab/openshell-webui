import { ShieldCheckIcon, ShieldOffIcon, UserIcon } from 'lucide-react'
import { NavLink, useLocation } from 'react-router'

import { AboutFooter } from './about-footer'
import { GatewaySwitcher } from './gateway-switcher'
import { NAV } from './nav'
import { useSandboxes, useWhoami } from '@/api/queries'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { useCanWrite, useScope } from '@/hooks/use-scope'

export function AppSidebar() {
  const { pathname } = useLocation()
  const { gw, ws } = useScope()
  const sandboxes = useSandboxes(gw, ws)
  const counts: Record<string, number | undefined> = {
    '/sandboxes': sandboxes.data?.sandboxes?.length,
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <GatewaySwitcher />
      </SidebarHeader>
      <SidebarContent>
        {NAV.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => {
                const active = item.end ? pathname === item.to : pathname.startsWith(item.to)
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={item.label}
                      render={<NavLink to={item.to} end={item.end} />}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                    {counts[item.to] !== undefined && (
                      <SidebarMenuBadge>{counts[item.to]}</SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <IdentityFooter gw={gw} />
        <AboutFooter />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function IdentityFooter({ gw }: { gw: string }) {
  const who = useWhoami(gw)
  const canWrite = useCanWrite()
  const roles = who.data?.roles?.join(', ') || 'no roles'
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="lg"
          tooltip={`${who.data?.display_name || who.data?.subject || '—'} · ${roles}`}
          render={<NavLink to="/gateway" />}
        >
          <div className="flex size-8 items-center justify-center rounded-lg border bg-background">
            <UserIcon className="size-4" />
          </div>
          <div className="grid flex-1 text-left text-xs leading-tight">
            <span className="truncate text-sm font-medium">
              {who.data?.display_name ||
                who.data?.subject ||
                (who.isPending ? 'Loading…' : 'Unknown')}
            </span>
            <span className="truncate text-muted-foreground">
              {roles}
              {who.data?.identity_provider && ` · ${who.data.identity_provider}`}
            </span>
          </div>
          {canWrite ? (
            <ShieldCheckIcon
              className="text-amber-600 dark:text-amber-400"
              aria-label="read-write"
            />
          ) : (
            <ShieldOffIcon className="text-muted-foreground" aria-label="read-only" />
          )}
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
