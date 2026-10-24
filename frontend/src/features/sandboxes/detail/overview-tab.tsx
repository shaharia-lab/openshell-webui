import { TriangleAlertIcon } from 'lucide-react'

import { ProvidersCard } from './providers-card'
import { ServicesCard } from './services-card'
import { Chips } from '@/components/common/chips'
import { columnsFor } from '@/components/common/columns'
import { DataTable } from '@/components/common/data-table'
import { KeyValueList } from '@/components/common/key-value-list'
import { Section } from '@/components/common/page'
import { RelativeTime } from '@/components/common/relative-time'
import { StatusBadge } from '@/components/common/status-badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ContainersTable } from '@/features/overview/containers-table'
import type { EndpointStatus, Sandbox, SandboxCondition } from '@/gen/openshell'
import { useScope } from '@/hooks/use-scope'
import { enumLabel, formatDateTime } from '@/lib/format'
import { refOf } from '@/lib/sandbox'

const condCol = columnsFor<SandboxCondition>()
const conditionColumns = [
  condCol.accessor('type', { header: 'Type' }),
  condCol.accessor('status', {
    header: 'Status',
    cell: ({ getValue }) => (
      <StatusBadge
        tone={getValue() === 'True' ? 'success' : getValue() === 'False' ? 'danger' : 'neutral'}
      >
        {getValue()}
      </StatusBadge>
    ),
  }),
  condCol.accessor('reason', {
    header: 'Reason',
    meta: { className: 'hidden @2xl/table:table-cell' },
  }),
  condCol.accessor('message', { header: 'Message', meta: { className: 'whitespace-normal' } }),
  condCol.accessor('transition_time', {
    header: 'Changed',
    cell: ({ getValue }) => <RelativeTime iso={getValue()} />,
    meta: { className: 'hidden @xl/table:table-cell' },
  }),
]

const epCol = columnsFor<EndpointStatus>()
const endpointColumns = [
  epCol.accessor(
    (e) => `${e.host}:${(e.ports ?? []).join(',')}${e.path && e.path !== '/**' ? e.path : ''}`,
    {
      id: 'endpoint',
      header: 'Endpoint',
      cell: ({ getValue }) => <span className="font-mono text-xs">{getValue()}</span>,
    },
  ),
  epCol.accessor((e) => enumLabel(e.last_result, 'ENDPOINT_RESULT_'), {
    id: 'result',
    header: 'Last result',
    cell: ({ row, getValue }) => (
      <StatusBadge
        tone={
          row.original.last_failure
            ? 'danger'
            : row.original.last_result === 'ENDPOINT_RESULT_HTTP_RESPONSE_RECEIVED'
              ? 'success'
              : 'neutral'
        }
      >
        {getValue() || 'No exchange'}
      </StatusBadge>
    ),
  }),
  epCol.accessor((e) => e.last_failure?.code ?? '', { id: 'failure', header: 'Failure' }),
  epCol.accessor('last_reported_time', {
    header: 'Reported',
    cell: ({ getValue }) => <RelativeTime iso={getValue()} />,
  }),
]

