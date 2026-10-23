import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'

import { GW } from './server'
import { AppProviders } from '@/app/providers'
import { getSession } from '@/api/client'
import { createQueryClient } from '@/app/query-client'
import { usePreferences } from '@/lib/preferences'

interface Options {
  /** Initial URL. */
  route?: string
  /** Route pattern the element is mounted at (for useParams). */
  path?: string
  /** Extra routes, e.g. a navigation target. */
  routes?: RouteObject[]
}

/**
 * Renders UI with the app's providers and a memory router, with the test
 * gateway selected. Returns the router to assert navigation.
 */
export function renderApp(
  ui: ReactElement,
  { route = '/', path = '*', routes = [] }: Options = {},
) {
  usePreferences.setState({ gateway: GW, workspace: 'default', refreshInterval: 0 })
  void getSession(true)
  const client = createQueryClient()
  client.setDefaultOptions({ queries: { retry: false, staleTime: 0 } })
  const router = createMemoryRouter([{ path, element: ui }, ...routes], { initialEntries: [route] })
  const result = render(
    <AppProviders client={client}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return { ...result, router, client }
}
