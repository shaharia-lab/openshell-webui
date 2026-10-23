import { PlugIcon, UnplugIcon } from 'lucide-react'
import { useState } from 'react'

import { useRpc } from '@/api/mutations'
import { useGwCall, useProviders } from '@/api/queries'
import { useConfirm } from '@/components/common/confirm-context'
import { DialogForm, FormDialog } from '@/components/common/form-dialog'
import { Section } from '@/components/common/page'
import { SimpleSelect } from '@/components/common/simple-select'
import { StatusBadge, type Tone } from '@/components/common/status-badge'
import { WriteButton } from '@/components/common/write-button'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item'
import type { ProviderReadinessState, Sandbox } from '@/gen/openshell'
import { enumLabel } from '@/lib/format'
import { refOf, type SandboxRef } from '@/lib/sandbox'

const READINESS_TONE: Partial<Record<ProviderReadinessState, Tone>> = {
  PROVIDER_READINESS_STATE_READY: 'success',
  PROVIDER_READINESS_STATE_PENDING: 'info',
  PROVIDER_READINESS_STATE_PERSISTED: 'info',
  PROVIDER_READINESS_STATE_WITHHELD: 'warning',
  PROVIDER_READINESS_STATE_SUPERSEDED: 'neutral',
  PROVIDER_READINESS_STATE_REVOKED: 'neutral',
  PROVIDER_READINESS_STATE_FAILED: 'danger',
}

export function ProvidersCard({ gw, sandbox }: { gw: string; sandbox: Sandbox }) {
  const ref = refOf(sandbox)
  const attached = sandbox.spec?.providers ?? []
  const [attaching, setAttaching] = useState(false)
  const confirm = useConfirm()
  const detach = useRpc(gw, 'DetachSandboxProvider', {
    toastErrors: false,
    success: (_, v) => `Detached ${v.body.provider}.`,
  })

  return (
    <Section
      title="Providers"
      description="Credentials and network rules supplied to this sandbox."
      actions={
        <WriteButton size="sm" variant="outline" onClick={() => setAttaching(true)}>
          <PlugIcon /> Attach
        </WriteButton>
      }
    >
      {attached.length ? (
        <ItemGroup className="gap-2">
          {attached.map((p) => (
            <Item key={p} variant="outline" size="sm">
              <ItemContent>
                <ItemTitle>{p}</ItemTitle>
                <ProviderReadiness gw={gw} sandboxRef={ref} provider={p} />
              </ItemContent>
              <ItemActions>
                <WriteButton
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    confirm({
                      title: `Detach ${p}?`,
                      description: `${ref.name} loses the credentials and network rules of this provider.`,
                      confirmLabel: 'Detach',
                      destructive: true,
                      onConfirm: () =>
                        detach.mutateAsync({
                          ws: ref.workspace,
                          body: { sandbox: ref.name, provider: p },
                        }),
                    })
                  }
                >
                  <UnplugIcon /> Detach
                </WriteButton>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      ) : (
        <p className="text-sm text-muted-foreground">No providers attached.</p>
      )}
      <AttachProviderDialog
        gw={gw}
        sandboxRef={ref}
        attached={attached}
        open={attaching}
        onOpenChange={setAttaching}
      />
    </Section>
  )
}

/** Whether the supervisor installed the provider's credentials and policy. */
function ProviderReadiness({
  gw,
  sandboxRef,
  provider,
}: {
  gw: string
  sandboxRef: SandboxRef
  provider: string
}) {
  const status = useGwCall(gw, 'GetSandboxProviderStatus', sandboxRef.workspace, {
    sandbox: sandboxRef.name,
    provider,
  })
  const s = status.data?.status
  if (status.isError) {
    return (
      <ItemDescription className="text-xs">
        Readiness unavailable: {status.error.message}
      </ItemDescription>
    )
  }
  if (!s?.state) return <ItemDescription className="text-xs">Checking readiness…</ItemDescription>
  const reason = enumLabel(s.reason, 'PROVIDER_READINESS_REASON_')
  return (
    <ItemDescription className="flex flex-wrap items-center gap-2 text-xs">
      <StatusBadge tone={READINESS_TONE[s.state] ?? 'neutral'}>
        {enumLabel(s.state, 'PROVIDER_READINESS_STATE_')}
      </StatusBadge>
      {reason && reason !== 'Unspecified' && <span>{reason}</span>}
      {s.operation?.sanitized_error && (
        <span className="text-destructive">{s.operation.sanitized_error}</span>
      )}
    </ItemDescription>
  )
}

interface AttachProviderDialogProps {
  gw: string
  sandboxRef: SandboxRef
  attached: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

function AttachProviderDialog({
  gw,
  sandboxRef,
  attached,
  open,
  onOpenChange,
}: AttachProviderDialogProps) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={`Attach a provider to ${sandboxRef.name}`}
      description="Its rules apply once the sandbox picks up the change; readiness shows when."
    >
      <AttachForm
        gw={gw}
        sandboxRef={sandboxRef}
        attached={attached}
        onDone={() => onOpenChange(false)}
      />
    </FormDialog>
  )
}

function AttachForm({
  gw,
  sandboxRef,
  attached,
  onDone,
}: {
  gw: string
  sandboxRef: SandboxRef
  attached: string[]
  onDone: () => void
}) {
  const providers = useProviders(gw, sandboxRef.workspace)
  const options = (providers.data?.providers ?? [])
    .filter((p) => !attached.includes(p.metadata?.name ?? ''))
    .map((p) => ({ value: p.metadata?.name ?? '', label: `${p.metadata?.name} (${p.type})` }))
  const [provider, setProvider] = useState('')
  const attach = useRpc(gw, 'AttachSandboxProvider', {
    toastErrors: false,
    success: (r, v) =>
      r.attached === false
        ? `${v.body.provider} was already attached.`
        : `Attached ${v.body.provider}.`,
  })
  const selected = provider || options[0]?.value || ''

  return (
    <DialogForm
      submitLabel="Attach"
      pending={attach.isPending}
      error={attach.error}
      submitDisabled={!selected}
      onSubmit={(e) => {
        e.preventDefault()
        attach.mutate(
          { ws: sandboxRef.workspace, body: { sandbox: sandboxRef.name, provider: selected } },
          { onSuccess: onDone },
        )
      }}
    >
      {options.length ? (
        <Field>
          <FieldLabel htmlFor="attach-provider">Provider</FieldLabel>
          <SimpleSelect
            id="attach-provider"
            className="w-full"
            value={selected}
            onValueChange={setProvider}
            options={options}
          />
        </Field>
      ) : (
        <FieldDescription>
          {providers.isPending
            ? 'Loading providers…'
            : 'Every provider in this workspace is attached. Create more on the Providers page.'}
        </FieldDescription>
      )}
    </DialogForm>
  )
}
