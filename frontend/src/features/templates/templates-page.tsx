import { LayoutTemplateIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useMemo, useState } from 'react'

import { CreateTemplateDialog } from './create-template-dialog'
import { templateResources } from './summary'
import { useRpc } from '@/api/mutations'
import { useTemplates } from '@/api/queries'
import { Chips } from '@/components/common/chips'
import { useConfirm } from '@/components/common/confirm-context'
import { columnsFor } from '@/components/common/columns'
import { ImageRef } from '@/components/common/truncated-text'
import { DataTable } from '@/components/common/data-table'
import { EmptyState } from '@/components/common/empty-state'
import { JsonView } from '@/components/common/json-view'
import { PageHeader } from '@/components/common/page'
import { QueryView } from '@/components/common/query-view'
import { SearchInput } from '@/components/common/search-input'
import { RelativeTime } from '@/components/common/relative-time'
import { WriteButton } from '@/components/common/write-button'
import { Card } from '@/components/ui/card'
import type { SandboxWorkloadTemplate } from '@/gen/openshell'
import { useScope } from '@/hooks/use-scope'
import { useDocumentTitle } from '@/hooks/use-document-title'

const col = columnsFor<SandboxWorkloadTemplate>()

const labelChips = (t: SandboxWorkloadTemplate) =>
  Object.entries(t.metadata?.labels ?? {}).map(([k, v]) => `${k}=${v}`)

export default function TemplatesPage() {
  useDocumentTitle('Templates')
  const { gw, ws, allWorkspaces } = useScope()
  const templates = useTemplates(gw, ws)
  const confirm = useConfirm()
  const [creating, setCreating] = useState(false)
  const [filter, setFilter] = useState('')
  const { mutateAsync: deleteTemplate } = useRpc(gw, 'DeleteSandboxTemplate', {
    toastErrors: false,
    success: (_, v) => `Template ${v.body.name} deleted.`,
  })

  const columns = useMemo(
    () => [
      col.accessor((t) => t.metadata?.name ?? '', {
        id: 'name',
        header: 'Name',
        cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
      }),
      ...(allWorkspaces
        ? [
            col.accessor((t) => t.metadata?.workspace ?? '', {
              id: 'workspace',
              header: 'Workspace',
            }),
          ]
        : []),
      col.accessor((t) => t.spec?.workload?.image ?? '', {
        id: 'image',
        header: 'Image',
        cell: ({ getValue }) => <ImageRef image={getValue()} />,
        meta: { className: 'hidden @lg/table:table-cell' },
      }),
      col.accessor(templateResources, {
        id: 'resources',
        header: 'Resources',
        cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">—</span>,
        meta: { className: 'hidden @3xl/table:table-cell' },
      }),
      col.accessor((t) => Object.keys(t.spec?.workload?.environment ?? {}).join(' '), {
        id: 'env',
        header: 'Environment',
        cell: ({ row }) => (
          <Chips items={Object.keys(row.original.spec?.workload?.environment ?? {})} limit={4} />
        ),
        meta: { className: 'hidden @5xl/table:table-cell' },
      }),
      col.accessor((t) => labelChips(t).join(' '), {
        id: 'labels',
        header: 'Labels',
        cell: ({ row }) => <Chips items={labelChips(row.original)} limit={3} />,
        meta: { className: 'hidden @6xl/table:table-cell' },
      }),
      col.accessor((t) => t.metadata?.created_time ?? '', {
        id: 'created',
        header: 'Created',
        sortFn: 'datetime',
        cell: ({ getValue }) => <RelativeTime iso={getValue()} />,
        meta: { className: 'hidden @xl/table:table-cell' },
      }),
      col.display({
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        meta: { className: 'w-10 text-right' },
        cell: ({ row }) => {
          const name = row.original.metadata?.name ?? ''
          return (
            <WriteButton
              size="icon-sm"
              variant="ghost"
              aria-label={`Delete template ${name}`}
              onClick={() =>
                confirm({
                  title: `Delete template ${name}?`,
                  description:
                    'Existing sandboxes keep running. New sandboxes cannot use this template.',
                  confirmLabel: 'Delete template',
                  destructive: true,
                  onConfirm: () =>
                    deleteTemplate({ ws: row.original.metadata?.workspace || ws, body: { name } }),
                })
              }
            >
              <Trash2Icon />
            </WriteButton>
          )
        },
      }),
    ],
    [allWorkspaces, confirm, deleteTemplate, ws],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Templates"
        description="Reusable workloads (image, resources, environment, driver settings) that new sandboxes take as a whole."
        actions={
          <WriteButton
            onClick={() => setCreating(true)}
            disabledReason={
              allWorkspaces ? 'Select one workspace to create a template in.' : undefined
            }
          >
            <PlusIcon /> New template
          </WriteButton>
        }
      />
      <QueryView query={templates}>
        {(data) =>
          data.templates?.length ? (
            <>
              <Card className="gap-0 py-0">
                <div className="border-b p-3">
                  <SearchInput value={filter} onChange={setFilter} placeholder="Filter templates" />
                </div>
                <DataTable
                  data={data.templates}
                  columns={columns}
                  filter={filter}
                  getRowId={(t) => t.metadata?.id ?? t.metadata?.name ?? ''}
                />
              </Card>
              <JsonView value={data.templates} label="Templates as JSON" />
            </>
          ) : (
            <Card>
              <EmptyState
                icon={<LayoutTemplateIcon />}
                title="No templates"
                description="Save an image and its resources once, then pick the template when you create sandboxes."
                action={
                  !allWorkspaces && (
                    <WriteButton onClick={() => setCreating(true)}>
                      <PlusIcon /> Create a template
                    </WriteButton>
                  )
                }
              />
            </Card>
          )
        }
      </QueryView>
      <CreateTemplateDialog gw={gw} ws={ws} open={creating} onOpenChange={setCreating} />
    </div>
  )
}
