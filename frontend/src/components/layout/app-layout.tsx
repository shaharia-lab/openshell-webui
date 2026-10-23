import { Outlet } from 'react-router'

import { AppSidebar } from './app-sidebar'
import { CommandPalette } from './command-palette'
import { GatewayStatus } from './gateway-status'
import { RefreshControl } from './refresh-control'
import { ThemeToggle } from './theme-toggle'
import { WorkspaceSelect } from './workspace-select'
import { useGateways } from '@/api/queries'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorAlert } from '@/components/common/error-alert'
import { Separator } from '@/components/ui/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { useEnsureGateway, useScope } from '@/hooks/use-scope'
import { ServerOffIcon } from 'lucide-react'

export function AppLayout() {
  useEnsureGateway()
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-backdrop-filter:bg-background/80 sm:px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mx-1 h-4 data-vertical:self-center" />
          <WorkspaceSelect />
          <div className="hidden sm:block">
            <GatewayStatus />
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <CommandPalette />
            <RefreshControl />
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
          <GatewayGate />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

/** Pages need a gateway; explain what to do when there is none. */
function GatewayGate() {
  const gateways = useGateways()
  const { gw } = useScope()
  if (gateways.isError && !gateways.data)
    return (
      <ErrorAlert
        error={gateways.error}
        title="Could not read the gateway registry"
        onRetry={() => gateways.refetch()}
      />
    )
  if (gateways.data && !gateways.data.length)
    return (
      <EmptyState
        icon={<ServerOffIcon />}
        title="No gateways registered"
        description={
          <>
            Register a gateway with the OpenShell CLI (<code>openshell gateway add</code>), then
            reload this page.
          </>
        }
      />
    )
  if (!gw) return null
  return <Outlet />
}
