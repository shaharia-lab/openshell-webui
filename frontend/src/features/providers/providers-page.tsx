import {
  EllipsisIcon,
  KeyRoundIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import { CredentialRefreshSheet } from './credential-refresh-sheet'
import { providerRefreshHealth } from './refresh-health'
import { CreateProviderDialog, UpdateProviderDialog } from './provider-dialogs'
import { useRpc } from '@/api/mutations'
import { useGwCall, useProviders } from '@/api/queries'
import { Chips } from '@/components/common/chips'
import { useConfirm } from '@/components/common/confirm-context'
import { columnsFor } from '@/components/common/columns'
import { DataTable } from '@/components/common/data-table'
import { EmptyState } from '@/components/common/empty-state'
import { PageHeader } from '@/components/common/page'
import { QueryView } from '@/components/common/query-view'
import { RelativeTime } from '@/components/common/relative-time'
import { SearchInput } from '@/components/common/search-input'
import { StatusBadge } from '@/components/common/status-badge'
import { WriteButton } from '@/components/common/write-button'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Provider } from '@/gen/datamodel'
import { useCanWrite, useScope } from '@/hooks/use-scope'
import { useDocumentTitle } from '@/hooks/use-document-title'

const col = columnsFor<Provider>()

/** The soonest credential expiry of a provider, if any. */
const nextExpiry = (p: Provider) =>
  Object.values(p.credential_expiration_times ?? {})
    .filter((t): t is string => !!t)
    .sort()[0]

