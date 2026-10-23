import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { useRpc } from '@/api/mutations'
import { DialogForm, FormDialog } from '@/components/common/form-dialog'
import { FormField } from '@/components/common/form-field'
import { KeyValueEditor } from '@/components/common/key-value-editor'
import { FieldDescription, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { SandboxWorkloadConfig } from '@/gen/openshell'
import { cpuSchema, envRowsSchema, memorySchema, nameSchema, rowsToMap } from '@/lib/validation'

const schema = z.object({
  name: nameSchema,
  image: z.string().trim().min(1, 'Enter an image.'),
  cpu: cpuSchema,
  memory: memorySchema,
  gpuCount: z.string().regex(/^(\d{1,2})?$/, 'Enter a number of GPUs.'),
  env: envRowsSchema,
})
type Values = z.infer<typeof schema>

interface CreateTemplateDialogProps {
  gw: string
  ws: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateTemplateDialog({ gw, ws, open, onOpenChange }: CreateTemplateDialogProps) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New sandbox template"
      description={`A reusable workload shape in workspace ${ws}. New sandboxes can start from it.`}
    >
      <TemplateForm gw={gw} ws={ws} onDone={() => onOpenChange(false)} />
    </FormDialog>
  )
}

function TemplateForm({ gw, ws, onDone }: { gw: string; ws: string; onDone: () => void }) {
  const create = useRpc(gw, 'CreateSandboxTemplate', {
    toastErrors: false,
    success: (_, v) => `Template ${v.body.template?.metadata?.name} created.`,
  })
  const { control, handleSubmit } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', image: '', cpu: '', memory: '', gpuCount: '', env: [] },
  })
  const submit = handleSubmit((v) => {
    const workload: SandboxWorkloadConfig = { image: v.image }
    const env = rowsToMap(v.env)
    if (Object.keys(env).length) workload.environment = env
    if (v.cpu || v.memory || v.gpuCount) {
      workload.resources = {}
      if (v.cpu) workload.resources.cpu = v.cpu
      if (v.memory) workload.resources.memory = v.memory
      if (v.gpuCount) workload.resources.gpu = { count: Number(v.gpuCount) }
    }
    create.mutate(
      { ws, body: { template: { metadata: { name: v.name }, spec: { workload } } } },
      { onSuccess: onDone },
    )
  })

  return (
    <DialogForm
      onSubmit={submit}
      submitLabel="Create template"
      pending={create.isPending}
      error={create.error}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          control={control}
          name="name"
          label="Name"
          render={({ field, id, invalid }) => (
            <Input
              {...field}
              id={id}
              aria-invalid={invalid || undefined}
              placeholder="python-dev"
              autoComplete="off"
              autoFocus
            />
          )}
        />
        <FormField
          control={control}
          name="image"
          label="Image"
          render={({ field, id, invalid }) => (
            <Input
              {...field}
              id={id}
              aria-invalid={invalid || undefined}
              placeholder="ghcr.io/org/image:tag"
              className="font-mono text-xs"
            />
          )}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField
          control={control}
          name="cpu"
          label="CPU"
          render={({ field, id, invalid }) => (
            <Input {...field} id={id} aria-invalid={invalid || undefined} placeholder="2" />
          )}
        />
        <FormField
          control={control}
          name="memory"
          label="Memory"
          render={({ field, id, invalid }) => (
            <Input {...field} id={id} aria-invalid={invalid || undefined} placeholder="4Gi" />
          )}
        />
        <FormField
          control={control}
          name="gpuCount"
          label="GPUs"
          render={({ field, id, invalid }) => (
            <Input
              {...field}
              id={id}
              aria-invalid={invalid || undefined}
              placeholder="none"
              inputMode="numeric"
            />
          )}
        />
      </div>
      <FieldSet>
        <FieldLegend variant="label">Environment</FieldLegend>
        <FieldDescription>No secrets; use providers.</FieldDescription>
        <KeyValueEditor control={control} name="env" />
      </FieldSet>
    </DialogForm>
  )
}
