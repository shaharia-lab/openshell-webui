import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { AboutFooter } from '../about-footer'
import { SidebarProvider } from '@/components/ui/sidebar'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

const renderFooter = () =>
  renderApp(
    <SidebarProvider>
      <AboutFooter />
    </SidebarProvider>,
  )

describe('AboutFooter', () => {
  it('links the repository and shows both versions', async () => {
    renderFooter()
    expect(await screen.findByText('WebUI v0.1.1 · OpenShell v0.1.5')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /shaharia-lab\/openshell-webui/ })).toHaveAttribute(
      'href',
      'https://github.com/shaharia-lab/openshell-webui',
    )
    expect(screen.queryByText('Update available')).not.toBeInTheDocument()
  })

  it('announces a newer release and links to it', async () => {
    server.use(
      http.get('/api/about', () =>
        HttpResponse.json({
          version: '0.1.1',
          repository: 'https://github.com/shaharia-lab/openshell-webui',
          openshell_cli_version: null,
          update_check: true,
          latest_release: { version: '0.2.0', url: 'https://example.test/v0.2.0' },
          update_available: true,
        }),
      ),
    )
    renderFooter()
    expect(await screen.findByText('v0.2.0 is out · you have v0.1.1')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Update available/ })).toHaveAttribute(
      'href',
      'https://example.test/v0.2.0',
    )
    expect(screen.getByText('WebUI v0.1.1 · OpenShell CLI not found')).toBeInTheDocument()
  })
})
