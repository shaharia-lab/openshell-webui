import { FileCodeIcon, PlusIcon, TriangleAlertIcon } from 'lucide-react'
import { useState } from 'react'

import { useRpc } from '@/api/mutations'
import { useEffectivePolicy, useSandboxPolicy } from '@/api/queries'
import { Chips } from '@/components/common/chips'
import { useConfirm } from '@/components/common/confirm-context'
import { CopyButton } from '@/components/common/copy-button'
import { JsonView } from '@/components/common/json-view'
import { KeyValueList } from '@/components/common/key-value-list'
import { Section } from '@/components/common/page'
import { LoadingRows } from '@/components/common/query-view'
import { ErrorAlert } from '@/components/common/error-alert'
import { StatusBadge } from '@/components/common/status-badge'
import { WriteButton } from '@/components/common/write-button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AddRulesDialog } from '@/features/policy/add-rules-dialog'
import { EditPolicyDialog } from '@/features/policy/edit-policy-dialog'
import { NetworkRulesTable, type RuleActions } from '@/features/policy/network-rules'
import { SettingsTable } from '@/features/policy/settings-table'
import type { PolicyMergeOperation, PolicyStatus } from '@/gen/openshell'
import { enumLabel, shortHash } from '@/lib/format'
import type { SandboxRef } from '@/lib/sandbox'

const STATUS_TONE: Partial<Record<PolicyStatus, 'success' | 'warning' | 'danger' | 'info'>> = {
  POLICY_STATUS_LOADED: 'success',
  POLICY_STATUS_PENDING: 'info',
  POLICY_STATUS_FAILED: 'danger',
  POLICY_STATUS_SUPERSEDED: 'warning',
}

