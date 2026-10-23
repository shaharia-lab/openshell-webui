import { useMemo, useState } from 'react'

import { useAuditLog } from '@/api/queries'
import type { AuditEntry } from '@/api/types'
import { Chips } from '@/components/common/chips'
import { columnsFor } from '@/components/common/columns'
import { DataTable } from '@/components/common/data-table'
import { QueryView } from '@/components/common/query-view'
import { RelativeTime } from '@/components/common/relative-time'
import { SearchInput } from '@/components/common/search-input'
import { StatusBadge } from '@/components/common/status-badge'
import { Card } from '@/components/ui/card'

const col = columnsFor<AuditEntry>()
const columns = [
  col.accessor('time', {
    header: 'Time',
    sortFn: 'datetime',
    cell: ({ getValue }) => <RelativeTime iso={getValue()} />,
  }),
  col.accessor('gateway', { header: 'Gateway', meta: { className: 'hidden md:table-cell' } }),
  col.accessor((a) => a.workspace || 'default', {
    id: 'workspace',
    header: 'Workspace',
    meta: { className: 'hidden md:table-cell' },
  }),
  col.accessor('method', {
    header: 'Action',
    cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
  }),
  col.accessor(
    (a) =>
      Object.entries(a.target ?? {})
        .map(([k, v]) => `${k}=${v}`)
        .join(' '),
    {
      id: 'target',
      header: 'Target',
      cell: ({ row }) => (
        <Chips items={Object.entries(row.original.target ?? {}).map(([k, v]) => `${k}=${v}`)} />
      ),
      meta: { className: 'hidden md:table-cell whitespace-normal' },
    },
  ),
  col.accessor('result', {
    header: 'Result',
    cell: ({ row, getValue }) =>
      getValue() === 'ok' ? (
        <StatusBadge tone="success">ok</StatusBadge>
      ) : (
        <div className="space-y-1">
          <StatusBadge tone="danger">{getValue()}</StatusBadge>
          {row.original.error && (
            <p className="max-w-xs text-xs break-words whitespace-normal text-muted-foreground">
              {row.original.error}
            </p>
          )}
        </div>
      ),
  }),
]

/** Write actions made through this WebUI, newest first. */
export function AuditLog() {
  const query = useAuditLog(500)
  const [filter, setFilter] = useState('')
  const entries = useMemo(() => [...(query.data?.entries ?? [])].reverse(), [query.data])
  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <SearchInput value={filter} onChange={setFilter} placeholder="Filter actions" />
        {query.data && (
          <span className="ml-auto font-mono text-xs text-muted-foreground">{query.data.path}</span>
        )}
      </div>
      <QueryView query={query}>
        {() => (
          <DataTable
            data={entries}
            columns={columns}
            filter={filter}
            empty="No write actions yet. Every change made through the WebUI is recorded here, without secrets."
          />
        )}
      </QueryView>
    </Card>
  )
}
