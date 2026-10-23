import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { ProposalsTab } from '../detail/proposals-tab'
import type { ApproveAllDraftChunksRequest, PolicyChunk } from '@/gen/openshell'
import { renderApp } from '@/test/render'
import { GW, server } from '@/test/server'

const chunk = (id: string, extra: Partial<PolicyChunk> = {}): PolicyChunk => ({
  id,
  status: 'pending',
  rule_name: `allow_${id}`,
  review_token: `token-${id}`,
  binary: '/usr/bin/curl',
  proposed_rule: { endpoints: [{ host: `${id}.example.com`, port: 443 }] },
  ...extra,
})

describe('ProposalsTab', () => {
  it('approves all pending proposals except security-flagged ones', async () => {
    let approveAll: ApproveAllDraftChunksRequest | undefined
    server.use(
      http.post('/api/gw/:gw/call/GetDraftPolicy', () =>
        HttpResponse.json({
          chunks: [
            chunk('a'),
            chunk('b', { security_notes: 'wildcard host' }),
            chunk('c'),
            chunk('d', { status: 'approved' }),
          ],
        }),
      ),
      http.post('/api/gw/:gw/call/ApproveAllDraftChunks', async ({ request }) => {
        approveAll = (await request.json()) as ApproveAllDraftChunksRequest
        return HttpResponse.json({ chunks_approved: 2, policy_version: 4 })
      }),
    )
    renderApp(<ProposalsTab gw={GW} sandboxRef={{ workspace: 'default', name: 'box' }} />)
    const user = userEvent.setup()

    expect(await screen.findByText('allow_a')).toBeInTheDocument()
    expect(screen.getByText('wildcard host')).toBeInTheDocument()
    // Approved proposals are filtered out of the default "pending" view.
    expect(screen.queryByText('allow_d')).not.toBeInTheDocument()

    await waitFor(() => expect(screen.getByRole('button', { name: /Approve all/ })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: /Approve all/ }))
    expect(
      await screen.findByText(/1 proposal with security notes stays pending/),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Approve all' }))

    await waitFor(() => expect(approveAll).toBeDefined())
    expect(approveAll).toEqual({
      sandbox: 'box',
      include_security_flagged: false,
      approvals: [
        { chunk_id: 'a', review_token: 'token-a' },
        { chunk_id: 'c', review_token: 'token-c' },
      ],
    })
  })
})
