import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { useRpc } from '@/api/mutations'
import { DialogForm, FormDialog } from '@/components/common/form-dialog'
import { FormField } from '@/components/common/form-field'
import { KeyValueEditor } from '@/components/common/key-value-editor'
import { SimpleSelect } from '@/components/common/simple-select'
import { FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { WorkspaceRole } from '@/gen/openshell'
import { labelRowsSchema, rowsToMap, workspaceNameSchema } from '@/lib/validation'

const ROLE_OPTIONS: { value: WorkspaceRole; label: string }[] = [
  { value: 'WORKSPACE_ROLE_USER', label: 'User' },
  { value: 'WORKSPACE_ROLE_ADMIN', label: 'Admin' },
]

interface DialogProps {
  gw: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ---------- new workspace ----------

const wsSchema = z.object({ name: workspaceNameSchema, labels: labelRowsSchema })
type WsValues = z.infer<typeof wsSchema>

export function CreateWorkspaceDialog({
  gw,
  open,
  onOpenChange,
  onCreated,
}: DialogProps & { onCreated: (name: string) => void }) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New workspace"
      description="An isolation boundary for sandboxes, providers and templates. Needs the platform admin role on gateways with OIDC."
    >
      <CreateWorkspaceForm
        gw={gw}
        onDone={(name) => {
          onOpenChange(false)
          onCreated(name)
        }}
      />
    </FormDialog>
  )
}

function CreateWorkspaceForm({ gw, onDone }: { gw: string; onDone: (name: string) => void }) {
  const create = useRpc(gw, 'CreateWorkspace', {
    toastErrors: false,
    success: (_, v) => `Workspace ${v.body.name} created.`,
  })
  const { control, handleSubmit } = useForm<WsValues>({
    resolver: zodResolver(wsSchema),
    defaultValues: { name: '', labels: [] },
  })
  const submit = handleSubmit((v) => {
    const labels = rowsToMap(v.labels)
    create.mutate(
      {
        ws: 'default',
        body: { name: v.name, labels: Object.keys(labels).length ? labels : undefined },
      },
      { onSuccess: () => onDone(v.name) },
    )
  })
  return (
    <DialogForm
      onSubmit={submit}
      submitLabel="Create workspace"
      pending={create.isPending}
      error={create.error}
    >
      <FormField
        control={control}
        name="name"
        label="Name"
        render={({ field, id, invalid }) => (
          <Input
            {...field}
            id={id}
            aria-invalid={invalid || undefined}
            placeholder="team-a"
            autoComplete="off"
            autoFocus
          />
        )}
      />
      <FieldSet>
        <FieldLegend variant="label">Labels</FieldLegend>
        <KeyValueEditor
          control={control}
          name="labels"
          addLabel="Add label"
          keyPlaceholder="team"
        />
      </FieldSet>
    </DialogForm>
  )
}

// ---------- members ----------

const memberSchema = z.object({
  subject: z.string().trim().min(1, 'Enter a subject.'),
  role: z.string(),
})
type MemberValues = z.infer<typeof memberSchema>

export function AddMemberDialog({
  gw,
  open,
  onOpenChange,
  workspace,
  initial,
}: DialogProps & { workspace: string; initial?: MemberValues }) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={initial ? `Change role of ${initial.subject}` : `Add a member to ${workspace}`}
      description="The principal is the OIDC subject (or mTLS identity) shown under Your identity on the Gateway page."
    >
      <AddMemberForm
        gw={gw}
        workspace={workspace}
        initial={initial}
        onDone={() => onOpenChange(false)}
      />
    </FormDialog>
  )
}

function AddMemberForm({
  gw,
  workspace,
  initial,
  onDone,
}: {
  gw: string
  workspace: string
  initial?: MemberValues
  onDone: () => void
}) {
  const add = useRpc(gw, 'AddWorkspaceMember', {
    toastErrors: false,
    success: (_, v) =>
      `${v.body.principal_subject} is now a ${v.body.role === 'WORKSPACE_ROLE_ADMIN' ? 'admin' : 'user'} of ${workspace}.`,
  })
  const { control, handleSubmit } = useForm<MemberValues>({
    resolver: zodResolver(memberSchema),
    defaultValues: initial ?? { subject: '', role: 'WORKSPACE_ROLE_USER' },
  })
  const remove = useRpc(gw, 'RemoveWorkspaceMember', { toastErrors: false })
  const [error, setError] = useState<unknown>(null)

  const submit = handleSubmit(async (v) => {
    setError(null)
    const role = v.role as WorkspaceRole
    const subject = v.subject
    try {
      if (initial && initial.role !== role) {
        // The gateway has no role update: replace the membership, and put the
        // old one back if the new one is refused.
        await remove.mutateAsync({ ws: workspace, body: { principal_subject: subject } })
        try {
          await add.mutateAsync({ ws: workspace, body: { principal_subject: subject, role } })
        } catch (e) {
          await add.mutateAsync({
            ws: workspace,
            body: { principal_subject: subject, role: initial.role as WorkspaceRole },
          })
          throw e
        }
      } else if (!initial) {
        await add.mutateAsync({ ws: workspace, body: { principal_subject: subject, role } })
      }
      onDone()
    } catch (e) {
      setError(e)
    }
  })
  return (
    <DialogForm
      onSubmit={submit}
      submitLabel={initial ? 'Save' : 'Add member'}
      pending={add.isPending || remove.isPending}
      error={error}
    >
      <FormField
        control={control}
        name="subject"
        label="Principal subject"
        render={({ field, id, invalid }) => (
          <Input
            {...field}
            id={id}
            aria-invalid={invalid || undefined}
            disabled={!!initial}
            data-1p-ignore
            autoComplete="off"
            autoFocus
            className="font-mono text-xs"
          />
        )}
      />
      <FormField
        control={control}
        name="role"
        label="Role"
        render={({ field, id }) => (
          <SimpleSelect
            id={id}
            className="w-full"
            value={field.value}
            onValueChange={field.onChange}
            options={ROLE_OPTIONS}
          />
        )}
      />
    </DialogForm>
  )
}
