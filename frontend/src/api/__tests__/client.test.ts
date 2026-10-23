import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { api, getSession } from '../client'
import { ApiError } from '../errors'
import { server, setSession } from '@/test/server'

describe('api client', () => {
  beforeEach(async () => {
    await getSession(true)
  })

  it('posts protojson with the CSRF token and workspace', async () => {
    let seen: { token: string | null; ws: string | null; body: unknown } | undefined
    server.use(
      http.post('/api/gw/:gw/call/StopSandbox', async ({ request }) => {
        seen = {
          token: request.headers.get('X-CSRF-Token'),
          ws: new URL(request.url).searchParams.get('workspace'),
          body: await request.json(),
        }
        return HttpResponse.json({ sandbox: { metadata: { name: 'box' } } })
      }),
    )
    const res = await api.call('gw', 'StopSandbox', { name: 'box' }, 'team-a')
    expect(res.sandbox?.metadata?.name).toBe('box')
    expect(seen).toEqual({ token: 'token-1', ws: 'team-a', body: { name: 'box' } })
  })

  it('refetches the session and retries once after a CSRF failure', async () => {
    setSession({ csrf_token: 'token-2' })
    const tokens: (string | null)[] = []
    server.use(
      http.post('/api/gw/:gw/call/StartSandbox', ({ request }) => {
        const t = request.headers.get('X-CSRF-Token')
        tokens.push(t)
        return t === 'token-2'
          ? HttpResponse.json({})
          : HttpResponse.json({ error: 'missing or invalid CSRF token' }, { status: 403 })
      }),
    )
    await api.call('gw', 'StartSandbox', { name: 'box' }, 'default')
    expect(tokens).toEqual(['token-1', 'token-2'])
  })

  it('turns gateway errors into ApiError with the gRPC code', async () => {
    server.use(
      http.get('/api/gw/:gw/health', () =>
        HttpResponse.json({ error: 'gateway unavailable', code: 'Unavailable' }, { status: 503 }),
      ),
    )
    const err = await api.get('gw', 'health').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ message: 'gateway unavailable', status: 503, code: 'Unavailable' })
  })

  it('reports a non-JSON response clearly', async () => {
    server.use(http.get('/api/gateways', () => new HttpResponse('<html>', { status: 502 })))
    await expect(api.gateways()).rejects.toThrow(/Unexpected response \(502/)
  })
})