export function OverviewTab({ gw, sandbox }: { gw: string; sandbox: Sandbox }) {
  const { gateway } = useScope()
  const m = sandbox.metadata ?? {}
  const sp = sandbox.spec ?? {}
  const st = sandbox.status ?? {}
  const limits = (sp.template?.resources?.limits ?? {}) as Record<string, string>
  const admission = st.configuration_admission
  const grantFailure = st.last_token_grant_failure
  const labels = Object.entries(m.labels ?? {}).map(([k, v]) => `${k}=${v}`)

  return (
    <div className="space-y-6">
      {admission?.error && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>The supervisor did not accept the configuration</AlertTitle>
          <AlertDescription className="font-mono text-xs">{admission.error}</AlertDescription>
        </Alert>
      )}
      {grantFailure && (
        <Alert>
          <TriangleAlertIcon />
          <AlertTitle>
            A token grant to {grantFailure.destination_host}:{grantFailure.destination_port} was
            refused
          </AlertTitle>
          <AlertDescription>
            {grantFailure.failure?.code}
            {grantFailure.failure?.provider && ` · provider ${grantFailure.failure.provider}`}
            {grantFailure.failure?.credential_key && ` / ${grantFailure.failure.credential_key}`}
            {grantFailure.failure?.recovery_action &&
              ` · ${enumLabel(grantFailure.failure.recovery_action, 'PROVIDER_CREDENTIAL_REFRESH_RECOVERY_ACTION_')}`}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Details">
          <KeyValueList
            items={[
              { label: 'ID', value: m.id, mono: true, copy: m.id },
              { label: 'Created', value: formatDateTime(m.created_time) },
              {
                label: 'Image',
                value: sp.template?.image || 'Gateway default',
                mono: true,
                copy: sp.template?.image,
              },
              {
                label: 'Template',
                value: sandbox.created_from_workload_template?.name,
                optional: true,
              },
              { label: 'Command', value: sp.command?.join(' '), mono: true },
              {
                label: 'Limits',
                value: Object.entries(limits)
                  .map(([k, v]) => `${k} ${v}`)
                  .join(', '),
              },
              {
                label: 'GPU',
                value: sp.resource_requirements?.gpu
                  ? `${sp.resource_requirements.gpu.count ?? 1} requested`
                  : '',
                optional: true,
              },
              {
                label: 'Restart policy',
                value: enumLabel(sp.restart_policy, 'SANDBOX_RESTART_POLICY_'),
              },
              { label: 'Restarts', value: String(st.restart_count ?? 0) },
              {
                label: 'Next restart',
                value: formatDateTime(st.next_restart_time),
                optional: true,
              },
              {
                label: 'Exit code',
                value: st.exit_code !== undefined ? String(st.exit_code) : '',
                optional: true,
              },
              {
                label: 'Process started',
                value: <RelativeTime iso={st.main_process_started_time} />,
              },
              { label: 'Policy version', value: `v${st.current_policy_version ?? 0}` },
              {
                label: 'Configuration',
                value: admission?.state && (
                  <StatusBadge tone={admission.state.endsWith('ACCEPTED') ? 'success' : 'warning'}>
                    {enumLabel(admission.state, 'CONFIGURATION_ADMISSION_STATE_')}
                  </StatusBadge>
                ),
              },
              {
                label: 'SSH host key',
                value: sandbox.host_key_fingerprint,
                mono: true,
                optional: true,
                copy: sandbox.host_key_fingerprint,
              },
              {
                label: 'Labels',
                value: labels.length ? <Chips items={labels} /> : '',
                optional: true,
              },
              {
                label: 'Environment',
                value: Object.keys(sp.environment ?? {}).length ? (
                  <Chips items={Object.keys(sp.environment ?? {})} />
                ) : (
                  ''
                ),
                optional: true,
              },
            ]}
          />
        </Section>
        <div className="space-y-6">
          <ProvidersCard gw={gw} sandbox={sandbox} />
          <ServicesCard gw={gw} sandboxRef={refOf(sandbox)} />
        </div>
      </div>

      <Section title="Conditions" flush>
        <DataTable
          data={st.conditions ?? []}
          columns={conditionColumns}
          empty="No conditions reported."
        />
      </Section>

      {!!st.endpoint_statuses?.length && (
        <Section
          title="Tool endpoints"
          description="Last observed result for each MCP endpoint in the policy."
          flush
        >
          <DataTable data={st.endpoint_statuses} columns={endpointColumns} />
        </Section>
      )}

      {gateway?.local && (
        <Section title="Containers" description="Live stats from the local Docker engine." flush>
          <ContainersTable sandbox={m.name} />
        </Section>
      )}
    </div>
  )
}
