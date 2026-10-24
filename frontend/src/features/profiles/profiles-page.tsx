import {
  EllipsisIcon,
  EyeIcon,
  FileBadgeIcon,
  PencilIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import { ProfileEditorDialog } from './profile-editor-dialog'
import { profileToYaml } from './profile-yaml'
import { useRpc } from '@/api/mutations'
import { useProfiles } from '@/api/queries'
import { Chips } from '@/components/common/chips'
import { CodeEditor } from '@/components/common/code-editor'
import { useConfirm } from '@/components/common/confirm-context'
import { columnsFor } from '@/components/common/columns'
import { DataTable } from '@/components/common/data-table'
import { EmptyState } from '@/components/common/empty-state'
import { PageHeader } from '@/components/common/page'
import { QueryView } from '@/components/common/query-view'
import { SearchInput } from '@/components/common/search-input'
import { WriteButton } from '@/components/common/write-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { ProviderProfile } from '@/gen/openshell'
import { useCanWrite, useScope } from '@/hooks/use-scope'
import { enumLabel } from '@/lib/format'
import { useDocumentTitle } from '@/hooks/use-document-title'

const col = columnsFor<ProviderProfile>()
const isCustom = (p: ProviderProfile) => p.source === 'user'

export default function ProfilesPage() {
  useDocumentTitle('Provider profiles')
  const { gw, ws, allWorkspaces } = useScope()
  const profiles = useProfiles(gw, ws)
  const canWrite = useCanWrite()
  const confirm = useConfirm()
  const [filter, setFilter] = useState('')
  const [importing, setImporting] = useState(false)
  const [editing, setEditing] = useState<ProviderProfile | null>(null)
  const [viewing, setViewing] = useState<ProviderProfile | null>(null)
  const { mutateAsync: deleteProfile } = useRpc(gw, 'DeleteProviderProfile', {
    toastErrors: false,
    success: (_, v) => `Profile ${v.body.id} deleted.`,
  })

  const columns = useMemo(
    () => [
      col.accessor((p) => `${p.id} ${p.display_name ?? ''}`, {
        id: 'id',
        header: 'Profile',
        cell: ({ row }) => (
          <div className="min-w-40">
            <div className="flex items-center gap-1.5 font-medium">
              {row.original.display_name || row.original.id}
              {row.original.inference_capable && (
                <Badge variant="secondary" className="font-normal">
                  inference
                </Badge>
              )}
            </div>
            <code className="font-mono text-xs text-muted-foreground">{row.original.id}</code>
          </div>
        ),
      }),
      col.accessor((p) => enumLabel(p.category, 'PROVIDER_PROFILE_CATEGORY_'), {
        id: 'category',
        header: 'Category',
        meta: { className: 'hidden sm:table-cell' },
      }),
      col.accessor((p) => (p.credentials ?? []).flatMap((c) => c.env_vars ?? []).join(' '), {
        id: 'credentials',
        header: 'Credentials',
        cell: ({ row }) => (
          <div className="space-y-1">
            {(row.original.credentials ?? []).map((c) => (
              <div key={c.name} className="flex flex-wrap items-center gap-1.5">
                <Chips items={c.env_vars} />
                <span className="text-xs text-muted-foreground">
                  {c.auth_style}
                  {c.header_name && ` · ${c.header_name}`}
                  {c.refresh?.strategy &&
                    ` · ${enumLabel(c.refresh.strategy, 'PROVIDER_CREDENTIAL_REFRESH_STRATEGY_').toLowerCase()}`}
                </span>
              </div>
            ))}
          </div>
        ),
        meta: { className: 'hidden md:table-cell' },
      }),
      col.accessor((p) => (p.endpoints ?? []).map((e) => `${e.host}:${e.port}`).join(' '), {
        id: 'endpoints',
        header: 'Endpoints',
        cell: ({ row }) => (
          <Chips items={(row.original.endpoints ?? []).map((e) => `${e.host}:${e.port}`)} />
        ),
        meta: { className: 'hidden lg:table-cell whitespace-normal' },
      }),
      col.accessor((p) => (p.binaries ?? []).map((b) => b.path).join(' '), {
        id: 'binaries',
        header: 'Binaries',
        cell: ({ row }) => <Chips items={(row.original.binaries ?? []).map((b) => b.path ?? '')} />,
        meta: { className: 'hidden xl:table-cell whitespace-normal' },
      }),
      col.accessor((p) => [p.source, p.scope].filter(Boolean).join(' · '), {
        id: 'source',
        header: 'Source',
        meta: { className: 'hidden md:table-cell' },
      }),
      col.display({
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        meta: { className: 'w-10 text-right' },
        cell: ({ row }) => {
          const p = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${p.id}`} />
                }
              >
                <EllipsisIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-40">
                <DropdownMenuItem onClick={() => setViewing(p)}>
                  <EyeIcon /> View
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!canWrite || !isCustom(p)}
                  onClick={() => setEditing(p)}
                >
                  <PencilIcon /> Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={!canWrite || !isCustom(p)}
                  onClick={() =>
                    confirm({
                      title: `Delete profile ${p.id}?`,
                      description:
                        'Providers of this type can no longer be created. The gateway refuses while providers still use it.',
                      confirmLabel: 'Delete profile',
                      destructive: true,
                      onConfirm: () => deleteProfile({ ws, body: { id: p.id } }),
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
    [canWrite, confirm, deleteProfile, ws],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Provider profiles"
        description="Provider types: which credentials they hold, how they authenticate, and which endpoints and programs they allow."
        actions={
          <WriteButton
            onClick={() => setImporting(true)}
            disabledReason={allWorkspaces ? 'Select one workspace to import into.' : undefined}
          >
            <UploadIcon /> Import profile
          </WriteButton>
        }
      />
      {allWorkspaces ? (
        <Card>
          <EmptyState
            icon={<FileBadgeIcon />}
            title="Pick a workspace"
            description="Provider profiles belong to one workspace. Select a workspace in the top bar to see its profiles."
          />
        </Card>
      ) : (
        <QueryView query={profiles}>
          {(data) =>
            data.profiles?.length ? (
              <Card className="gap-0 py-0">
                <div className="border-b p-3">
                  <SearchInput value={filter} onChange={setFilter} placeholder="Filter profiles" />
                </div>
                <DataTable
                  data={data.profiles}
                  columns={columns}
                  filter={filter}
                  getRowId={(p) => `${p.scope}/${p.id}`}
                  onRowClick={setViewing}
                />
              </Card>
            ) : (
              <Card>
                <EmptyState
                  icon={<FileBadgeIcon />}
                  title="No provider profiles"
                  description="Import a profile to define a provider type."
                />
              </Card>
            )
          }
        </QueryView>
      )}
      <ProfileEditorDialog gw={gw} ws={ws} open={importing} onOpenChange={setImporting} />
      <ProfileEditorDialog
        gw={gw}
        ws={ws}
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        profile={editing ?? undefined}
      />
      <Sheet open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <SheetContent className="w-full data-[side=right]:sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{viewing?.display_name || viewing?.id}</SheetTitle>
            <SheetDescription>{viewing?.description}</SheetDescription>
          </SheetHeader>
          {viewing && (
            <div className="min-h-0 flex-1 px-4 pb-4">
              <CodeEditor
                aria-label="Profile"
                value={profileToYaml(viewing)}
                readOnly
                height="100%"
                className="h-full"
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
