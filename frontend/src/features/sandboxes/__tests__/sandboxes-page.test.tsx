import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import SandboxesPage from '../sandboxes-page'
import type { CreateSandboxRequest, UpdateConfigRequest } from '@/gen/openshell'
import { renderApp } from '@/test/render'
import { server, setSession } from '@/test/server'

const sandbox = (name: string, phase: string) => ({
  metadata: { id: name, name, workspace: 'default', created_time: '2026-01-01T00:00:00Z' },
  spec: { template: { image: 'ubuntu:24.04' }, providers: ['github'] },
  status: { phase, current_policy_version: 3 },
})

/** Clicks "New sandbox" once the session has loaded and enabled it. */
async function openCreate(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => expect(screen.getByRole('button', { name: /New sandbox/ })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: /New sandbox/ }))
}

const detailRoute = [{ path: '/sandboxes/:workspace/:name', element: <p>detail page</p> }]

describe('SandboxesPage', () => {
  it('lists sandboxes with their phase', async () => {
    server.use(
      http.get('/api/gw/:gw/sandboxes', () =>
        HttpResponse.json({
          sandboxes: [
            sandbox('web', 'SANDBOX_PHASE_READY'),
            sandbox('job', 'SANDBOX_PHASE_STOPPED'),
          ],
        }),
      ),
    )
    renderApp(<SandboxesPage />, { route: '/sandboxes' })
    expect(await screen.findByRole('link', { name: 'web' })).toHaveAttribute(
      'href',
      '/sandboxes/default/web',
    )
    expect(screen.getByText('Ready')).toBeInTheDocument()
    expect(screen.getByText('Stopped')).toBeInTheDocument()
    expect(screen.getAllByText('v3')).toHaveLength(2)
  })

  it('shows an empty state, with creation disabled in read-only mode', async () => {
    setSession({ read_only: true })
    renderApp(<SandboxesPage />, { route: '/sandboxes' })
    expect(await screen.findByText('No sandboxes yet')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: /New sandbox/ })).toBeDisabled())
  })

  it('shows the error and offers a retry when the gateway fails', async () => {
    server.use(
      http.get('/api/gw/:gw/sandboxes', () =>
        HttpResponse.json(
          { error: 'permission denied', code: 'PermissionDenied' },
          { status: 403 },
        ),
      ),
    )
    renderApp(<SandboxesPage />, { route: '/sandboxes' })
    expect(await screen.findByText('permission denied')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Retry/ })).toBeInTheDocument()
  })
})

describe('Create sandbox', () => {
  it('creates the sandbox, then merges the network rules into the default policy', async () => {
    const calls: Record<string, unknown> = {}
    server.use(
      http.post('/api/gw/:gw/call/:method', async ({ request, params }) => {
        calls[params.method as string] = await request.json()
        return HttpResponse.json(params.method === 'UpdateConfig' ? { version: 2 } : {})
      }),
    )
    const { router } = renderApp(<SandboxesPage />, { route: '/sandboxes', routes: detailRoute })
    const user = userEvent.setup()

    await openCreate(user)
    await user.click(await screen.findByRole('button', { name: 'Create sandbox' }))
    expect(await screen.findByText('Enter a name.')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Name'), 'agent-1')
    await user.type(screen.getByLabelText('Binary path'), '/usr/bin/curl')
    await user.type(screen.getByLabelText('Host and port'), 'api.github.com:443')
    await user.click(screen.getByRole('button', { name: 'Create sandbox' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/sandboxes/default/agent-1'))
    const create = calls.CreateSandbox as CreateSandboxRequest
    expect(create.name).toBe('agent-1')
    expect(create.spec?.policy).toBeUndefined()
    const update = calls.UpdateConfig as UpdateConfigRequest
    expect(update.sandbox).toBe('agent-1')
    expect(update.merge_operations).toEqual([
      {
        add_rule: {
          rule_name: 'allow_api_github_com_443',
          rule: {
            name: 'allow_api_github_com_443',
            endpoints: [
              {
                host: 'api.github.com',
                port: 443,
                protocol: 'rest',
                access: 'NETWORK_ACCESS_PRESET_READ_WRITE',
                enforcement: 'NETWORK_ENFORCEMENT_MODE_ENFORCE',
              },
            ],
            binaries: [{ path: '/usr/bin/curl' }],
          },
        },
      },
    ])
  })

  it('shows a gateway error inside the dialog and keeps the input', async () => {
    server.use(
      http.post('/api/gw/:gw/call/CreateSandbox', () =>
        HttpResponse.json(
          { error: 'sandbox agent-1 already exists', code: 'AlreadyExists' },
          { status: 409 },
        ),
      ),
    )
    renderApp(<SandboxesPage />, { route: '/sandboxes', routes: detailRoute })
    const user = userEvent.setup()
    await openCreate(user)
    await user.type(await screen.findByLabelText('Name'), 'agent-1')
    await user.click(screen.getByRole('button', { name: 'Create sandbox' }))
    expect(await screen.findByText('sandbox agent-1 already exists')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('agent-1')
  })
})