export default function ProvidersPage() {
  useDocumentTitle('Providers')
  const { gw, ws, allWorkspaces } = useScope()
  const providers = useProviders(gw, ws)
  const canWrite = useCanWrite()
  const confirm = useConfirm()
  const [filter, setFilter] = useState('')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Provider | null>(null)
  const [refreshing, setRefreshing] = useState<Provider | null>(null)
  const { mutateAsync: deleteProvider } = useRpc(gw, 'DeleteProvider', {
    toastErrors: false,
    success: (_, v) => `Provider ${v.body.name} deleted.`,
  })

  const columns = useMemo(
    () => [
      col.accessor((p) => p.metadata?.name ?? '', {
        id: 'name',
        header: 'Name',
        cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
      }),
      col.accessor((p) => p.type ?? '', {
        id: 'type',
        header: 'Type',
        meta: { className: 'hidden @lg/table:table-cell' },
      }),
      col.display({
        id: 'refresh',
        header: 'Refresh',
        cell: ({ row }) => (
          <RefreshBadge
            gw={gw}
            provider={row.original}
            onOpen={() => setRefreshing(row.original)}
          />
        ),
      }),
      ...(allWorkspaces
        ? [
            col.accessor((p) => p.metadata?.workspace ?? '', {
              id: 'workspace',
              header: 'Workspace',
            }),
          ]
        : []),
      col.accessor((p) => Object.keys(p.credentials ?? {}).join(' '), {
        id: 'credentials',
        header: 'Credentials',
        cell: ({ row }) => <Chips items={Object.keys(row.original.credentials ?? {})} limit={3} />,
        meta: { className: 'hidden @4xl/table:table-cell' },
      }),
      col.accessor(
        (p) =>
          Object.entries(p.config ?? {})
            .map(([k, v]) => `${k}=${v}`)
            .join(' '),
        {
          id: 'config',
          header: 'Config',
          cell: ({ row }) => (
            <Chips
              items={Object.entries(row.original.config ?? {}).map(([k, v]) => `${k}=${v}`)}
              limit={2}
            />
          ),
          meta: { className: 'hidden @5xl/table:table-cell' },
        },
      ),
      col.accessor((p) => nextExpiry(p) ?? '', {
        id: 'expires',
        header: 'Expires',
        sortFn: 'datetime',
        cell: ({ getValue }) =>
          getValue() ? (
            <RelativeTime iso={getValue()} />
          ) : (
            <span className="text-muted-foreground">never</span>
          ),
        meta: { className: 'hidden @3xl/table:table-cell' },
      }),
      col.display({
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        meta: { className: 'w-10 text-right' },
        cell: ({ row }) => {
          const p = row.original
          const name = p.metadata?.name ?? ''
          return (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${name}`} />
                }
              >
                <EllipsisIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                <DropdownMenuItem disabled={!canWrite} onClick={() => setEditing(p)}>
                  <PencilIcon /> Update credentials
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setRefreshing(p)}>
                  <RefreshCwIcon /> Credential refresh
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={!canWrite}
                  onClick={() =>
                    confirm({
                      title: `Delete provider ${name}?`,
                      description:
                        'Sandboxes that use it lose its credentials and network rules. You cannot undo this.',
                      confirmLabel: 'Delete provider',
                      destructive: true,
                      typeToConfirm: name,
                      onConfirm: () =>
                        deleteProvider({ ws: p.metadata?.workspace || ws, body: { name } }),
                    })
                  }
                >
                  <Trash2Icon /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      }),
    ],
    [allWorkspaces, canWrite, confirm, deleteProvider, gw, ws],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Providers"
        description="Credentials that sandboxes use without seeing them. Secret values are never sent back to the browser."
        actions={
          <WriteButton
            onClick={() => setCreating(true)}
            disabledReason={
              allWorkspaces ? 'Select one workspace to create a provider in.' : undefined
            }
          >
            <PlusIcon /> New provider
          </WriteButton>
        }
      />
      <QueryView query={providers}>
        {(data) =>
          data.providers?.length ? (
            <Card className="gap-0 py-0">
              <div className="border-b p-3">
                <SearchInput value={filter} onChange={setFilter} placeholder="Filter providers" />
              </div>
              <DataTable
                data={data.providers}
                columns={columns}
                filter={filter}
                getRowId={(p) => p.metadata?.id ?? p.metadata?.name ?? ''}
                initialSorting={[{ id: 'name', desc: false }]}
              />
            </Card>
          ) : (
            <Card>
              <EmptyState
                icon={<KeyRoundIcon />}
                title="No providers"
                description="A provider holds the credentials for one service (an API key, a token). Attach it to sandboxes that need that service."
                action={
                  !allWorkspaces && (
                    <WriteButton onClick={() => setCreating(true)}>
                      <PlusIcon /> Create a provider
                    </WriteButton>
                  )
                }
              />
            </Card>
          )
        }
      </QueryView>
      <CreateProviderDialog gw={gw} ws={ws} open={creating} onOpenChange={setCreating} />
      <UpdateProviderDialog
        gw={gw}
        provider={editing}
        onOpenChange={(o) => !o && setEditing(null)}
      />
      <CredentialRefreshSheet
        gw={gw}
        provider={refreshing}
        onOpenChange={(o) => !o && setRefreshing(null)}
      />
    </div>
  )
}

/** The provider's automatic credential refresh at a glance; opens the refresh sheet. */
function RefreshBadge({
  gw,
  provider,
  onOpen,
}: {
  gw: string
  provider: Provider
  onOpen: () => void
}) {
  const name = provider.metadata?.name ?? ''
  const ws = provider.metadata?.workspace || 'default'
  const status = useGwCall(gw, 'GetProviderRefreshStatus', ws, { provider: name })
  if (status.isError)
    return (
      <span className="text-muted-foreground" title={status.error.message}>
        unknown
      </span>
    )
  const health = providerRefreshHealth(status.data?.credentials ?? [])
  if (!health) return <span className="text-muted-foreground">{status.data ? '—' : ''}</span>
  return (
    <button
      type="button"
      onClick={onOpen}
      className="rounded-md"
      aria-label={`Credential refresh of ${name}: ${health.label}`}
    >
      <StatusBadge tone={health.tone} pulse={health.label === 'Refreshing'}>
        {health.label}
      </StatusBadge>
    </button>
  )
}
