import {
  BoxIcon,
  ContainerIcon,
  FileBadgeIcon,
  GlobeIcon,
  KeyRoundIcon,
  LayersIcon,
  PlusIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { ContainersTable } from './containers-table'
import { GatewaysTable } from './gateways-table'
import {
  useContainers,
  useProfiles,
  useProviders,
  useSandboxes,
  useServices,
  useWorkspaces,
} from '@/api/queries'
import { EmptyState } from '@/components/common/empty-state'
import { PageHeader, Section } from '@/components/common/page'
import { PhaseBadge } from '@/components/common/phase-badge'
import { QueryView } from '@/components/common/query-view'
import { RelativeTime } from '@/components/common/relative-time'
import { StatCard } from '@/components/common/stat-card'
import { WriteButton } from '@/components/common/write-button'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { CreateSandboxDialog } from '@/features/sandboxes/create-sandbox-dialog'
import { useScope } from '@/hooks/use-scope'
import { isReady, sandboxHref, sandboxPhase } from '@/lib/sandbox'
import { useDocumentTitle } from '@/hooks/use-document-title'

const count = (n: number | undefined, isError: boolean) => (isError ? '—' : (n ?? 0))

export default function OverviewPage() {
  useDocumentTitle('Overview')
  const { gw, ws, gateway, allWorkspaces } = useScope()
  const sandboxes = useSandboxes(gw, ws)
  const providers = useProviders(gw, ws)
  const profiles = useProfiles(gw, ws)
  const services = useServices(gw, ws)
  const workspaces = useWorkspaces(gw)
  const containers = useContainers(!!gateway?.local)
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)

  const list = sandboxes.data?.sandboxes ?? []
  const recent = [...list]
    .sort((a, b) => (b.metadata?.created_time ?? '').localeCompare(a.metadata?.created_time ?? ''))
    .slice(0, 6)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description={`Gateway ${gw}${allWorkspaces ? ', all workspaces' : `, workspace ${ws}`}.`}
        actions={
          <WriteButton onClick={() => setCreating(true)}>
            <PlusIcon /> New sandbox
          </WriteButton>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Sandboxes"
          icon={BoxIcon}
          to="/sandboxes"
          loading={sandboxes.isPending}
          value={count(list.length, sandboxes.isError)}
          hint={`${list.filter(isReady).length} ready`}
        />
        <StatCard
          label="Providers"
          icon={KeyRoundIcon}
          to="/providers"
          loading={providers.isPending}
          value={count(providers.data?.providers?.length, providers.isError)}
          hint="credential sets"
        />
        <StatCard
          label="Profiles"
          icon={FileBadgeIcon}
          to="/profiles"
          loading={profiles.isPending}
          value={count(profiles.data?.profiles?.length, profiles.isError)}
          hint="provider types"
        />
        <StatCard
          label="Services"
          icon={GlobeIcon}
          to="/services"
          loading={services.isPending}
          value={count(services.data?.services?.length, services.isError)}
          hint="exposed endpoints"
        />
        <StatCard
          label="Workspaces"
          icon={LayersIcon}
          to="/workspaces"
          loading={workspaces.isPending}
          value={count(workspaces.data?.workspaces?.length, workspaces.isError)}
          hint={allWorkspaces ? 'showing all' : `showing ${ws}`}
        />
        <StatCard
          label="Containers"
          icon={ContainerIcon}
          loading={!!gateway?.local && containers.isPending}
          value={gateway?.local ? count(containers.data?.length, containers.isError) : '—'}
          hint={
            gateway?.local
              ? `${(containers.data ?? []).filter((c) => c.state === 'running').length} running`
              : 'local gateway only'
          }
        />
      </div>

      <Section
        title="Recent sandboxes"
        flush
        actions={
          <Button size="sm" variant="ghost" render={<Link to="/sandboxes" />} nativeButton={false}>
            View all
          </Button>
        }
      >
        <QueryView query={sandboxes}>
          {() =>
            recent.length ? (
              <Table>
                <TableBody>
                  {recent.map((s) => (
                    <TableRow
                      key={s.metadata?.id}
                      className="cursor-pointer"
                      onClick={() => navigate(sandboxHref(s))}
                    >
                      <TableCell className="px-4 font-medium">
                        <Link to={sandboxHref(s)} className="hover:underline">
                          {s.metadata?.name}
                        </Link>
                        {allWorkspaces && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {s.metadata?.workspace}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="px-4">
                        <PhaseBadge phase={sandboxPhase(s)} />
                      </TableCell>
                      <TableCell className="hidden px-4 font-mono text-xs text-muted-foreground md:table-cell">
                        {s.spec?.template?.image}
                      </TableCell>
                      <TableCell className="px-4 text-right text-muted-foreground">
                        <RelativeTime iso={s.metadata?.created_time} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                icon={<BoxIcon />}
                title="No sandboxes yet"
                description="Create one to run an agent in isolation."
              />
            )
          }
        </QueryView>
      </Section>

      <Section
        title="Gateways"
        description="Every gateway registered in the OpenShell CLI. Click one to switch to it."
        flush
      >
        <GatewaysTable />
      </Section>

      {gateway?.local && (
        <Section
          title="Local containers"
          description="OpenShell-managed containers on this machine's Docker engine."
          flush
        >
          <ContainersTable />
        </Section>
      )}

      <CreateSandboxDialog open={creating} onOpenChange={setCreating} />
    </div>
  )
}
