import { useEffect } from 'react'

import { useGateways, useSession } from '@/api/queries'
import { ALL_WORKSPACES } from '@/api/types'
import { usePreferences } from '@/lib/preferences'

/** The selected gateway and workspace. */
export function useScope() {
  const gatewayName = usePreferences((s) => s.gateway)
  const ws = usePreferences((s) => s.workspace)
  const gateways = useGateways()
  const gateway = gateways.data?.find((g) => g.name === gatewayName)
  return {
    /** Gateway name, empty until the registry loads and one is selected. */
    gw: gateway?.name ?? '',
    gateway,
    ws,
    allWorkspaces: ws === ALL_WORKSPACES,
    gateways,
  }
}

/**
 * Selects the CLI's active gateway (or the first one) when nothing valid is
 * selected. Mount once, in the layout.
 */
export function useEnsureGateway() {
  const { data } = useGateways()
  const selected = usePreferences((s) => s.gateway)
  const setGateway = usePreferences((s) => s.setGateway)
  useEffect(() => {
    if (!data?.length || data.some((g) => g.name === selected)) return
    setGateway((data.find((g) => g.active) ?? data[0]).name)
  }, [data, selected, setGateway])
}

/** Whether the WebUI accepts writes (it is not in read-only mode). */
export function useCanWrite() {
  const { data } = useSession()
  return data ? !data.read_only : false
}
