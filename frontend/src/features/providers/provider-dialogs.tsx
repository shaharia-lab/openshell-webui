import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo } from 'react'
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

import { useRpc } from '@/api/mutations'
import { useProfiles } from '@/api/queries'
import { REDACTED } from '@/api/types'
import { DialogForm, FormDialog } from '@/components/common/form-dialog'
import { FormField } from '@/components/common/form-field'
import { KeyValueEditor } from '@/components/common/key-value-editor'
import { SimpleSelect } from '@/components/common/simple-select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { ProviderProfile } from '@/gen/openshell'
import type { Provider } from '@/gen/datamodel'
import { configRowsSchema, envRowsSchema, mapToRows, nameSchema, rowsToMap } from '@/lib/validation'

/** <input type="datetime-local"> value for an RFC 3339 time, in local time. */
function toLocalInput(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

// ---------- create ----------

const createSchema = z
  .object({
    name: nameSchema,
    type: z.string().min(1, 'Pick a profile.'),
    // One entry per profile credential: which env var it fills, and the secret.
    creds: z.array(
      z.object({ key: z.string(), value: z.string(), required: z.boolean(), label: z.string() }),
    ),
    extra: envRowsSchema,
    config: configRowsSchema,
  })
  .superRefine((v, ctx) => {
    v.creds.forEach((c, i) => {
      if (c.required && !c.value)
        ctx.addIssue({
          code: 'custom',
          message: `${c.label} is required.`,
          path: ['creds', i, 'value'],
        })
      if (c.value === REDACTED)
        ctx.addIssue({
          code: 'custom',
          message: 'Enter the real secret.',
          path: ['creds', i, 'value'],
        })
    })
  })
type CreateValues = z.infer<typeof createSchema>

const credsFor = (p?: ProviderProfile): CreateValues['creds'] =>
  (p?.credentials ?? []).map((c) => ({
    key: c.env_vars?.[0] ?? c.name ?? '',
    value: '',
    required: !!c.required,
    label: c.name ?? c.env_vars?.[0] ?? 'credential',
  }))

interface CreateProviderDialogProps {
  gw: string
  ws: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateProviderDialog({ gw, ws, open, onOpenChange }: CreateProviderDialogProps) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="New provider"
      description={`A named set of credentials in workspace ${ws}. Secrets go to the gateway only; sandboxes get placeholders.`}
    >
      <CreateProviderForm gw={gw} ws={ws} onDone={() => onOpenChange(false)} />
    </FormDialog>
  )
}