export function PolicyTab({ gw, sandboxRef }: { gw: string; sandboxRef: SandboxRef }) {
  const { workspace: ws, name } = sandboxRef
  const status = useSandboxPolicy(gw, ws, name)
  const effective = useEffectivePolicy(gw, ws, name)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(false)
  const confirm = useConfirm()
  const update = useRpc(gw, 'UpdateConfig', {
    toastErrors: false,
    success: (r) => `Policy updated. Version ${r.version}.`,
  })
  const setting = useRpc(gw, 'UpdateConfig', {
    toastErrors: false,
    success: (_, v) => `${v.body.setting_key} saved.`,
  })

  if (status.isPending) return <LoadingRows rows={6} />
  if (status.isError && !status.data) {
    return (
      <ErrorAlert
        error={status.error}
        title="Could not load the policy"
        onRetry={() => status.refetch()}
      />
    )
  }

  const rev = status.data?.revision ?? {}
  // The effective policy includes rules added by attached providers.
  const policy = effective.data?.policy ?? rev.policy ?? {}
  const fs = policy.filesystem ?? {}

  const mergeOp = (title: string, description: string, op: PolicyMergeOperation) =>
    confirm({
      title,
      description,
      confirmLabel: 'Remove',
      destructive: true,
      onConfirm: () => update.mutateAsync({ ws, body: { sandbox: name, merge_operations: [op] } }),
    })

  const actions: RuleActions = {
    removeRule: (rule) =>
      mergeOp(
        `Remove rule ${rule}?`,
        `Traffic that only this rule allows from ${name} is denied after the change.`,
        {
          remove_rule: { rule_name: rule },
        },
      ),
    removeEndpoint: (rule, e) =>
      mergeOp(`Remove ${e.host}:${e.port}?`, `The endpoint is removed from rule ${rule}.`, {
        remove_endpoint: { rule_name: rule, host: e.host, port: e.port ?? e.ports?.[0] },
      }),
    removeBinary: (rule, path) =>
      mergeOp(`Remove ${path} from ${rule}?`, 'That program can no longer use this rule.', {
        remove_binary: { rule_name: rule, binary_path: path },
      }),
  }

  return (
    <div className="space-y-6">
      {(rev.load_error || effective.data?.configuration_error) && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>The sandbox reported a policy problem</AlertTitle>
          <AlertDescription className="font-mono text-xs whitespace-pre-wrap">
            {[rev.load_error, effective.data?.configuration_error].filter(Boolean).join('\n')}
          </AlertDescription>
        </Alert>
      )}

      <Section
        flush
        title={
          <>
            Network rules
            {rev.status && (
              <StatusBadge tone={STATUS_TONE[rev.status] ?? 'neutral'}>
                v{rev.version} {enumLabel(rev.status, 'POLICY_STATUS_').toLowerCase()}
              </StatusBadge>
            )}
          </>
        }
        description={
          <span className="inline-flex flex-wrap items-center gap-x-2">
            {effective.data
              ? `Effective policy from the ${enumLabel(effective.data.policy_source, 'POLICY_SOURCE_').toLowerCase()} source, including provider rules.`
              : 'Sandbox rules only; the effective policy is unavailable.'}
            {rev.policy_hash && (
              <span className="inline-flex items-center font-mono text-xs">
                {shortHash(rev.policy_hash)}
                <CopyButton value={rev.policy_hash} label="Copy policy hash" />
              </span>
            )}
          </span>
        }
        actions={
          <>
            <WriteButton size="sm" variant="outline" onClick={() => setEditing(true)}>
              <FileCodeIcon /> Edit YAML
            </WriteButton>
            <WriteButton size="sm" onClick={() => setAdding(true)}>
              <PlusIcon /> Add rules
            </WriteButton>
          </>
        }
      >
        <NetworkRulesTable rules={policy.network_policies ?? {}} actions={actions} />
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Filesystem and process" description="Fixed when the sandbox is created.">
          <KeyValueList
            items={[
              { label: 'Read-only', value: <Chips items={fs.read_only} /> },
              { label: 'Read-write', value: <Chips items={fs.read_write} /> },
              { label: 'Include workdir', value: fs.include_workdir ? 'Yes' : 'No' },
              { label: 'Landlock', value: policy.landlock?.compatibility },
              { label: 'Run as user', value: policy.process?.run_as_user, optional: true },
              { label: 'Run as group', value: policy.process?.run_as_group, optional: true },
              {
                label: 'Middleware',
                value: Object.keys(policy.network_middlewares ?? {}).length ? (
                  <Chips items={Object.keys(policy.network_middlewares ?? {})} />
                ) : (
                  ''
                ),
                optional: true,
              },
            ]}
          />
        </Section>
        <Section
          flush
          title="Settings"
          description="Effective runtime settings. Sandbox values override the gateway's."
        >
          {effective.data ? (
            <SettingsTable
              rows={Object.entries(effective.data.settings ?? {})
                .map(([key, s]) => ({ key, value: s.value, scope: s.scope }))
                .sort((a, b) => a.key.localeCompare(b.key))}
              onSave={(key, value) =>
                setting.mutateAsync({
                  ws,
                  body: { sandbox: name, setting_key: key, setting_value: value },
                })
              }
              empty="No settings registered."
            />
          ) : (
            <p className="p-4 text-sm text-muted-foreground">
              {effective.error ? `Unavailable: ${effective.error.message}` : 'Loading…'}
            </p>
          )}
        </Section>
      </div>

      <JsonView
        value={effective.data ?? status.data}
        label="Effective policy and settings as JSON"
      />

      <AddRulesDialog
        gw={gw}
        sandboxRef={sandboxRef}
        open={adding}
        onOpenChange={setAdding}
        existing={policy.network_policies ?? {}}
        version={rev.version}
      />
      <EditPolicyDialog
        gw={gw}
        sandboxRef={sandboxRef}
        open={editing}
        onOpenChange={setEditing}
        policy={rev.policy}
        version={rev.version}
      />
    </div>
  )
}
