import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

import type { Gateway, Session } from '@/api/types'

export const GW = 'test-gw'

export const gateway: Gateway = {
  name: GW,
  endpoint: 'https://127.0.0.1:17670',
  auth_mode: 'mtls',
  is_remote: false,
  active: true,
  local: false,
}

let session: Session = { csrf_token: 'token-1', read_only: false }
export const setSession = (s: Partial<Session>) => (session = { ...session, ...s })

/** Handlers every page needs; tests add their own with server.use(). */
export const defaultHandlers = [
  http.get('/api/session', () => HttpResponse.json(session)),
  http.get('/api/gateways', () => HttpResponse.json([gateway])),
  http.get('/api/about', () =>
    HttpResponse.json({
      version: '0.1.1',
      repository: 'https://github.com/shaharia-lab/openshell-webui',
      openshell_cli_version: '0.1.5',
      update_check: true,
      latest_release: { version: '0.1.1', url: 'https://example.test/v0.1.1' },
      update_available: false,
    }),
  ),
  http.get('/api/gw/:gw/health', () =>
    HttpResponse.json({ status: 'SERVICE_STATUS_HEALTHY', version: '0.1.5' }),
  ),
  http.get('/api/gw/:gw/whoami', () =>
    HttpResponse.json({ subject: 'tester', roles: ['openshell-user'], identity_provider: 'mtls' }),
  ),
  http.get('/api/gw/:gw/workspaces', () =>
    HttpResponse.json({ workspaces: [{ metadata: { name: 'default' } }] }),
  ),
  http.get('/api/gw/:gw/sandboxes', () => HttpResponse.json({})),
  http.get('/api/gw/:gw/providers', () => HttpResponse.json({})),
  http.get('/api/gw/:gw/profiles', () => HttpResponse.json({})),
  http.get('/api/gw/:gw/templates', () => HttpResponse.json({})),
  http.get('/api/gw/:gw/services', () => HttpResponse.json({})),
  http.get('/api/gw/:gw/info', () => HttpResponse.json({})),
]

export const server = setupServer(...defaultHandlers)

export function resetServer() {
  session = { csrf_token: 'token-1', read_only: false }
  server.resetHandlers()
}
