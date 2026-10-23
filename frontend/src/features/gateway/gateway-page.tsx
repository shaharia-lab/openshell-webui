import { useCallback } from 'react'
import { useNavigate, useParams } from 'react-router'

import { AuditLog } from './audit-log'
import { GatewayLog } from './gateway-log'
import { useRpc } from '@/api/mutations'
import { useGatewayInfo, useGwCall, useHealth, useWhoami } from '@/api/queries'
import { Chips } from '@/components/common/chips'
import { columnsFor } from '@/components/common/columns'
import { DataTable } from '@/components/common/data-table'
import { EmptyState } from '@/components/common/empty-state'
import { JsonView } from '@/components/common/json-view'
import { KeyValueList } from '@/components/common/key-value-list'
import { PageHeader, Section } from '@/components/common/page'
import { QueryView } from '@/components/common/query-view'
import { StatusBadge } from '@/components/common/status-badge'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SettingsTable } from '@/features/policy/settings-table'
import type { ComputeDriverInfo, NegotiatedExtensionInfo } from '@/gen/openshell'
import { useScope } from '@/hooks/use-scope'
import { enumLabel } from '@/lib/format'
import { ServerOffIcon } from 'lucide-react'
import { useDocumentTitle } from '@/hooks/use-document-title'

const TABS = ['overview', 'settings', 'log', 'audit'] as const
type Tab = (typeof TABS)[number]
const TAB_TITLES: Record<Tab, string | undefined> = {
  overview: undefined,
  settings: 'Settings',
  log: 'Service log',
  audit: 'Audit log',
}

const driverCol = columnsFor<ComputeDriverInfo>()
const driverColumns = [
  driverCol.accessor((d) => d.name ?? '', {
    id: 'name',
    header: 'Driver',
    cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
  }),
  driverCol.accessor((d) => d.capabilities?.driver_version ?? '', {
    id: 'version',
    header: 'Version',
  }),
  driverCol.accessor(
    (d) => {
      const r = d.capabilities?.resource_capabilities
      return [
        r?.cpu?.limit_supported && 'CPU limits',
        r?.memory?.limit_supported && 'memory limits',
        (r?.gpu?.default_selection_supported || r?.gpu?.count_selection_supported) && 'GPUs',
      ]
        .filter(Boolean)
        .join(', ')
    },
    { id: 'caps', header: 'Supports' },
  ),
]

const extCol = columnsFor<NegotiatedExtensionInfo>()
const extColumns = [
  extCol.accessor((x) => x.configured_name || x.implementation_name || '', {
    id: 'name',
    header: 'Extension',
    cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
  }),
  extCol.accessor((x) => enumLabel(x.kind, 'EXTENSION_KIND_'), { id: 'kind', header: 'Kind' }),
  extCol.accessor(
    (x) =>
      `${x.implementation_version ?? ''} (protocol ${x.protocol_major ?? 0}.${x.protocol_minor ?? 0})`,
    { id: 'version', header: 'Version', meta: { className: 'hidden md:table-cell' } },
  ),
  extCol.accessor((x) => (x.supported_capabilities ?? []).join(' '), {
    id: 'caps',
    header: 'Capabilities',
    cell: ({ row }) => <Chips items={row.original.supported_capabilities} />,
    meta: { className: 'hidden lg:table-cell whitespace-normal' },
  }),
]

