import { CheckIcon } from 'lucide-react'
import { useMemo } from 'react'

import { useHealth, useSandboxes, useWhoami } from '@/api/queries'
import type { Gateway } from '@/api/types'
import { ALL_WORKSPACES } from '@/api/types'
import { columnsFor } from '@/components/common/columns'
import { DataTable } from '@/components/common/data-table'
import { StatusBadge } from '@/components/common/status-badge'
import { useScope } from '@/hooks/use-scope'
import { enumLabel } from '@/lib/format'
import { usePreferences } from '@/lib/preferences'
import { isReady } from '@/lib/sandbox'

function Health({ gw }: { gw: string }) {
  const h = useHealth(gw)
  if (h.isPending)
    return (
      <StatusBadge tone="neutral" pulse>
        Checking
      </StatusBadge>
    )
  if (h.isError)
    return (
      <StatusBadge tone="danger" title={h.error.message}>
        Unreachable
      </StatusBadge>
    )
  const s = enumLabel(h.data.status, 'SERVICE_STATUS_')
  return (
    <StatusBadge tone={s === 'Healthy' ? 'success' : 'warning'}>
      {s} · v{h.data.version}
    </StatusBadge>
  )
}

function SandboxCount({ gw }: { gw: string }) {
  const s = useSandboxes(gw, ALL_WORKSPACES)
  if (s.isError)
    return (
      <span className="text-muted-foreground" title={s.error.message}>
        n/a
      </span>
    )
  const list = s.data?.sandboxes ?? []
  return (
    <span className="tabular-nums">
      {list.length}{' '}
      <span className="text-muted-foreground">({list.filter(isReady).length} ready)</span>
    </span>
  )
}

function Roles({ gw }: { gw: string }) {
  const w = useWhoami(gw)
  return <span className="text-muted-foreground">{w.data?.roles?.join(', ') || '—'}</span>
}

const col = columnsFor<Gateway>()

/** Every gateway registered in the CLI, with live health. */
export function GatewaysTable() {
  const { gw, gateways } = useScope()
  const setGateway = usePreferences((s) => s.setGateway)
  const columns = useMemo(
    () => [
      col.accessor('name', {
        header: 'Gateway',
        cell: ({ getValue }) => (
          <span className="inline-flex items-center gap-1.5 font-medium">
            {getValue()}
            {getValue() === gw && (
              <CheckIcon className="size-3.5 text-muted-foreground" aria-label="selected" />
            )}
          </span>
        ),
      }),
      col.display({
        id: 'health',
        header: 'Health',
        cell: ({ row }) => <Health gw={row.original.name} />,
      }),
      col.accessor('endpoint', {
        header: 'Endpoint',
        cell: ({ getValue }) => <span className="font-mono text-xs">{getValue()}</span>,
        meta: { className: 'hidden @xl/table:table-cell' },
      }),
      col.accessor('auth_mode', {
        header: 'Auth',
        meta: { className: 'hidden @md/table:table-cell' },
      }),
      col.accessor((g) => (g.local ? 'local' : 'remote'), {
        id: 'location',
        header: 'Location',
        meta: { className: 'hidden @3xl/table:table-cell' },
      }),
      col.display({
        id: 'sandboxes',
        header: 'Sandboxes',
        cell: ({ row }) => <SandboxCount gw={row.original.name} />,
      }),
      col.display({
        id: 'roles',
        header: 'Your roles',
        cell: ({ row }) => <Roles gw={row.original.name} />,
        meta: { className: 'hidden @3xl/table:table-cell' },
      }),
    ],
    [gw],
  )
  return (
    <DataTable
      data={gateways.data ?? []}
      columns={columns}
      getRowId={(g) => g.name}
      onRowClick={(g) => setGateway(g.name)}
      empty="No gateways registered. Use openshell gateway add."
    />
  )
}
