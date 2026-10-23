import type { RouteObject } from 'react-router'

import { AppLayout } from '@/components/layout/app-layout'
import { NotFoundPage } from './not-found'
import { RouteError } from './route-error'

// Pages load on demand so the first paint ships only the shell.
const page = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({
  Component: (await load()).default,
})

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    // Lazy pages resolve before the first render; the shell needs no fallback.
    HydrateFallback: () => null,
    children: [
      {
        // Page errors render inside the shell, so navigation keeps working.
        ErrorBoundary: RouteError,
        children: [
          { index: true, lazy: page(() => import('@/features/overview/overview-page')) },
          { path: 'sandboxes', lazy: page(() => import('@/features/sandboxes/sandboxes-page')) },
          {
            path: 'sandboxes/:workspace/:name/:tab?',
            lazy: page(() => import('@/features/sandboxes/sandbox-detail-page')),
          },
          { path: 'logs', lazy: page(() => import('@/features/logs/logs-page')) },
          { path: 'services', lazy: page(() => import('@/features/services/services-page')) },
          { path: 'providers', lazy: page(() => import('@/features/providers/providers-page')) },
          { path: 'profiles', lazy: page(() => import('@/features/profiles/profiles-page')) },
          { path: 'templates', lazy: page(() => import('@/features/templates/templates-page')) },
          { path: 'workspaces', lazy: page(() => import('@/features/workspaces/workspaces-page')) },
          { path: 'gateway/:tab?', lazy: page(() => import('@/features/gateway/gateway-page')) },
          { path: '*', Component: NotFoundPage },
        ],
      },
    ],
  },
]