export default function GatewayPage() {
  const { gw, gateway } = useScope()
  const params = useParams()
  const navigate = useNavigate()
  const tab: Tab = TABS.includes(params.tab as Tab) ? (params.tab as Tab) : 'overview'
  useDocumentTitle(TAB_TITLES[tab], `Gateway ${gw}`)

  return (
    <div className="space-y-6">
      <PageHeader title={`Gateway ${gw}`} description={gateway?.endpoint} />
      <Tabs
        value={tab}
        onValueChange={(t) => navigate(t === 'overview' ? '/gateway' : `/gateway/${t}`)}
      >
        <div className="overflow-x-auto overflow-y-hidden border-b">
          <TabsList variant="line">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="log">Service log</TabsTrigger>
            <TabsTrigger value="audit">Audit log</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="overview" className="pt-4">
          <GatewayOverview />
        </TabsContent>
        <TabsContent value="settings" className="pt-4">
          <GatewaySettings />
        </TabsContent>
        <TabsContent value="log" className="pt-4">
          {gateway?.local ? (
            <GatewayLog />
          ) : (
            <Card>
              <EmptyState
                icon={<ServerOffIcon />}
                title="Remote gateway"
                description="The service log is only available for a gateway on this machine."
              />
            </Card>
          )}
        </TabsContent>
        <TabsContent value="audit" className="pt-4">
          <AuditLog />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function GatewayOverview() {
  const { gw, gateway: g } = useScope()
  const health = useHealth(gw)
  const who = useWhoami(gw)
  const info = useGatewayInfo(gw)
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Connection">
          <KeyValueList
            items={[
              { label: 'Endpoint', value: g?.endpoint, mono: true },
              { label: 'Auth mode', value: g?.auth_mode },
              { label: 'Location', value: g?.local ? 'This machine' : 'Remote' },
              { label: 'Remote host', value: g?.remote_host, optional: true },
              { label: 'OIDC issuer', value: g?.oidc_issuer, mono: true, optional: true },
              { label: 'Active in CLI', value: g?.active ? 'Yes' : 'No' },
              {
                label: 'Health',
                value: health.isError ? (
                  <StatusBadge tone="danger">{health.error.message}</StatusBadge>
                ) : (
                  health.data && (
                    <StatusBadge
                      tone={health.data.status === 'SERVICE_STATUS_HEALTHY' ? 'success' : 'warning'}
                    >
                      {enumLabel(health.data.status, 'SERVICE_STATUS_')}
                    </StatusBadge>
                  )
                ),
              },
              { label: 'Version', value: info.data?.gateway_version ?? health.data?.version },
            ]}
          />
        </Section>
        <Section
          title="Your identity"
          description="Who the gateway thinks you are, from the CLI's credentials."
        >
          <QueryView query={who}>
            {(w) => (
              <KeyValueList
                items={[
                  { label: 'Subject', value: w.subject, mono: true },
                  { label: 'Name', value: w.display_name },
                  { label: 'Identity provider', value: w.identity_provider },
                  { label: 'Roles', value: <Chips items={w.roles} /> },
                  { label: 'Scopes', value: <Chips items={w.scopes} /> },
                ]}
              />
            )}
          </QueryView>
        </Section>
      </div>
      <Section title="Compute drivers" flush>
        <QueryView query={info}>
          {(data) => (
            <DataTable
              data={data.compute_drivers ?? []}
              columns={driverColumns}
              empty="No drivers reported."
            />
          )}
        </QueryView>
      </Section>
      <Section title="Extensions" description="Negotiated at gateway startup." flush>
        <QueryView query={info}>
          {(data) => (
            <DataTable data={data.extensions ?? []} columns={extColumns} empty="No extensions." />
          )}
        </QueryView>
      </Section>
      {info.data && <JsonView value={info.data} label="Gateway info as JSON" />}
    </div>
  )
}

function GatewaySettings() {
  const { gw } = useScope()
  const config = useGwCall(gw, 'GetGatewayConfig', 'default', {})
  const { mutateAsync } = useRpc(gw, 'UpdateConfig', {
    toastErrors: false,
    success: (_, v) => `${v.body.setting_key} saved for every sandbox.`,
  })
  const clear = useCallback(
    (key: string) =>
      mutateAsync({
        ws: 'default',
        body: { global: true, setting_key: key, delete_setting: true },
      }),
    [mutateAsync],
  )
  return (
    <Section
      title="Global settings"
      description="Apply to every sandbox on this gateway unless a sandbox sets its own value."
      flush
    >
      <QueryView query={config}>
        {(data) => (
          <SettingsTable
            rows={Object.entries(data.settings ?? {})
              .map(([key, value]) => ({ key, value }))
              .sort((a, b) => a.key.localeCompare(b.key))}
            onSave={(key, value) =>
              mutateAsync({
                ws: 'default',
                body: { global: true, setting_key: key, setting_value: value },
              })
            }
            onDelete={clear}
            empty="No settings registered."
          />
        )}
      </QueryView>
    </Section>
  )
}
