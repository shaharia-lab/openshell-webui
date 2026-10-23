import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { RuleRowsEditor } from './rule-rows-editor'
import { ruleRowsSchema } from './rule-rows-schema'
import { useRpc } from '@/api/mutations'
import { DialogForm, FormDialog } from '@/components/common/form-dialog'
import { FieldDescription } from '@/components/ui/field'
import type { NetworkPolicyRule } from '@/gen/sandbox'
import {
  addRuleOps,
  buildRules,
  conflictsWithExisting,
  emptyRuleRow,
  type RuleRow,
} from '@/lib/policy'
import type { SandboxRef } from '@/lib/sandbox'

interface AddRulesDialogProps {
  gw: string
  sandboxRef: SandboxRef
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Rules the sandbox has now (effective policy), and its policy version. */
  existing: Record<string, NetworkPolicyRule>
  version?: number
}

export function AddRulesDialog({ open, onOpenChange, sandboxRef, ...rest }: AddRulesDialogProps) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={`Add network rules to ${sandboxRef.name}`}
      description="Each row lets one program reach one host:port. Rows for the same endpoint and access level become one rule."
    >
      <AddRulesForm sandboxRef={sandboxRef} onDone={() => onOpenChange(false)} {...rest} />
    </FormDialog>
  )
}

const schema = z.object({ rules: ruleRowsSchema })

function AddRulesForm({
  gw,
  sandboxRef,
  existing,
  version,
  onDone,
}: Omit<AddRulesDialogProps, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const [error, setError] = useState<unknown>(null)
  const merge = useRpc(gw, 'UpdateConfig', { toastErrors: false })
  const { control, handleSubmit, formState } = useForm<{ rules: RuleRow[] }>({
    resolver: zodResolver(schema),
    defaultValues: { rules: [emptyRuleRow()] },
  })

  const submit = handleSubmit(async ({ rules: rows }) => {
    setError(null)
    try {
      const rules = buildRules(rows, Object.keys(existing))
      if (!rules.length) throw new Error('Fill in at least one row.')
      const conflict = conflictsWithExisting(rules, existing)
      if (conflict) throw new Error(conflict)
      const r = await merge.mutateAsync({
        ws: sandboxRef.workspace,
        body: { sandbox: sandboxRef.name, merge_operations: addRuleOps(rules) },
      })
      // The gateway skips rules the policy already covers.
      if (version !== undefined && r.version === version)
        toast.info(`No change: policy v${r.version} already allows these rows.`)
      else
        toast.success(
          `${rules.length} rule${rules.length > 1 ? 's' : ''} added. Policy v${r.version}.`,
        )
      onDone()
    } catch (e) {
      setError(e)
    }
  })

  return (
    <DialogForm
      onSubmit={submit}
      submitLabel="Add rules"
      pending={formState.isSubmitting}
      error={error}
    >
      <RuleRowsEditor control={control} name="rules" />
      <FieldDescription>
        Access sets the HTTP methods: read-only (GET, HEAD, OPTIONS), read-write, or full. L4 skips
        HTTP inspection, so it allows any traffic to that host and cannot inject provider
        credentials. For L7 rules, paths or TLS options, edit the policy as YAML.
      </FieldDescription>
    </DialogForm>
  )
}
