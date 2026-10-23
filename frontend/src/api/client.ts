import { ApiError } from './errors'
import type { RpcMethod, RpcRequest, RpcResponse } from './rpc'
import type { AuditLog, Container, FileListing, Gateway, GatewayLog, Session } from './types'
import type { SandboxPolicy } from '@/gen/sandbox'
import type { ProviderProfile } from '@/gen/openshell'

type Params = Record<string, string | number | boolean | undefined | null>

function query(params: Params = {}): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
  }
  const s = qs.toString()
  return s ? `?${s}` : ''
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  let body: unknown
  try {
    body = await res.json()
  } catch {
    throw new ApiError(`Unexpected response (${res.status} ${res.statusText})`, res.status)
  }
  const err = body as { error?: string; code?: string } | null
  if (!res.ok || (err && typeof err === 'object' && 'error' in err && err.error)) {
    throw new ApiError(err?.error || res.statusText, res.status, err?.code)
  }
  return body as T
}

// ---------- CSRF session ----------

let session: Promise<Session> | null = null

export function getSession(force = false): Promise<Session> {
  if (!session || force) {
    session = request<Session>('/api/session').catch((e) => {
      session = null
      throw e
    })
  }
  return session
}

/**
 * Sends a state-changing request with the CSRF token. The server makes a new
 * token when it restarts, so a CSRF failure refetches the session and
 * retries once. Objects go as JSON; strings and blobs go as they are.
 */
async function send<T>(
  method: 'POST' | 'PUT' | 'DELETE',
  url: string,
  body?: unknown,
  retried = false,
): Promise<T> {
  const { csrf_token } = await getSession()
  const raw = typeof body === 'string' || body instanceof Blob
  const headers: Record<string, string> = { 'X-CSRF-Token': csrf_token }
  if (body !== undefined)
    headers['Content-Type'] = body instanceof Blob ? 'application/octet-stream' : 'application/json'
  try {
    return await request<T>(url, {
      method,
      headers,
      body: body === undefined ? undefined : raw ? (body as BodyInit) : JSON.stringify(body),
    })
  } catch (e) {
    if (retried || !(e instanceof ApiError) || !e.isCsrf) throw e
    await getSession(true)
    return send<T>(method, url, body, true)
  }
}

const post = <T>(url: string, body: unknown) => send<T>('POST', url, body ?? {})

// ---------- endpoints ----------

const gwBase = (gw: string) => `/api/gw/${encodeURIComponent(gw)}`
const sandboxBase = (gw: string, sandbox: string) =>
  `${gwBase(gw)}/sandboxes/${encodeURIComponent(sandbox)}`

export const api = {
  session: () => getSession(),
  gateways: () => request<Gateway[]>('/api/gateways'),

  /** GET a gateway read endpoint, e.g. get(gw, 'sandboxes', { workspace }). */
  get: <T>(gw: string, path: string, params?: Params) =>
    request<T>(`${gwBase(gw)}/${path}${query(params)}`),

  /** Runs an allowlisted gateway method in a workspace. */
  call: <M extends RpcMethod>(gw: string, method: M, body: RpcRequest<M>, workspace: string) =>
    post<RpcResponse<M>>(`${gwBase(gw)}/call/${method}${query({ workspace })}`, body),

  /** Converts CLI YAML, proto YAML or protojson into a proto policy. */
  convertPolicy: (text: string) => post<SandboxPolicy>('/api/convert/policy', text),
  convertProfile: (text: string) => post<ProviderProfile>('/api/convert/profile', text),

  containers: () => request<Container[]>('/api/local/containers'),
  gatewayLog: (n: number) => request<GatewayLog>(`/api/local/gateway-log${query({ n })}`),
  audit: (n: number) => request<AuditLog>(`/api/audit${query({ n })}`),

  /** Sandbox file browser. Paths are absolute; the backend refuses "..". */
  files: {
    list: (gw: string, ws: string, sandbox: string, path: string) =>
      request<FileListing>(`${sandboxBase(gw, sandbox)}/files${query({ workspace: ws, path })}`),
    /** URL that downloads a file (Content-Disposition: attachment). */
    contentUrl: (gw: string, ws: string, sandbox: string, path: string) =>
      `${sandboxBase(gw, sandbox)}/files/content${query({ workspace: ws, path })}`,
    read: async (gw: string, ws: string, sandbox: string, path: string): Promise<Blob> => {
      const res = await fetch(api.files.contentUrl(gw, ws, sandbox, path))
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new ApiError(body?.error || res.statusText, res.status)
      }
      return res.blob()
    },
    write: (gw: string, ws: string, sandbox: string, path: string, data: Blob) =>
      send<object>(
        'PUT',
        `${sandboxBase(gw, sandbox)}/files/content${query({ workspace: ws, path })}`,
        data,
      ),
    mkdir: (gw: string, ws: string, sandbox: string, path: string) =>
      send<object>(
        'POST',
        `${sandboxBase(gw, sandbox)}/files/mkdir${query({ workspace: ws, path })}`,
      ),
    remove: (gw: string, ws: string, sandbox: string, path: string) =>
      send<object>('DELETE', `${sandboxBase(gw, sandbox)}/files${query({ workspace: ws, path })}`),
  },

  /** WebSocket URL of the interactive terminal for a sandbox. */
  execUrl: (gw: string, sandbox: string, params: Params) => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    return `${proto}://${location.host}${sandboxBase(gw, sandbox)}/exec${query(params)}`
  },
}
