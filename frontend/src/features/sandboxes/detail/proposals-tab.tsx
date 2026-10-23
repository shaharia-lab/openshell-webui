import {
  CheckCheckIcon,
  CheckIcon,
  ChevronRightIcon,
  EraserIcon,
  PencilIcon,
  ShieldAlertIcon,
  SparklesIcon,
  Undo2Icon,
  XIcon,
} from 'lucide-react'
import { useState } from 'react'

import { useRpc } from '@/api/mutations'
import { Chips } from '@/components/common/chips'
import { useConfirm } from '@/components/common/confirm-context'
import { DiffView } from '@/components/common/diff-view'
import { EmptyState } from '@/components/common/empty-state'
import { DialogForm, FormDialog } from '@/components/common/form-dialog'
import { QueryView } from '@/components/common/query-view'
import { RelativeTime } from '@/components/common/relative-time'
import { StatusBadge, type Tone } from '@/components/common/status-badge'
import { WriteButton } from '@/components/common/write-button'
import { Card, CardContent } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useDraft } from './use-draft'
import { EditChunkDialog } from '@/features/policy/edit-chunk-dialog'
import type { PolicyChunk } from '@/gen/openshell'
import { policyToYaml } from '@/lib/policy'
import type { SandboxRef } from '@/lib/sandbox'

const STATUS_TONE: Record<string, Tone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'neutral',
}
type Filter = 'all' | 'pending' | 'approved' | 'rejected'

