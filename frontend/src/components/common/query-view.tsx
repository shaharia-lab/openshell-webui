import type { UseQueryResult } from '@tanstack/react-query'
import type * as React from 'react'

import { ErrorAlert } from './error-alert'
import { Skeleton } from '@/components/ui/skeleton'

interface QueryViewProps<T> {
  query: Pick<UseQueryResult<T>, 'data' | 'error' | 'isPending' | 'refetch'>
  children: (data: T) => React.ReactNode
  /** Shown while the first response is loading. */
  loading?: React.ReactNode
  errorTitle?: string
}

/**
 * Renders a query's loading, error and data states. Data that loaded once
 * stays visible when a background refresh fails; the error then shows above it.
 */
export function QueryView<T>({ query, children, loading, errorTitle }: QueryViewProps<T>) {
  if (query.isPending && !query.error) return <>{loading ?? <LoadingRows />}</>
  if (query.data === undefined) {
    return <ErrorAlert error={query.error} title={errorTitle} onRetry={() => query.refetch()} />
  }
  return (
    <>
      {query.error && (
        <ErrorAlert
          className="mb-3"
          error={query.error}
          title="Refresh failed; showing the last data"
          onRetry={() => query.refetch()}
        />
      )}
      {children(query.data)}
    </>
  )
}

export function LoadingRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-1" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  )
}
