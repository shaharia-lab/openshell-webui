import { keepPreviousData, useQuery, type UseQueryOptions } from '@tanstack/react-query'

import { api } from './client'
import type { RpcMethod, RpcRequest, RpcResponse } from './rpc'
import { usePreferences } from '@/lib/preferences'
import { isTransitional, sandboxPhase } from '@/lib/sandbox'
import type * as pb from '@/gen/openshell'
import type * as sb from '@/gen/sandbox'

/**
 * Query keys. Everything about one gateway lives under ['gw', name], so a
 * write can refresh it all with one invalidation.
 */
export const qk = {
  session: ['session'] as const,
  gateways: ['gateways'] as const,
  gw: (gw: string) => ['gw', gw] as const,
  gwRead: (gw: string, path: string, params?: object) =>
    ['gw', gw, 'get', path, params ?? {}] as const,
  gwCall: (gw: string, method: string, ws: string, body: object) =>
    ['gw', gw, 'call', method, ws, body] as const,
  local: (what: string, params?: object) => ['local', what, params ?? {}] as const,
  audit: (n: number) => ['audit', n] as const,
}

type QueryOpts<T> = Omit<UseQueryOptions<T, Error, T, readonly unknown[]>, 'queryKey' | 'queryFn'>

/** The auto-refresh period the user picked, or false when it is off. */
export function useRefetchInterval(): number | false {
  return usePreferences((s) => s.refreshInterval) || false
}

function useLiveQuery<T>(key: readonly unknown[], fn: () => Promise<T>, opts: QueryOpts<T> = {}) {
  const interval = useRefetchInterval()
  return useQuery<T, Error, T, readonly unknown[]>({
    queryKey: key,
    queryFn: fn,
    refetchInterval: interval,
    placeholderData: keepPreviousData,
    ...opts,
  })
}

// ---------- WebUI ----------

export function useSession() {
  return useQuery({ queryKey: qk.session, queryFn: api.session, staleTime: Infinity })
}

export function useGateways() {
  return useLiveQuery(qk.gateways, api.gateways, { placeholderData: undefined })
}

// ---------- gateway reads ----------

/** GET /api/gw/{gw}/{path}; disabled until gw is known. */
export function useGwGet<T>(
  gw: string,
  path: string,
  params?: Record<string, string | number | undefined>,
  opts: QueryOpts<T> = {},
) {
  return useLiveQuery<T>(qk.gwRead(gw, path, params), () => api.get<T>(gw, path, params), {
    ...opts,
    enabled: !!gw && (opts.enabled ?? true),
  })
}

/** A read-only allowlisted gateway method, as a query. */
export function useGwCall<M extends RpcMethod>(
  gw: string,
  method: M,
  ws: string,
  body: RpcRequest<M>,
  opts: QueryOpts<RpcResponse<M>> = {},
) {
  return useLiveQuery<RpcResponse<M>>(
    qk.gwCall(gw, method, ws, body as object),
    () => api.call(gw, method, body, ws),
    { ...opts, enabled: !!gw && (opts.enabled ?? true) },
  )
}

const sandboxPath = (name: string, sub = '') => `sandboxes/${encodeURIComponent(name)}${sub}`

export const useHealth = (gw: string, opts?: QueryOpts<pb.HealthResponse>) =>
  useGwGet<pb.HealthResponse>(gw, 'health', undefined, { retry: false, ...opts })
export const useWhoami = (gw: string) =>
  useGwGet<pb.GetCurrentUserResponse>(gw, 'whoami', undefined, { staleTime: 60_000 })
export const useGatewayInfo = (gw: string) => useGwGet<pb.GetGatewayInfoResponse>(gw, 'info')
export const useWorkspaces = (gw: string) => useGwGet<pb.ListWorkspacesResponse>(gw, 'workspaces')

/** Poll period while a sandbox is changing phase, so the change shows promptly. */
const TRANSITION_POLL_MS = 2_000

const changing = (s?: pb.Sandbox) => isTransitional(sandboxPhase(s))

export function useSandboxes(gw: string, ws: string) {
  const base = useRefetchInterval()
  return useGwGet<pb.ListSandboxesResponse>(
    gw,
    'sandboxes',
    { workspace: ws },
    {
      refetchInterval: (q) => (q.state.data?.sandboxes?.some(changing) ? TRANSITION_POLL_MS : base),
    },
  )
}

export function useSandbox(gw: string, ws: string, name: string) {
  const base = useRefetchInterval()
  return useGwGet<pb.SandboxResponse>(
    gw,
    sandboxPath(name),
    { workspace: ws },
    { refetchInterval: (q) => (changing(q.state.data?.sandbox) ? TRANSITION_POLL_MS : base) },
  )
}
export const useSandboxPolicy = (gw: string, ws: string, name: string) =>
  useGwGet<pb.GetSandboxPolicyStatusResponse>(gw, sandboxPath(name, '/policy'), { workspace: ws })
export const useEffectivePolicy = (gw: string, ws: string, name: string) =>
  useGwGet<sb.GetSandboxConfigResponse>(gw, sandboxPath(name, '/effective-policy'), {
    workspace: ws,
  })
export const usePolicyHistory = (gw: string, ws: string, name: string) =>
  useGwGet<pb.ListSandboxPoliciesResponse>(gw, sandboxPath(name, '/policy-history'), {
    workspace: ws,
  })

export interface LogParams {
  n?: number
  source?: 'all' | 'gateway' | 'sandbox'
  level?: string
  since?: string
}
export const useSandboxLogs = (
  gw: string,
  ws: string,
  name: string,
  params: LogParams,
  opts?: QueryOpts<pb.GetSandboxLogsResponse>,
) =>
  useGwGet<pb.GetSandboxLogsResponse>(
    gw,
    sandboxPath(name, '/logs'),
    { workspace: ws, ...params },
    { ...opts, enabled: !!name && (opts?.enabled ?? true) },
  )

export const useProviders = (gw: string, ws: string) =>
  useGwGet<pb.ListProvidersResponse>(gw, 'providers', { workspace: ws })
export const useProfiles = (gw: string, ws: string) =>
  useGwGet<pb.ListProviderProfilesResponse>(gw, 'profiles', { workspace: ws })
export const useServices = (gw: string, ws: string) =>
  useGwGet<pb.ListServicesResponse>(gw, 'services', { workspace: ws })
export const useTemplates = (gw: string, ws: string) =>
  useGwGet<pb.ListSandboxTemplatesResponse>(gw, 'templates', { workspace: ws })

// ---------- local machine and WebUI ----------

export const useContainers = (enabled: boolean) =>
  useLiveQuery(qk.local('containers'), api.containers, { enabled, retry: false })
export const useGatewayLog = (n: number, enabled: boolean) =>
  useLiveQuery(qk.local('gateway-log', { n }), () => api.gatewayLog(n), { enabled })
export const useAuditLog = (n: number) => useLiveQuery(qk.audit(n), () => api.audit(n))

export const filesKey = (gw: string, ws: string, sandbox: string) =>
  ['gw', gw, 'files', ws, sandbox] as const
export const useSandboxFiles = (gw: string, ws: string, sandbox: string, path: string) =>
  useLiveQuery([...filesKey(gw, ws, sandbox), path], () => api.files.list(gw, ws, sandbox, path), {
    // A listing runs a command in the sandbox; do not poll it as often as the rest.
    refetchInterval: false,
    retry: false,
  })
