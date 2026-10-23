import { CheckIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { api } from '@/api/client'
import { errorMessage } from '@/api/errors'
import { useRpc } from '@/api/mutations'
import { CodeEditor } from '@/components/common/code-editor'
import { DialogForm, FormDialog } from '@/components/common/form-dialog'
import { Button } from '@/components/ui/button'
import { FieldDescription } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import type { SandboxPolicy } from '@/gen/sandbox'
import { policyToYaml, withoutProviderRules } from '@/lib/policy'
import type { SandboxRef } from '@/lib/sandbox'

interface EditPolicyDialogProps {
  gw: string
  sandboxRef: SandboxRef
  open: boolean
  onOpenChange: (open: boolean) => void
  policy?: SandboxPolicy
  version?: number
}

export function EditPolicyDialog({
  open,
  onOpenChange,
  sandboxRef,
  version,
  ...rest
}: EditPolicyDialogProps) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title={`Edit policy of ${sandboxRef.name}${version ? ` (v${version})` : ''}`}
      description="Replaces the sandbox policy. Only network rules may change after creation; the gateway validates the rest."
    >
      <EditPolicyForm sandboxRef={sandboxRef} onDone={() => onOpenChange(false)} {...rest} />
    </FormDialog>
  )
}

function summarize(p: SandboxPolicy): string {
  const rules = Object.keys(p.network_policies ?? {}).length
  const rw = p.filesystem?.read_write?.length ?? 0
  const ro = p.filesystem?.read_only?.length ?? 0
  return `${rules} network rule${rules === 1 ? '' : 's'}, ${ro} read-only and ${rw} read-write paths.`
}

function EditPolicyForm({
  gw,
  sandboxRef,
  policy,
  onDone,
}: Omit<EditPolicyDialogProps, 'open' | 'onOpenChange' | 'version'> & { onDone: () => void }) {
  const [text, setText] = useState(() => policyToYaml(withoutProviderRules(policy)))
  const [check, setCheck] = useState<{ ok: boolean; message: string } | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const update = useRpc(gw, 'UpdateConfig', { toastErrors: false })

  const runCheck = async () => {
    setChecking(true)
    try {
      setCheck({
        ok: true,
        message: `Parsed: ${summarize(await api.convertPolicy(text))} The gateway checks the rest when you apply.`,
      })
    } catch (e) {
      setCheck({ ok: false, message: errorMessage(e) })
    } finally {
      setChecking(false)
    }
  }

  return (
    <DialogForm
      submitLabel="Apply policy"
      pending={update.isPending}
      error={error}
      extraActions={
        <Button type="button" variant="outline" onClick={runCheck} disabled={checking}>
          {checking ? <Spinner /> : <CheckIcon />} Check
        </Button>
      }
      onSubmit={async (e) => {
        e.preventDefault()
        setError(null)
        try {
          const p = await api.convertPolicy(text)
          const r = await update.mutateAsync({
            ws: sandboxRef.workspace,
            body: { sandbox: sandboxRef.name, policy: p },
          })
          toast.success(`Policy applied. Version ${r.version}.`)
          onDone()
        } catch (err) {
          setError(err)
        }
      }}
    >
      <FieldDescription>
        Paste CLI YAML (as for <code>openshell policy set</code>), proto YAML or proto JSON. Rules
        from attached providers are added by the gateway and are not shown here.
      </FieldDescription>
      <CodeEditor
        aria-label="Policy"
        value={text}
        onChange={(v) => {
          setText(v)
          setCheck(null)
        }}
        height="min(55dvh, 32rem)"
      />
      {check && (
        <p
          className={
            check.ok
              ? 'text-sm text-emerald-700 dark:text-emerald-400'
              : 'font-mono text-xs whitespace-pre-wrap text-destructive'
          }
        >
          {check.message}
        </p>
      )}
    </DialogForm>
  )
}
