import { useState } from 'react'
import { toast } from 'sonner'

import { api } from '@/api/client'
import { useRpc } from '@/api/mutations'
import { CodeEditor } from '@/components/common/code-editor'
import { DialogForm, FormDialog } from '@/components/common/form-dialog'
import { FieldDescription } from '@/components/ui/field'
import type { PolicyChunk } from '@/gen/openshell'
import { policyToYaml } from '@/lib/policy'
import type { SandboxRef } from '@/lib/sandbox'

interface EditChunkDialogProps {
  gw: string
  sandboxRef: SandboxRef
  chunk: PolicyChunk | null
  onOpenChange: (open: boolean) => void
}

/** Edits a pending proposal's rule before it is approved. */
export function EditChunkDialog({ gw, sandboxRef, chunk, onOpenChange }: EditChunkDialogProps) {
  return (
    <FormDialog
      open={!!chunk}
      onOpenChange={onOpenChange}
      size="lg"
      title={`Edit proposal ${chunk?.rule_name ?? ''}`}
      description="Narrow the rule (fewer binaries, methods or paths) before approving it. The proposal stays pending."
    >
      {chunk && (
        <EditChunkForm
          gw={gw}
          sandboxRef={sandboxRef}
          chunk={chunk}
          onDone={() => onOpenChange(false)}
        />
      )}
    </FormDialog>
  )
}

function EditChunkForm({
  gw,
  sandboxRef,
  chunk,
  onDone,
}: Omit<EditChunkDialogProps, 'chunk' | 'onOpenChange'> & {
  chunk: PolicyChunk
  onDone: () => void
}) {
  const name = chunk.rule_name ?? 'rule'
  // Edit the rule inside a one-rule policy document so the CLI YAML shape applies.
  const [text, setText] = useState(() =>
    policyToYaml({ network_policies: { [name]: chunk.proposed_rule ?? {} } }),
  )
  const [error, setError] = useState<unknown>(null)
  const edit = useRpc(gw, 'EditDraftChunk', { toastErrors: false })

  return (
    <DialogForm
      submitLabel="Save proposal"
      pending={edit.isPending}
      error={error}
      onSubmit={async (e) => {
        e.preventDefault()
        setError(null)
        try {
          const rules = Object.values((await api.convertPolicy(text)).network_policies ?? {})
          if (rules.length !== 1) throw new Error('Keep exactly one rule under network_policies.')
          await edit.mutateAsync({
            ws: sandboxRef.workspace,
            body: { sandbox: sandboxRef.name, chunk_id: chunk.id, proposed_rule: rules[0] },
          })
          toast.success('Proposal updated. Review it again before approving.')
          onDone()
        } catch (err) {
          setError(err)
        }
      }}
    >
      <FieldDescription>
        Same YAML shape as a policy file. Only the rule's endpoints and binaries matter.
      </FieldDescription>
      <CodeEditor aria-label="Proposed rule" value={text} onChange={setText} height="20rem" />
    </DialogForm>
  )
}
