import { GlobeIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'

import { ExposeServiceDialog } from './expose-service-dialog'
import { ServiceUrl } from './service-url'
import { useDeleteService } from './use-delete-service'
import { useSandboxes, useServices } from '@/api/queries'
import { columnsFor } from '@/components/common/columns'
import { DataTable } from '@/components/common/data-table'
import { EmptyState } from '@/components/common/empty-state'
import { PageHeader } from '@/components/common/page'
import { QueryView } from '@/components/common/query-view'
import { SearchInput } from '@/components/common/search-input'
import { WriteButton } from '@/components/common/write-button'
import { Card } from '@/components/ui/card'
import type { ServiceEndpointResponse } from '@/gen/openshell'
import { useScope } from '@/hooks/use-scope'
import { enumLabel } from '@/lib/format'
import { refOf, sandboxHref } from '@/lib/sandbox'
import { useDocumentTitle } from '@/hooks/use-document-title'

const col = columnsFor<ServiceEndpointResponse>()

export default function ServicesPage() {
  useDocumentTitle('Services')
  const { gw, ws, allWorkspaces } = useScope()
  const services = useServices(gw, ws)
  const sandboxes = useSandboxes(gw, ws)
  const [filter, setFilter] = useState('')
  const [exposing, setExposing] = useState(false)
  const remove = useDeleteService(gw)

  const columns = useMemo(
    () => [
      col.accessor((s) => s.endpoint?.name ?? '', {
        id: 'name',
        header: 'Service',
        cell: ({ getValue }) => (
          <span className="font-medium">
            {getValue() || <span className="text-muted-foreground">(unnamed)</span>}
          </span>
        ),
      }),
      col.accessor((s) => s.endpoint?.sandbox ?? '', {
        id: 'sandbox',
        header: 'Sandbox',
        cell: ({ row, getValue }) => (
          <Link
            className="hover:underline"
            to={sandboxHref({
              workspace: row.original.endpoint?.metadata?.workspace || ws,
              name: getValue(),
            })}
          >
            {getValue()}
          </Link>
        ),
      }),
      ...(allWorkspaces
        ? [
            col.accessor((s) => s.endpoint?.metadata?.workspace ?? '', {
              id: 'workspace',
              header: 'Workspace',
            }),
          ]
        : []),
      col.accessor((s) => s.endpoint?.target_port ?? 0, { id: 'port', header: 'Port' }),
      col.accessor((s) => s.url ?? '', {
        id: 'url',
        header: 'URL',
        cell: ({ getValue }) => <ServiceUrl url={getValue()} />,
      }),
      col.accessor(
        (s) => enumLabel(s.endpoint?.authorization_mode, 'SERVICE_AUTHORIZATION_MODE_'),
        {
          id: 'auth',
          header: 'Authorization',
          meta: { className: 'hidden @3xl/table:table-cell' },
        },
      ),
      col.display({
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        meta: { className: 'w-10 text-right' },
        cell: ({ row }) => {
          const e = row.original.endpoint
          return (
            <WriteButton
              size="icon-sm"
              variant="ghost"
              aria-label={`Delete service ${e?.name}`}
              onClick={() => remove(e?.metadata?.workspace || ws, e?.sandbox ?? '', e?.name ?? '')}
            >
              <Trash2Icon />
            </WriteButton>
          )
        },
      }),
    ],
    [allWorkspaces, ws, remove],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Services"
        description="HTTP endpoints inside sandboxes, published through the gateway."
        actions={
          <WriteButton onClick={() => setExposing(true)}>
            <PlusIcon /> Expose service
          </WriteButton>
        }
      />
      <QueryView query={services}>
        {(data) =>
          data.services?.length ? (
            <Card className="gap-0 py-0">
              <div className="border-b p-3">
                <SearchInput value={filter} onChange={setFilter} placeholder="Filter services" />
              </div>
              <DataTable
                data={data.services}
                columns={columns}
                filter={filter}
                getRowId={(s) => `${s.endpoint?.sandbox}/${s.endpoint?.name}`}
              />
            </Card>
          ) : (
            <Card>
              <EmptyState
                icon={<GlobeIcon />}
                title="No exposed services"
                description="Expose a port of a sandbox to reach a web app or API running inside it."
                action={
                  <WriteButton onClick={() => setExposing(true)}>
                    <PlusIcon /> Expose a service
                  </WriteButton>
                }
              />
            </Card>
          )
        }
      </QueryView>
      <ExposeServiceDialog
        gw={gw}
        open={exposing}
        onOpenChange={setExposing}
        choices={(sandboxes.data?.sandboxes ?? []).map(refOf)}
      />
    </div>
  )
}
