import { Link } from 'react-router'

import { useContainers } from '@/api/queries'
import type { Container } from '@/api/types'
import { columnsFor } from '@/components/common/columns'
import { DataTable } from '@/components/common/data-table'
import { QueryView } from '@/components/common/query-view'
import { StatusBadge } from '@/components/common/status-badge'
import { TruncatedText } from '@/components/common/truncated-text'
import { middleTruncate } from '@/lib/format'
import { sandboxHref } from '@/lib/sandbox'
import { workspaceOf } from './containers'

const col = columnsFor<Container>()

const columns = [
  col.accessor('name', {
    header: 'Container',
    cell: ({ row }) => (
      <TruncatedText
        value={row.original.name}
        display={middleTruncate(row.original.name, 28)}
        what="container name"
      />
    ),
  }),
  col.accessor('sandbox', {
    header: 'Sandbox',
    cell: ({ getValue, row }) =>
      getValue() ? (
        <Link
          to={sandboxHref({ workspace: workspaceOf(row.original), name: getValue() })}
          className="font-medium hover:underline"
        >
          {getValue()}
        </Link>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  }),
  col.accessor('role', {
    header: 'Role',
    cell: ({ getValue }) => (
      <StatusBadge tone="neutral" dot={false}>
        {getValue() || 'other'}
      </StatusBadge>
    ),
  }),
  col.accessor('state', {
    header: 'State',
    cell: ({ getValue, row }) => (
      <StatusBadge
        tone={getValue() === 'running' ? 'success' : 'warning'}
        title={row.original.status}
      >
        {getValue()}
      </StatusBadge>
    ),
  }),
  col.accessor((c) => parseFloat(c.cpu ?? '') || 0, {
    id: 'cpu',
    header: 'CPU',
    cell: ({ row }) => <span className="tabular-nums">{row.original.cpu || '—'}</span>,
  }),
  col.accessor((c) => parseFloat(c.memPerc ?? '') || 0, {
    id: 'mem',
    header: 'Memory',
    cell: ({ row }) => <span className="tabular-nums">{row.original.mem || '—'}</span>,
    meta: { className: 'hidden @xl/table:table-cell' },
  }),
  col.accessor('netIO', { header: 'Net I/O', meta: { className: 'hidden @3xl/table:table-cell' } }),
  col.accessor('pids', { header: 'PIDs', meta: { className: 'hidden @3xl/table:table-cell' } }),
]

/** OpenShell containers on the local Docker engine, optionally for one sandbox. */
export function ContainersTable({ sandbox }: { sandbox?: string }) {
  const query = useContainers(true)
  return (
    <QueryView query={query} errorTitle="Container stats are unavailable">
      {(list) => {
        const rows = sandbox ? list.filter((c) => c.sandbox === sandbox) : list
        return (
          <DataTable
            data={rows}
            columns={columns}
            getRowId={(c) => c.id}
            empty="No OpenShell containers."
            initialSorting={[{ id: 'sandbox', desc: false }]}
          />
        )
      }}
    </QueryView>
  )
}