function CreateProviderForm({ gw, ws, onDone }: { gw: string; ws: string; onDone: () => void }) {
  const profiles = useProfiles(gw, ws)
  const list = useMemo(() => profiles.data?.profiles ?? [], [profiles.data])
  const create = useRpc(gw, 'CreateProvider', {
    toastErrors: false,
    success: (_, v) => `Provider ${v.body.provider?.metadata?.name} created.`,
  })
  const { control, handleSubmit, setValue } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: '', type: '', creds: [], extra: [], config: [] },
  })
  const { fields } = useFieldArray({ control, name: 'creds' })
  const type = useWatch({ control, name: 'type' })
  const profile = list.find((p) => p.id === type)

  const pickType = (id: string) => {
    setValue('type', id, { shouldValidate: true })
    setValue('creds', credsFor(list.find((p) => p.id === id)))
  }

  const submit = handleSubmit((v) => {
    const credentials = { ...rowsToMap(v.extra) }
    for (const c of v.creds) if (c.value) credentials[c.key] = c.value
    create.mutate(
      {
        ws,
        body: {
          provider: {
            metadata: { name: v.name },
            type: v.type,
            // A workspace profile must be named by its workspace; platform profiles by "".
            profile_workspace: profile?.scope === 'workspace' ? ws : '',
            credentials,
            config: rowsToMap(v.config),
          },
        },
      },
      { onSuccess: onDone },
    )
  })

  return (
    <DialogForm
      onSubmit={submit}
      submitLabel="Create provider"
      pending={create.isPending}
      error={create.error}
    >
      <FieldGroup>
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
                placeholder="anthropic"
                autoComplete="off"
                data-1p-ignore
                autoFocus
              />
            )}
          />
          <FormField
            control={control}
            name="type"
            label="Type (profile)"
            description={list.length ? profile?.description : 'Import a provider profile first.'}
            render={({ field, id }) => (
              <SimpleSelect
                id={id}
                className="w-full"
                value={field.value}
                onValueChange={pickType}
                placeholder="Choose a profile"
                options={list.map((p) => ({
                  value: p.id ?? '',
                  label: `${p.display_name || p.id} (${p.id})`,
                }))}
              />
            )}
          />
        </div>

        {fields.length > 0 && (
          <FieldSet>
            <FieldLegend variant="label">Credentials</FieldLegend>
            {fields.map((f, i) => {
              const def = profile?.credentials?.[i]
              const envs = def?.env_vars ?? []
              return (
                <Controller
                  key={f.id}
                  control={control}
                  name={`creds.${i}.value`}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid || undefined}>
                      <FieldLabel htmlFor={`cred-${i}`}>
                        {f.label}
                        {f.required && <span className="text-destructive">*</span>}
                      </FieldLabel>
                      <div className="flex gap-2">
                        {envs.length > 1 && (
                          <Controller
                            control={control}
                            name={`creds.${i}.key`}
                            render={({ field: k }) => (
                              <SimpleSelect
                                aria-label="Environment variable"
                                className="font-mono text-xs"
                                value={k.value}
                                onValueChange={k.onChange}
                                options={envs.map((e) => ({ value: e, label: e }))}
                              />
                            )}
                          />
                        )}
                        <Input
                          {...field}
                          id={`cred-${i}`}
                          type="password"
                          data-1p-ignore
                          autoComplete="new-password"
                          spellCheck={false}
                          aria-invalid={fieldState.invalid || undefined}
                          placeholder={envs.length === 1 ? envs[0] : 'secret value'}
                        />
                      </div>
                      {def?.description && <FieldDescription>{def.description}</FieldDescription>}
                      {fieldState.error && (
                        <p className="text-sm text-destructive">{fieldState.error.message}</p>
                      )}
                    </Field>
                  )}
                />
              )
            })}
          </FieldSet>
        )}

        <FieldSet>
          <FieldLegend variant="label">Other credentials</FieldLegend>
          <FieldDescription>
            Extra secret environment variables, if the profile allows them.
          </FieldDescription>
          <KeyValueEditor
            control={control}
            name="extra"
            secret
            addLabel="Add credential"
            keyPlaceholder="NAME"
            valuePlaceholder="secret value"
          />
        </FieldSet>
        <FieldSet>
          <FieldLegend variant="label">Config</FieldLegend>
          <FieldDescription>Non-secret settings, e.g. a base URL or region.</FieldDescription>
          <KeyValueEditor
            control={control}
            name="config"
            addLabel="Add config value"
            keyPlaceholder="key"
          />
        </FieldSet>
      </FieldGroup>
    </DialogForm>
  )
}

// ---------- update ----------

const updateSchema = z.object({
  existing: z.array(
    z.object({ key: z.string(), value: z.string(), remove: z.boolean(), expires: z.string() }),
  ),
  added: envRowsSchema,
  config: configRowsSchema,
})
type UpdateValues = z.infer<typeof updateSchema>

interface UpdateProviderDialogProps {
  gw: string
  provider: Provider | null
  onOpenChange: (open: boolean) => void
}

export function UpdateProviderDialog({ gw, provider, onOpenChange }: UpdateProviderDialogProps) {
  return (
    <FormDialog
      open={!!provider}
      onOpenChange={onOpenChange}
      size="lg"
      title={`Update provider ${provider?.metadata?.name ?? ''}`}
      description="Leave a secret empty to keep it. Sandboxes using the provider get the change without a restart."
    >
      {provider && (
        <UpdateProviderForm gw={gw} provider={provider} onDone={() => onOpenChange(false)} />
      )}
    </FormDialog>
  )
}

