import {
  CheckIcon,
  EllipsisIcon,
  LayersIcon,
  PlusIcon,
  Trash2Icon,
  UserPlusIcon,
  UsersIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import { AddMemberDialog, CreateWorkspaceDialog } from './workspace-dialogs'
import { useRpc } from '@/api/mutations'
import { useGwCall, useWorkspaces } from '@/api/queries'
import { Chips } from '@/components/common/chips'
import { useConfirm } from '@/components/common/confirm-context'
import { columnsFor } from '@/components/common/columns'
import { DataTable } from '@/components/common/data-table'
import { EmptyState } from '@/components/common/empty-state'
import { PageHeader, Section } from '@/components/common/page'
import { QueryView } from '@/components/common/query-view'
import { RelativeTime } from '@/components/common/relative-time'
import { StatusBadge } from '@/components/common/status-badge'
import { WriteButton } from '@/components/common/write-button'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Workspace } from '@/gen/datamodel'
import type { WorkspaceMember } from '@/gen/openshell'
import { useCanWrite, useScope } from '@/hooks/use-scope'
import { enumLabel } from '@/lib/format'
import { usePreferences } from '@/lib/preferences'
import { cn } from '@/lib/utils'
import { useDocumentTitle } from '@/hooks/use-document-title'

const wsCol = columnsFor<Workspace>()
const memberCol = columnsFor<WorkspaceMember>()

