import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'

import { useRpc } from '@/api/mutations'
import { DialogForm, FormDialog } from '@/components/common/form-dialog'
import { FormField } from '@/components/common/form-field'
import { SimpleSelect } from '@/components/common/simple-select'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { ServiceAuthorizationMode } from '@/gen/openshell'
import { AUTH_MODE_OPTIONS } from './auth-modes'
import type { SandboxRef } from '@/lib/sandbox'
import { NAME_RE, portSchema } from '@/lib/validation'

const schema = z.object({
  sandbox: z.string().min(1, 'Pick a sandbox.'),
  name: z
    .string()
    .trim()
    .refine((v) => !v || NAME_RE.test(v), 'Service name is not valid.'),
  port: portSchema,
  auth: z.string(),
  domain: z.boolean(),
})
type Values = z.input<typeof schema>

const refKey = (r: SandboxRef) => `${r.workspace}/${r.name}`

interface ExposeServiceDialogProps {
  gw: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The sandbox to expose from; without it the user picks one of `choices`. */
  sandbox?: SandboxRef
  choices?: SandboxRef[]
}

/** Publishes an HTTP port of a sandbox through the gateway. */
export function ExposeServiceDialog({
  gw,
  open,
  onOpenChange,
  sandbox,
  choices = [],
}: ExposeServiceDialogProps) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={sandbox ? `Expose a service from ${sandbox.name}` : 'Expose a service'}
      description="The gateway routes requests to a loopback port inside the sandbox while it is ready."
    >
      <ExposeForm gw={gw} sandbox={sandbox} choices={choices} onDone={() => onOpenChange(false)} />
    </FormDialog>
  )
}

function ExposeForm({
  gw,
  sandbox,
  choices,
  onDone,
}: {
  gw: string
  sandbox?: SandboxRef
  choices: SandboxRef[]
  onDone: () => void
}) {
  const expose = useRpc(gw, 'ExposeService', {
    toastErrors: false,
    success: (r) => (r.url ? `Service exposed at ${r.url}` : 'Service exposed.'),
  })
  const { control, handleSubmit } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      sandbox: sandbox ? refKey(sandbox) : choices[0] ? refKey(choices[0]) : '',
      name: '',
      port: '',
      auth: 'SERVICE_AUTHORIZATION_MODE_STRIP',
      domain: false,
    },
  })
  const submit = handleSubmit((v) => {
    const [workspace, ...rest] = v.sandbox.split('/')
    expose.mutate(
      {
        ws: workspace,
        body: {
          sandbox: rest.join('/'),
          name: v.name,
          target_port: Number(v.port),
          domain: v.domain,
          authorization_mode: v.auth as ServiceAuthorizationMode,
        },
      },
      { onSuccess: onDone },
    )
  })

  return (
    <DialogForm
      onSubmit={submit}
      submitLabel="Expose"
      pending={expose.isPending}
      error={expose.error}
    >
      {!sandbox && (
        <FormField
          control={control}
          name="sandbox"
          label="Sandbox"
          description={choices.length ? undefined : 'There are no sandboxes in this workspace.'}
          render={({ field, id }) => (
            <SimpleSelect
              id={id}
              className="w-full"
              value={field.value}
              onValueChange={field.onChange}
              options={choices.map((r) => ({
                value: refKey(r),
                label: `${r.name} (${r.workspace})`,
              }))}
            />
          )}
        />
      )}
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <FormField
          control={control}
          name="name"
          label="Service name"
          description="Optional. Empty is the sandbox's unnamed service."
          render={({ field, id, invalid }) => (
            <Input
              {...field}
              id={id}
              aria-invalid={invalid || undefined}
              placeholder="web"
              autoComplete="off"
              autoFocus
            />
          )}
        />
        <FormField
          control={control}
          name="port"
          label="Port"
          render={({ field, id, invalid }) => (
            <Input
              {...field}
              value={field.value as string}
              id={id}
              aria-invalid={invalid || undefined}
              inputMode="numeric"
              placeholder="8080"
            />
          )}
        />
      </div>
      <FormField
        control={control}
        name="auth"
        label="Authorization header"
        description="What the gateway does with the caller's Authorization header."
        render={({ field, id }) => (
          <SimpleSelect
            id={id}
            className="w-full"
            value={field.value}
            onValueChange={field.onChange}
            options={AUTH_MODE_OPTIONS}
          />
        )}
      />
      <Controller
        control={control}
        name="domain"
        render={({ field }) => (
          <Field orientation="horizontal">
            <Checkbox id="f-domain" checked={field.value} onCheckedChange={field.onChange} />
            <FieldContent>
              <FieldLabel htmlFor="f-domain">Use a domain URL</FieldLabel>
              <FieldDescription>
                Route by host name instead of a path on the gateway.
              </FieldDescription>
            </FieldContent>
          </Field>
        )}
      />
    </DialogForm>
  )
}
