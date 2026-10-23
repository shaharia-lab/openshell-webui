import { RotateCwIcon, TriangleAlertIcon } from 'lucide-react'
import { isRouteErrorResponse, useRouteError } from 'react-router'

import { EmptyState } from '@/components/common/empty-state'
import { Button } from '@/components/ui/button'

/** Shown when a page fails to load or throws while rendering. */
export function RouteError() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : String(error)
  return (
    <EmptyState
      icon={<TriangleAlertIcon />}
      title="This page failed to load"
      description={<span className="font-mono text-xs break-words">{message}</span>}
      action={
        <Button variant="outline" onClick={() => location.reload()}>
          <RotateCwIcon /> Reload
        </Button>
      }
    />
  )
}