export default function WorkspacesPage() {
  useDocumentTitle('Workspaces')
  const { gw, ws } = useScope()
  const setWorkspace = usePreferences((s) => s.setWorkspace)
  const workspaces = useWorkspaces(gw)
  const canWrite = useCanWrite()
  const confirm = useConfirm()
  const [creating, setCreating] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const { mutateAsync: deleteWorkspace } = useRpc(gw, 'DeleteWorkspace', {
    toastErrors: false,
    success: (_, v) => `Workspace ${v.body.name} deleted.`,
  })

  const names = (workspaces.data?.workspaces ?? []).map((w) => w.metadata?.name ?? '')
  const selected = picked && names.includes(picked) ? picked : names.includes(ws) ? ws : names[0]

  const columns = useMemo(
    () => [
      wsCol.accessor((w) => w.metadata?.name ?? '', {
        id: 'name',
        header: 'Workspace',
        cell: ({ getValue }) => (
          <span className="inline-flex items-center gap-2 font-medium">
            {getValue()}
            {getValue() === ws && (
              <StatusBadge tone="info" dot={false}>
                current
              </StatusBadge>
            )}
          </span>
        ),
      }),
      wsCol.accessor((w) => enumLabel(w.status?.phase, 'WORKSPACE_PHASE_'), {
        id: 'phase',
        header: 'Phase',
        meta: { className: 'hidden sm:table-cell' },
      }),
      wsCol.accessor(
        (w) =>
          Object.entries(w.metadata?.labels ?? {})
            .map(([k, v]) => `${k}=${v}`)
            .join(' '),
        {
          id: 'labels',
          header: 'Labels',
          cell: ({ row }) => (
            <Chips
              items={Object.entries(row.original.metadata?.labels ?? {}).map(
                ([k, v]) => `${k}=${v}`,
              )}
            />
          ),
          meta: { className: 'hidden md:table-cell' },
        },
      ),
      wsCol.accessor((w) => w.metadata?.created_time ?? '', {
        id: 'created',
        header: 'Created',
        sortFn: 'datetime',
        cell: ({ getValue }) => <RelativeTime iso={getValue()} />,
      }),
      wsCol.display({
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        meta: { className: 'w-10 text-right' },
        cell: ({ row }) => {
          const name = row.original.metadata?.name ?? ''
          return (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${name}`} />
                }
              >
                <EllipsisIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                <DropdownMenuItem disabled={name === ws} onClick={() => setWorkspace(name)}>
                  <CheckIcon /> Switch to it
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={!canWrite || name === 'default'}
                  onClick={() =>
                    confirm({
                      title: `Delete workspace ${name}?`,
                      description:
                        'The gateway refuses while it still has sandboxes or providers. You cannot undo this.',
                      confirmLabel: 'Delete workspace',
                      destructive: true,
                      typeToConfirm: name,
                      onConfirm: async () => {
                        await deleteWorkspace({ ws: name, body: { name } })
                        if (ws === name) setWorkspace('default')
                      },
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
    [canWrite, confirm, deleteWorkspace, setWorkspace, ws],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workspaces"
        description="Isolation boundaries on this gateway, and who may use them."
        actions={
          <WriteButton onClick={() => setCreating(true)}>
            <PlusIcon /> New workspace
          </WriteButton>
        }
      />
      <Section title="Workspaces" description="Select one to manage its members." flush>
        <QueryView query={workspaces}>
          {(data) => (
            <DataTable
              data={data.workspaces ?? []}
              columns={columns}
              getRowId={(w) => w.metadata?.name ?? ''}
              onRowClick={(w) => setPicked(w.metadata?.name ?? null)}
              rowClassName={(w) => cn(w.metadata?.name === selected && 'bg-muted/60')}
              empty="No workspaces."
            />
          )}
        </QueryView>
      </Section>
      {selected && <MembersSection gw={gw} workspace={selected} />}
      <CreateWorkspaceDialog
        gw={gw}
        open={creating}
        onOpenChange={setCreating}
        onCreated={setPicked}
      />
    </div>
  )
}

function MembersSection({ gw, workspace }: { gw: string; workspace: string }) {
  const members = useGwCall(gw, 'ListWorkspaceMembers', workspace, { page_size: 1000 })
  const confirm = useConfirm()
  const canWrite = useCanWrite()
  const [adding, setAdding] = useState(false)
  const [changing, setChanging] = useState<WorkspaceMember | null>(null)
  const { mutateAsync: removeMember } = useRpc(gw, 'RemoveWorkspaceMember', {
    toastErrors: false,
    success: (_, v) => `Removed ${v.body.principal_subject}.`,
  })

  const columns = useMemo(
    () => [
      memberCol.accessor((m) => m.principal_subject ?? '', {
        id: 'subject',
        header: 'Subject',
        cell: ({ getValue }) => <code className="font-mono text-xs break-all">{getValue()}</code>,
      }),
      memberCol.accessor((m) => enumLabel(m.role, 'WORKSPACE_ROLE_'), {
        id: 'role',
        header: 'Role',
        cell: ({ getValue }) => (
          <StatusBadge tone={getValue() === 'Admin' ? 'warning' : 'neutral'} dot={false}>
            {getValue()}
          </StatusBadge>
        ),
      }),
      memberCol.accessor((m) => m.metadata?.created_time ?? '', {
        id: 'added',
        header: 'Added',
        cell: ({ getValue }) => <RelativeTime iso={getValue()} />,
      }),
      memberCol.display({
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        meta: { className: 'w-10 text-right' },
        cell: ({ row }) => {
          const subject = row.original.principal_subject ?? ''
          return (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Actions for ${subject}`}
                    disabled={!canWrite}
                  />
                }
              >
                <EllipsisIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-40">
                <DropdownMenuItem onClick={() => setChanging(row.original)}>
                  <UsersIcon /> Change role
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() =>
                    confirm({
                      title: `Remove ${subject}?`,
                      description: `They lose access to workspace ${workspace}.`,
                      confirmLabel: 'Remove member',
                      destructive: true,
                      onConfirm: () =>
                        removeMember({ ws: workspace, body: { principal_subject: subject } }),
                    })
                  }
                >
                  <Trash2Icon /> Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      }),
    ],
    [canWrite, confirm, removeMember, workspace],
  )

  return (
    <Section
      title={<>Members of {workspace}</>}
      description="Platform admins can use every workspace without being listed."
      flush
      actions={
        <WriteButton size="sm" variant="outline" onClick={() => setAdding(true)}>
          <UserPlusIcon /> Add member
        </WriteButton>
      }
    >
      <QueryView query={members}>
        {(data) =>
          data.members?.length ? (
            <DataTable
              data={data.members}
              columns={columns}
              getRowId={(m) => m.principal_subject ?? ''}
            />
          ) : (
            <EmptyState
              icon={<LayersIcon />}
              title="No explicit members"
              description="Add principals to give them access to this workspace."
            />
          )
        }
      </QueryView>
      <AddMemberDialog gw={gw} workspace={workspace} open={adding} onOpenChange={setAdding} />
      <AddMemberDialog
        gw={gw}
        workspace={workspace}
        open={!!changing}
        onOpenChange={(o) => !o && setChanging(null)}
        initial={
          changing
            ? {
                subject: changing.principal_subject ?? '',
                role: changing.role ?? 'WORKSPACE_ROLE_USER',
              }
            : undefined
        }
      />
    </Section>
  )
}