export function ProposalsTab({ gw, sandboxRef }: { gw: string; sandboxRef: SandboxRef }) {
  const draft = useDraft(gw, sandboxRef)
  const [filter, setFilter] = useState<Filter>('pending')
  const confirm = useConfirm()
  const { workspace: ws, name } = sandboxRef
  const approveAll = useRpc(gw, 'ApproveAllDraftChunks', {
    toastErrors: false,
    success: (r) =>
      `${r.chunks_approved ?? 0} approved${r.chunks_skipped ? `, ${r.chunks_skipped} skipped` : ''}. Policy v${r.policy_version}.`,
  })
  const clear = useRpc(gw, 'ClearDraftChunks', {
    toastErrors: false,
    success: (r) => `${r.chunks_cleared ?? 0} proposals cleared.`,
  })

  return (
    <QueryView query={draft}>
      {(data) => {
        const chunks = data.chunks ?? []
        const pending = chunks.filter((c) => c.status === 'pending')
        const flagged = pending.filter((c) => c.security_notes)
        const shown = filter === 'all' ? chunks : chunks.filter((c) => c.status === filter)
        const counts = (s: Filter) =>
          s === 'all' ? chunks.length : chunks.filter((c) => c.status === s).length

        return (
          <div className="space-y-4">
            {data.rolling_summary && (
              <Card size="sm">
                <CardContent className="flex gap-3 text-sm">
                  <SparklesIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="space-y-1">
                    <p>{data.rolling_summary}</p>
                    {data.last_analyzed_time && (
                      <p className="text-xs text-muted-foreground">
                        Analyzed <RelativeTime iso={data.last_analyzed_time} />
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <ToggleGroup
                variant="outline"
                size="sm"
                value={[filter]}
                onValueChange={(v) => v[0] && setFilter(v[0] as Filter)}
              >
                {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => (
                  <ToggleGroupItem key={f} value={f} className="capitalize">
                    {f} <span className="text-muted-foreground tabular-nums">{counts(f)}</span>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <div className="ml-auto flex gap-2">
                <WriteButton
                  size="sm"
                  variant="outline"
                  disabledReason={pending.length ? undefined : 'No pending proposals.'}
                  onClick={() =>
                    confirm({
                      title: `Approve ${pending.length - flagged.length} pending proposal${pending.length - flagged.length === 1 ? '' : 's'}?`,
                      description: flagged.length
                        ? `They are merged into the policy. ${flagged.length} proposal${flagged.length > 1 ? 's' : ''} with security notes ${flagged.length > 1 ? 'stay' : 'stays'} pending; review ${flagged.length > 1 ? 'them' : 'it'} one by one.`
                        : 'They are merged into the policy in one new version.',
                      confirmLabel: 'Approve all',
                      onConfirm: () =>
                        approveAll.mutateAsync({
                          ws,
                          body: {
                            sandbox: name,
                            include_security_flagged: false,
                            approvals: pending
                              .filter((c) => !c.security_notes)
                              .map((c) => ({ chunk_id: c.id, review_token: c.review_token })),
                          },
                        }),
                    })
                  }
                >
                  <CheckCheckIcon /> Approve all
                </WriteButton>
                <WriteButton
                  size="sm"
                  variant="outline"
                  disabledReason={pending.length ? undefined : 'No pending proposals.'}
                  onClick={() =>
                    confirm({
                      title: 'Clear pending proposals?',
                      description:
                        'Pending proposals are removed. New denials can create new ones.',
                      confirmLabel: 'Clear',
                      destructive: true,
                      onConfirm: () => clear.mutateAsync({ ws, body: { sandbox: name } }),
                    })
                  }
                >
                  <EraserIcon /> Clear
                </WriteButton>
              </div>
            </div>

            {shown.length ? (
              <div className="space-y-3">
                {shown.map((c) => (
                  <ChunkCard key={c.id} gw={gw} sandboxRef={sandboxRef} chunk={c} />
                ))}
              </div>
            ) : (
              <Card>
                <EmptyState
                  icon={<ShieldAlertIcon />}
                  title={
                    filter === 'pending'
                      ? 'Nothing to review'
                      : `No ${filter === 'all' ? '' : filter + ' '}proposals`
                  }
                  description="When the sandbox is denied network access, OpenShell drafts a rule that would allow it. Proposals show up here for review."
                />
              </Card>
            )}
          </div>
        )
      }}
    </QueryView>
  )
}

function ChunkCard({
  gw,
  sandboxRef,
  chunk: c,
}: {
  gw: string
  sandboxRef: SandboxRef
  chunk: PolicyChunk
}) {
  const { workspace: ws, name } = sandboxRef
  const [rejecting, setRejecting] = useState(false)
  const [editing, setEditing] = useState(false)
  const approve = useRpc(gw, 'ApproveDraftChunk', {
    success: (r) => `Approved ${c.rule_name}. Policy v${r.policy_version}.`,
  })
  const undo = useRpc(gw, 'UndoDraftChunk', {
    success: (r) => `Approval undone. Policy v${r.policy_version}.`,
  })

  const endpoints = (c.proposed_rule?.endpoints ?? []).map(
    (e) => `${e.host}:${(e.ports?.length ? e.ports : [e.port]).join(',')}`,
  )
  const binaries = c.binary
    ? [c.binary]
    : (c.proposed_rule?.binaries ?? []).map((b) => b.path ?? '')
  const hasPreview = !!(c.current_effective_policy && c.candidate_effective_policy)

  return (
    <Card
      size="sm"
      className={c.security_notes && c.status === 'pending' ? 'ring-amber-500/40' : undefined}
    >
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium break-all">{c.rule_name}</span>
              <StatusBadge tone={STATUS_TONE[c.status ?? ''] ?? 'neutral'}>{c.status}</StatusBadge>
              {c.stage === 'refined' && (
                <StatusBadge tone="info" dot={false}>
                  refined
                </StatusBadge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {c.confidence ? `${Math.round(c.confidence * 100)}% confidence · ` : ''}
              seen {c.hit_count ?? 0}× · last{' '}
              <RelativeTime iso={c.last_seen_time ?? c.created_time} />
              {c.decided_time && (
                <>
                  {' '}
                  · decided <RelativeTime iso={c.decided_time} />
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {c.status === 'pending' && (
              <>
                <WriteButton size="sm" variant="ghost" onClick={() => setEditing(true)}>
                  <PencilIcon /> Edit
                </WriteButton>
                <WriteButton size="sm" variant="outline" onClick={() => setRejecting(true)}>
                  <XIcon /> Reject
                </WriteButton>
                <WriteButton
                  size="sm"
                  disabled={approve.isPending}
                  onClick={() =>
                    approve.mutate({
                      ws,
                      body: { sandbox: name, chunk_id: c.id, review_token: c.review_token },
                    })
                  }
                >
                  <CheckIcon /> Approve
                </WriteButton>
              </>
            )}
            {c.status === 'approved' && (
              <WriteButton
                size="sm"
                variant="outline"
                disabled={undo.isPending}
                onClick={() => undo.mutate({ ws, body: { sandbox: name, chunk_id: c.id } })}
              >
                <Undo2Icon /> Undo
              </WriteButton>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <Chips items={endpoints} />
          <span className="text-muted-foreground">for</span>
          <Chips items={binaries} empty="any binary" />
        </div>

        {c.rationale && <p className="text-sm text-muted-foreground">{c.rationale}</p>}
        {c.security_notes && (
          <p className="flex gap-2 rounded-md bg-amber-500/10 p-2 text-sm text-amber-800 dark:text-amber-300">
            <ShieldAlertIcon className="mt-0.5 size-4 shrink-0" /> {c.security_notes}
          </p>
        )}
        {c.validation_result && (
          <p className="text-xs text-muted-foreground">Validation: {c.validation_result}</p>
        )}
        {c.application_error && (
          <p className="text-xs text-destructive">Cannot apply: {c.application_error}</p>
        )}
        {c.rejection_reason && (
          <p className="text-xs text-muted-foreground">Rejected: {c.rejection_reason}</p>
        )}

        {hasPreview && c.status === 'pending' && (
          <Collapsible>
            <CollapsibleTrigger className="group flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ChevronRightIcon className="size-3.5 transition-transform group-data-[panel-open]:rotate-90" />
              Preview the policy change
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <DiffView
                before={policyToYaml(c.current_effective_policy)}
                after={policyToYaml(c.candidate_effective_policy)}
              />
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>

      <FormDialog
        open={rejecting}
        onOpenChange={setRejecting}
        size="sm"
        title={`Reject ${c.rule_name}?`}
        description="The reason is passed to the agent in the sandbox so it can revise the proposal."
      >
        <RejectForm gw={gw} sandboxRef={sandboxRef} chunk={c} onDone={() => setRejecting(false)} />
      </FormDialog>
      <EditChunkDialog
        gw={gw}
        sandboxRef={sandboxRef}
        chunk={editing ? c : null}
        onOpenChange={setEditing}
      />
    </Card>
  )
}

function RejectForm({
  gw,
  sandboxRef,
  chunk,
  onDone,
}: {
  gw: string
  sandboxRef: SandboxRef
  chunk: PolicyChunk
  onDone: () => void
}) {
  const [reason, setReason] = useState('')
  const reject = useRpc(gw, 'RejectDraftChunk', {
    toastErrors: false,
    success: 'Proposal rejected.',
  })
  return (
    <DialogForm
      submitLabel="Reject"
      destructive
      pending={reject.isPending}
      error={reject.error}
      onSubmit={(e) => {
        e.preventDefault()
        reject.mutate(
          {
            ws: sandboxRef.workspace,
            body: { sandbox: sandboxRef.name, chunk_id: chunk.id, reason: reason.trim() },
          },
          { onSuccess: onDone },
        )
      }}
    >
      <Field>
        <FieldLabel htmlFor="reject-reason">Reason</FieldLabel>
        <Input
          id="reject-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Optional"
          autoFocus
        />
      </Field>
    </DialogForm>
  )
}
