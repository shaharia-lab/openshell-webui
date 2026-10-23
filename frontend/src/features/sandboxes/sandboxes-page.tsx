import { BoxIcon, PlusIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { CreateSandboxDialog } from './create-sandbox-dialog'
import { SandboxActionsMenu } from './sandbox-actions-menu'
import { useSandboxes } from '@/api/queries'
import { Chips } from '@/components/common/chips'
import { columnsFor } from '@/components/common/columns'
import { DataTable } from '@/components/common/data-table'
import { EmptyState } from '@/components/common/empty-state'
import { PageHeader } from '@/components/common/page'
import { PhaseBadge } from '@/components/common/phase-badge'
import { QueryView } from '@/components/common/query-view'
import { RelativeTime } from '@/components/common/relative-time'
import { SearchInput } from '@/components/common/search-input'
import { WriteButton } from '@/components/common/write-button'
import { Card } from '@/components/ui/card'
import type { Sandbox } from '@/gen/openshell'
import { useScope } from '@/hooks/use-scope'
import { phaseLabel, sandboxHref, sandboxPhase } from '@/lib/sandbox'
import { useDocumentTitle } from '@/hooks/use-document-title'

const col = columnsFor<Sandbox>()

export default function SandboxesPage() {
  useDocumentTitle('Sandboxes')
  const { gw, ws, allWorkspaces } = useScope()
  const query = useSandboxes(gw, ws)
  const [filter, setFilter] = useState('')
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()

  const columns = useMemo(
    () => [
      col.accessor((s) => s.metadata?.name ?? '', {
        id: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <Link to={sandboxHref(row.original)} className="font-medium hover:underline">
            {row.original.metadata?.name}
          </Link>
        ),
      }),
      col.accessor((s) => phaseLabel(sandboxPhase(s)), {
        id: 'phase',
        header: 'Phase',
        cell: ({ row }) => <PhaseBadge phase={sandboxPhase(row.original)} />,
      }),
      ...(allWorkspaces
        ? [
            col.accessor((s) => s.metadata?.workspace ?? '', {
              id: 'workspace',
              header: 'Workspace',
            }),
          ]
        : []),
      col.accessor((s) => s.spec?.template?.image ?? '', {
        id: 'image',
        header: 'Image',
        cell: ({ getValue }) => (
          <span className="font-mono text-xs break-all">
            {getValue() || <span className="text-muted-foreground">default</span>}
          </span>
        ),
        meta: { className: 'hidden lg:table-cell' },
      }),
      col.accessor((s) => (s.spec?.providers ?? []).join(' '), {
        id: 'providers',
        header: 'Providers',
        cell: ({ row }) => <Chips items={row.original.spec?.providers} />,
        meta: { className: 'hidden md:table-cell' },
      }),
      col.accessor((s) => s.status?.current_policy_version ?? 0, {
        id: 'policy',
        header: 'Policy',
        cell: ({ getValue }) => <span className="tabular-nums">v{getValue()}</span>,
        meta: { className: 'hidden sm:table-cell' },
      }),
      col.accessor((s) => s.metadata?.created_time ?? '', {
        id: 'created',
        header: 'Created',
        sortFn: 'datetime',
        cell: ({ getValue }) => <RelativeTime iso={getValue()} className="text-muted-foreground" />,
        meta: { className: 'hidden sm:table-cell' },
      }),
      col.display({
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => <SandboxActionsMenu gw={gw} sandbox={row.original} />,
        meta: { className: 'w-10 text-right' },
      }),
    ],
    [gw, allWorkspaces],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sandboxes"
        description={`Isolated environments on ${gw}${allWorkspaces ? ', in every workspace' : `, in workspace ${ws}`}.`}
        actions={
          <WriteButton onClick={() => setCreating(true)}>
            <PlusIcon /> New sandbox
          </WriteButton>
        }
      />
      <QueryView query={query}>
        {(data) =>
          data.sandboxes?.length ? (
            <Card className="gap-0 py-0">
              <div className="flex items-center gap-2 border-b p-3">
                <SearchInput value={filter} onChange={setFilter} placeholder="Filter sandboxes" />
              </div>
              <DataTable
                data={data.sandboxes}
                columns={columns}
                filter={filter}
                getRowId={(s) => s.metadata?.id ?? s.metadata?.name ?? ''}
                onRowClick={(s) => navigate(sandboxHref(s))}
                initialSorting={[{ id: 'name', desc: false }]}
              />
            </Card>
          ) : (
            <Card>
              <EmptyState
                icon={<BoxIcon />}
                title="No sandboxes yet"
                description="A sandbox runs an agent or tool in an isolated container with a network policy you control."
                action={
                  <WriteButton onClick={() => setCreating(true)}>
                    <PlusIcon /> Create a sandbox
                  </WriteButton>
                }
              />
            </Card>
          )
        }
      </QueryView>
      <CreateSandboxDialog open={creating} onOpenChange={setCreating} />
    </div>
  )
}