function UpdateProviderForm({
  gw,
  provider,
  onDone,
}: {
  gw: string
  provider: Provider
  onDone: () => void
}) {
  const name = provider.metadata?.name ?? ''
  const ws = provider.metadata?.workspace || 'default'
  const keys = Object.keys(provider.credentials ?? {})
  const expirations = provider.credential_expiration_times ?? {}
  const update = useRpc(gw, 'UpdateProvider', {
    toastErrors: false,
    success: (r) =>
      `Provider ${name} updated${r.target_receipts?.length ? ` for ${r.target_receipts.length} sandbox(es)` : ''}.`,
  })
  const { control, handleSubmit, setError } = useForm<UpdateValues>({
    resolver: zodResolver(updateSchema),
    defaultValues: {
      existing: keys.map((key) => ({
        key,
        value: '',
        remove: false,
        expires: toLocalInput(expirations[key]),
      })),
      added: [],
      config: mapToRows(provider.config),
    },
  })
  const { fields } = useFieldArray({ control, name: 'existing' })
  const existing = useWatch({ control, name: 'existing' })

  const submit = handleSubmit((v) => {
    const credentials: Record<string, string> = {}
    const credential_expiration_times: Record<string, string> = {}
    const clear_credential_expiration_keys: string[] = []
    for (const c of v.existing) {
      if (c.remove) {
        credentials[c.key] = ''
        continue
      }
      if (c.value) credentials[c.key] = c.value
      const before = toLocalInput(expirations[c.key])
      if (c.expires && c.expires !== before)
        credential_expiration_times[c.key] = new Date(c.expires).toISOString()
      if (!c.expires && before) clear_credential_expiration_keys.push(c.key)
    }
    const added = rowsToMap(v.added)
    for (const k of Object.keys(added)) {
      if (keys.includes(k)) {
        setError('added', { message: `${k} already exists; change it above.` })
        return
      }
    }
    Object.assign(credentials, added)
    // A removed config row deletes the key.
    const config = rowsToMap(v.config)
    for (const k of Object.keys(provider.config ?? {})) if (!(k in config)) config[k] = ''
    update.mutate(
      {
        ws,
        body: {
          provider: { metadata: { name }, type: provider.type, credentials, config },
          credential_expiration_times,
          clear_credential_expiration_keys,
        },
      },
      { onSuccess: onDone },
    )
  })

  return (
    <DialogForm
      onSubmit={submit}
      submitLabel="Update provider"
      pending={update.isPending}
      error={update.error}
    >
      <FieldGroup>
        {fields.length > 0 && (
          <FieldSet>
            <FieldLegend variant="label">Credentials</FieldLegend>
            <div className="space-y-3">
              {fields.map((f, i) => (
                <div
                  key={f.id}
                  className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_12rem_auto]"
                >
                  <Controller
                    control={control}
                    name={`existing.${i}.value`}
                    render={({ field }) => (
                      <Field>
                        <FieldLabel htmlFor={`ex-${i}`} className="font-mono text-xs">
                          {f.key}
                        </FieldLabel>
                        <Input
                          {...field}
                          id={`ex-${i}`}
                          type="password"
                          data-1p-ignore
                          autoComplete="new-password"
                          placeholder="unchanged"
                          disabled={existing[i]?.remove}
                        />
                      </Field>
                    )}
                  />
                  <Controller
                    control={control}
                    name={`existing.${i}.expires`}
                    render={({ field }) => (
                      <Field>
                        <FieldLabel
                          htmlFor={`exp-${i}`}
                          className="text-xs font-normal text-muted-foreground"
                        >
                          Expires
                        </FieldLabel>
                        <Input
                          {...field}
                          id={`exp-${i}`}
                          type="datetime-local"
                          disabled={existing[i]?.remove}
                        />
                      </Field>
                    )}
                  />
                  <Controller
                    control={control}
                    name={`existing.${i}.remove`}
                    render={({ field }) => (
                      <Field orientation="horizontal" className="h-8 w-auto">
                        <Checkbox
                          id={`rm-${i}`}
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                        <FieldLabel htmlFor={`rm-${i}`} className="font-normal">
                          Remove
                        </FieldLabel>
                      </Field>
                    )}
                  />
                </div>
              ))}
            </div>
          </FieldSet>
        )}
        <FieldSet>
          <FieldLegend variant="label">Add credentials</FieldLegend>
          <KeyValueEditor
            control={control}
            name="added"
            secret
            addLabel="Add credential"
            keyPlaceholder="NEW_KEY"
            valuePlaceholder="secret value"
          />
          <Controller
            control={control}
            name="added"
            render={({ fieldState }) => (
              <p className="text-sm text-destructive">{fieldState.error?.message}</p>
            )}
          />
        </FieldSet>
        <FieldSet>
          <FieldLegend variant="label">Config</FieldLegend>
          <FieldDescription>Removing a row deletes that key.</FieldDescription>
          <KeyValueEditor
            control={control}
            name="config"
            addLabel="Add config value"
            keyPlaceholder="key"
          />
        </FieldSet>
      </FieldGroup>
    </DialogForm>
  )
}
