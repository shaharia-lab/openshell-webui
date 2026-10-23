import { zodResolver } from '@hookform/resolvers/zod'
import { RefreshCwIcon, SettingsIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { useRpc } from '@/api/mutations'
import { useGwCall } from '@/api/queries'
import { useConfirm } from '@/components/common/confirm-context'
import { DialogForm, FormDialog } from '@/components/common/form-dialog'
import { FormField } from '@/components/common/form-field'
import { KeyValueEditor } from '@/components/common/key-value-editor'
import { KeyValueList } from '@/components/common/key-value-list'
import { QueryView } from '@/components/common/query-view'
import { RelativeTime } from '@/components/common/relative-time'
import { SimpleSelect } from '@/components/common/simple-select'
import { StatusBadge } from '@/components/common/status-badge'
import { WriteButton } from '@/components/common/write-button'
import { Card, CardContent } from '@/components/ui/card'
import { FieldDescription, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { Provider } from '@/gen/datamodel'
import type { ProviderCredentialRefreshStrategy } from '@/gen/openshell'
import { enumLabel, formatDateTime } from '@/lib/format'
import { configRowsSchema, rowsToMap } from '@/lib/validation'

const STRATEGIES: { value: ProviderCredentialRefreshStrategy; label: string }[] = [
  {
    value: 'PROVIDER_CREDENTIAL_REFRESH_STRATEGY_OAUTH2_REFRESH_TOKEN',
    label: 'OAuth2 refresh token',
  },
  {
    value: 'PROVIDER_CREDENTIAL_REFRESH_STRATEGY_OAUTH2_CLIENT_CREDENTIALS',
    label: 'OAuth2 client credentials',
  },
  {
    value: 'PROVIDER_CREDENTIAL_REFRESH_STRATEGY_GOOGLE_SERVICE_ACCOUNT_JWT',
    label: 'Google service account JWT',
  },
  {
    value: 'PROVIDER_CREDENTIAL_REFRESH_STRATEGY_AWS_STS_ASSUME_ROLE',
    label: 'AWS STS assume role',
  },
  { value: 'PROVIDER_CREDENTIAL_REFRESH_STRATEGY_EXTERNAL', label: 'External updater' },
  { value: 'PROVIDER_CREDENTIAL_REFRESH_STRATEGY_STATIC', label: 'Static (no refresh)' },
]
const strategyLabel = (s?: string) => enumLabel(s, 'PROVIDER_CREDENTIAL_REFRESH_STRATEGY_')

interface CredentialRefreshSheetProps {
  gw: string
  provider: Provider | null
  onOpenChange: (open: boolean) => void
}

/** Refresh status of a provider's credentials, with rotate and configure. */
export function CredentialRefreshSheet({
  gw,
  provider,
  onOpenChange,
}: CredentialRefreshSheetProps) {
  return (
    <Sheet open={!!provider} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto data-[side=right]:sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Credential refresh · {provider?.metadata?.name}</SheetTitle>
          <SheetDescription>
            How the gateway renews this provider's credentials, and when it last did.
          </SheetDescription>
        </SheetHeader>
        {provider && <RefreshBody gw={gw} provider={provider} />}
      </SheetContent>
    </Sheet>
  )
}

function RefreshBody({ gw, provider }: { gw: string; provider: Provider }) {
  const name = provider.metadata?.name ?? ''
  const ws = provider.metadata?.workspace || 'default'
  const status = useGwCall(gw, 'GetProviderRefreshStatus', ws, { provider: name })
  const [configuring, setConfiguring] = useState<string | null>(null)
  const confirm = useConfirm()
  const rotate = useRpc(gw, 'RotateProviderCredential', {
    success: (_, v) => `${v.body.credential_key} rotated.`,
  })
  const remove = useRpc(gw, 'DeleteProviderRefresh', {
    toastErrors: false,
    success: 'Refresh configuration removed.',
  })
  const keys = Object.keys(provider.credentials ?? {})

  return (
    <div className="space-y-4 px-4 pb-4">
      <div className="flex justify-end">
        <WriteButton size="sm" variant="outline" onClick={() => setConfiguring('')}>
          <SettingsIcon /> Configure refresh
        </WriteButton>
      </div>
      <QueryView query={status}>
        {(data) =>
          data.credentials?.length ? (
            <div className="space-y-3">
              {data.credentials.map((c) => (
                <Card key={c.credential_key} size="sm">
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="font-mono text-sm font-medium">{c.credential_key}</code>
                      <StatusBadge
                        tone={
                          c.last_error
                            ? 'danger'
                            : c.status === 'ok' || c.status === 'active'
                              ? 'success'
                              : 'neutral'
                        }
                      >
                        {c.status || 'unknown'}
                      </StatusBadge>
                      <div className="ml-auto flex gap-1">
                        <WriteButton
                          size="sm"
                          variant="ghost"
                          disabled={rotate.isPending}
                          onClick={() =>
                            rotate.mutate({
                              ws,
                              body: { provider: name, credential_key: c.credential_key },
                            })
                          }
                        >
                          <RefreshCwIcon /> Rotate now
                        </WriteButton>
                        <WriteButton
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Configure"
                          onClick={() => setConfiguring(c.credential_key ?? '')}
                        >
                          <SettingsIcon />
                        </WriteButton>
                        <WriteButton
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Remove refresh configuration"
                          onClick={() =>
                            confirm({
                              title: `Stop refreshing ${c.credential_key}?`,
                              description:
                                'The stored refresh material is deleted. The current credential value stays until it expires.',
                              confirmLabel: 'Remove',
                              destructive: true,
                              onConfirm: () =>
                                remove.mutateAsync({
                                  ws,
                                  body: {
                                    provider: name,
                                    credential_key: c.credential_key,
                                    allow_missing: true,
                                  },
                                }),
                            })
                          }
                        >
                          <Trash2Icon />
                        </WriteButton>
                      </div>
                    </div>
                    <KeyValueList
                      items={[
                        { label: 'Strategy', value: strategyLabel(c.strategy) },
                        {
                          label: 'Expires',
                          value: c.expiration_time && (
                            <span title={formatDateTime(c.expiration_time)}>
                              <RelativeTime iso={c.expiration_time} />
                            </span>
                          ),
                          optional: true,
                        },
                        {
                          label: 'Next refresh',
                          value: c.next_refresh_time && <RelativeTime iso={c.next_refresh_time} />,
                          optional: true,
                        },
                        {
                          label: 'Last refresh',
                          value: c.last_refresh_time && <RelativeTime iso={c.last_refresh_time} />,
                          optional: true,
                        },
                        {
                          label: 'Last error',
                          value: c.last_error && (
                            <span className="text-destructive">{c.last_error}</span>
                          ),
                          optional: true,
                        },
                        {
                          label: 'Failure',
                          value: [c.failure_code, c.provider_error_subtype]
                            .filter(Boolean)
                            .join(' / '),
                          optional: true,
                        },
                        {
                          label: 'Recovery',
                          value:
                            c.recovery_action &&
                            c.recovery_action !==
                              'PROVIDER_CREDENTIAL_REFRESH_RECOVERY_ACTION_UNSPECIFIED'
                              ? enumLabel(
                                  c.recovery_action,
                                  'PROVIDER_CREDENTIAL_REFRESH_RECOVERY_ACTION_',
                                )
                              : '',
                          optional: true,
                        },
                      ]}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No credential of this provider refreshes. Static credentials stay as entered until you
              update them.
            </p>
          )
        }
      </QueryView>

      <FormDialog
        open={configuring !== null}
        onOpenChange={(o) => !o && setConfiguring(null)}
        title="Configure credential refresh"
        description="The gateway mints new values from this material. Material values are stored as secrets."
      >
        {configuring !== null && (
          <ConfigureForm
            gw={gw}
            ws={ws}
            provider={name}
            keys={keys}
            initialKey={configuring}
            onDone={() => setConfiguring(null)}
          />
        )}
      </FormDialog>
    </div>
  )
}

const configureSchema = z.object({
  key: z.string().min(1, 'Pick a credential.'),
  strategy: z.string().min(1),
  material: configRowsSchema,
  expires: z.string(),
})
type ConfigureValues = z.infer<typeof configureSchema>

function ConfigureForm({
  gw,
  ws,
  provider,
  keys,
  initialKey,
  onDone,
}: {
  gw: string
  ws: string
  provider: string
  keys: string[]
  initialKey: string
  onDone: () => void
}) {
  const configure = useRpc(gw, 'ConfigureProviderRefresh', {
    toastErrors: false,
    success: (_, v) => `Refresh configured for ${v.body.credential_key}.`,
  })
  const { control, handleSubmit } = useForm<ConfigureValues>({
    resolver: zodResolver(configureSchema),
    defaultValues: {
      key: initialKey || keys[0] || '',
      strategy: STRATEGIES[0].value,
      material: [],
      expires: '',
    },
  })
  const submit = handleSubmit((v) => {
    const material = rowsToMap(v.material)
    configure.mutate(
      {
        ws,
        body: {
          provider,
          credential_key: v.key,
          strategy: v.strategy as ProviderCredentialRefreshStrategy,
          material,
          secret_material_keys: Object.keys(material),
          expiration_time: v.expires ? new Date(v.expires).toISOString() : undefined,
        },
      },
      { onSuccess: onDone },
    )
  })
  return (
    <DialogForm
      onSubmit={submit}
      submitLabel="Save"
      pending={configure.isPending}
      error={configure.error}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          control={control}
          name="key"
          label="Credential"
          render={({ field, id }) => (
            <SimpleSelect
              id={id}
              className="w-full font-mono text-xs"
              value={field.value}
              onValueChange={field.onChange}
              options={keys.map((k) => ({ value: k, label: k }))}
            />
          )}
        />
        <FormField
          control={control}
          name="strategy"
          label="Strategy"
          render={({ field, id }) => (
            <SimpleSelect
              id={id}
              className="w-full"
              value={field.value}
              onValueChange={field.onChange}
              options={STRATEGIES}
            />
          )}
        />
      </div>
      <FieldSet>
        <FieldLegend variant="label">Material</FieldLegend>
        <FieldDescription>
          Names depend on the strategy and the provider profile, e.g. refresh_token, client_id,
          role_arn.
        </FieldDescription>
        <KeyValueEditor
          control={control}
          name="material"
          secret
          addLabel="Add material"
          keyPlaceholder="name"
          valuePlaceholder="value"
        />
      </FieldSet>
      <FormField
        control={control}
        name="expires"
        label="Current value expires"
        description="Optional, when the credential's current value stops working."
        render={({ field, id }) => (
          <Input {...field} id={id} type="datetime-local" className="w-fit" />
        )}
      />
    </DialogForm>
  )
}
