import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

import { parseDriverConfig } from './summary'
import { useRpc } from '@/api/mutations'
import { DialogForm, FormDialog } from '@/components/common/form-dialog'
import { FormField } from '@/components/common/form-field'
import { KeyValueEditor } from '@/components/common/key-value-editor'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { SandboxWorkloadConfig, SandboxWorkloadTemplate } from '@/gen/openshell'
import {
  cpuSchema,
  envRowsSchema,
  labelRowsSchema,
  memorySchema,
  nameSchema,
  rowsToMap,
} from '@/lib/validation'

const schema = z.object({
  name: nameSchema,
  image: z.string().trim(),
  cpu: cpuSchema,
  memory: memorySchema,
  gpu: z.boolean(),
  gpuCount: z.string().regex(/^(\d{1,2})?$/, 'Enter a number of GPUs, or leave empty.'),
  env: envRowsSchema,
  labels: labelRowsSchema,
  driverConfig: z.string().superRefine((v, ctx) => {
    try {
      parseDriverConfig(v)
    } catch (e) {
      const msg = e instanceof SyntaxError ? `Not valid JSON: ${e.message}` : (e as Error).message
      ctx.addIssue({ code: 'custom', message: msg })
    }
  }),
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
    defaultValues: {
      name: '',
      image: '',
      cpu: '',
      memory: '',
      gpu: false,
      gpuCount: '',
      env: [],
      labels: [],
      driverConfig: '',
    },
  })
  const gpu = useWatch({ control, name: 'gpu' })
  const submit = handleSubmit((v) => {
    const workload: SandboxWorkloadConfig = {}
    if (v.image) workload.image = v.image
    const env = rowsToMap(v.env)
    if (Object.keys(env).length) workload.environment = env
    if (v.cpu || v.memory || v.gpu) {
      workload.resources = {}
      if (v.cpu) workload.resources.cpu = v.cpu
      if (v.memory) workload.resources.memory = v.memory
      // No count asks for the compute driver's default GPU assignment.
      if (v.gpu) workload.resources.gpu = v.gpuCount ? { count: Number(v.gpuCount) } : {}
    }
    const template: SandboxWorkloadTemplate = { metadata: { name: v.name }, spec: { workload } }
    const labels = rowsToMap(v.labels)
    if (Object.keys(labels).length) template.metadata!.labels = labels
    const driverConfig = parseDriverConfig(v.driverConfig)
    if (driverConfig) template.spec!.driver_config = driverConfig
    create.mutate({ ws, body: { template } }, { onSuccess: onDone })
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
          description="Empty uses the gateway's default image."
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
      <div className="grid gap-4 sm:grid-cols-2">
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
      </div>
      <div className="flex items-end gap-4">
        <Controller
          control={control}
          name="gpu"
          render={({ field }) => (
            <Field orientation="horizontal" className="w-auto">
              <Checkbox id="t-gpu" checked={field.value} onCheckedChange={field.onChange} />
              <FieldLabel htmlFor="t-gpu">Request GPUs</FieldLabel>
            </Field>
          )}
        />
        {gpu && (
          <FormField
            control={control}
            name="gpuCount"
            label="Count"
            className="w-40"
            render={({ field, id, invalid }) => (
              <Input
                {...field}
                id={id}
                aria-invalid={invalid || undefined}
                placeholder="driver default"
                inputMode="numeric"
              />
            )}
          />
        )}
      </div>
      <FieldSet>
        <FieldLegend variant="label">Environment</FieldLegend>
        <FieldDescription>No secrets; use providers.</FieldDescription>
        <KeyValueEditor control={control} name="env" />
      </FieldSet>
      <FieldSet>
        <FieldLegend variant="label">Labels</FieldLegend>
        <KeyValueEditor
          control={control}
          name="labels"
          addLabel="Add label"
          keyPlaceholder="team"
        />
      </FieldSet>
      <FormField
        control={control}
        name="driverConfig"
        label="Driver config"
        description="Optional JSON keyed by compute driver, passed to the driver as is."
        render={({ field, id, invalid }) => (
          <Textarea
            {...field}
            id={id}
            aria-invalid={invalid || undefined}
            rows={4}
            placeholder={'{"kubernetes": {"pod": {"runtime_class_name": "kata-containers"}}}'}
            className="font-mono text-xs"
            spellCheck={false}
          />
        )}
      />
    </DialogForm>
  )
}
