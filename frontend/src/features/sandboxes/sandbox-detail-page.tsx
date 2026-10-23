import {
  BoxIcon,
  FolderIcon,
  PlayIcon,
  SquareIcon,
  SquareTerminalIcon,
  Trash2Icon,
} from 'lucide-react'
import { lazy, Suspense } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { HistoryTab } from './detail/history-tab'
import { OverviewTab } from './detail/overview-tab'
import { PolicyTab } from './detail/policy-tab'
import { ProposalsTab } from './detail/proposals-tab'
import { usePendingProposals } from './detail/use-draft'
import { useSandboxActions } from './use-sandbox-actions'
import { useSandbox } from '@/api/queries'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorAlert } from '@/components/common/error-alert'
import { PageHeader } from '@/components/common/page'
import { PhaseBadge } from '@/components/common/phase-badge'
import { LoadingRows } from '@/components/common/query-view'
import { WriteButton } from '@/components/common/write-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FilesBrowser } from '@/features/files/files-browser'
import { LogViewer } from '@/features/logs/log-viewer'
import { useScope } from '@/hooks/use-scope'
import {
  canStart,
  canStop,
  isReady,
  sandboxHref,
  sandboxPhase,
  type SandboxRef,
} from '@/lib/sandbox'
import { useDocumentTitle } from '@/hooks/use-document-title'

// xterm is large; load it only when the terminal tab opens.
const TerminalTab = lazy(() => import('./detail/terminal-tab'))

const TABS = ['overview', 'policy', 'proposals', 'logs', 'terminal', 'files', 'history'] as const
type Tab = (typeof TABS)[number]

export default function SandboxDetailPage() {
  const params = useParams()
  const ref: SandboxRef = { workspace: params.workspace ?? 'default', name: params.name ?? '' }
  const tab: Tab = TABS.includes(params.tab as Tab) ? (params.tab as Tab) : 'overview'
  const { gw } = useScope()
  const navigate = useNavigate()
  const query = useSandbox(gw, ref.workspace, ref.name)
  const actions = useSandboxActions(gw)
  const pending = usePendingProposals(gw, ref)
  const sandbox = query.data?.sandbox
  useDocumentTitle(ref.name, tab !== 'overview' && tab.charAt(0).toUpperCase() + tab.slice(1))

  if (query.isError && !sandbox) {
    return query.error && 'isNotFound' in query.error && query.error.isNotFound ? (
      <EmptyState
        icon={<BoxIcon />}
        title={`Sandbox ${ref.name} not found`}
        description={`There is no sandbox ${ref.name} in workspace ${ref.workspace} on ${gw}. It may have been deleted.`}
        action={
          <Button variant="outline" render={<Link to="/sandboxes" />} nativeButton={false}>
            Back to sandboxes
          </Button>
        }
      />
    ) : (
      <ErrorAlert
        error={query.error}
        title={`Could not load ${ref.name}`}
        onRetry={() => query.refetch()}
      />
    )
  }

  const phase = sandboxPhase(sandbox)
  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/sandboxes" />}>Sandboxes</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{ref.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader
        title={
          <>
            {ref.name}
            {sandbox && <PhaseBadge phase={phase} />}
            <Badge variant="outline" className="font-normal text-muted-foreground">
              {ref.workspace}
            </Badge>
          </>
        }
        description={
          sandbox?.spec?.template?.image ?? (query.isPending ? 'Loading…' : 'Gateway default image')
        }
        actions={
          sandbox && (
            <>
              <WriteButton
                variant="outline"
                disabledReason={isReady(sandbox) ? undefined : 'The sandbox must be ready.'}
                onClick={() => navigate(sandboxHref(ref, 'terminal'))}
              >
                <SquareTerminalIcon /> Terminal
              </WriteButton>
              {canStart(sandbox) ? (
                <WriteButton
                  variant="outline"
                  onClick={() => actions.start(ref)}
                  disabled={actions.starting}
                >
                  <PlayIcon /> Start
                </WriteButton>
              ) : (
                <WriteButton
                  variant="outline"
                  disabledReason={
                    canStop(sandbox) ? undefined : 'Only a running sandbox can be stopped.'
                  }
                  onClick={() => actions.stop(ref)}
                >
                  <SquareIcon /> Stop
                </WriteButton>
              )}
              <WriteButton
                variant="destructive"
                onClick={() => actions.remove(ref, () => navigate('/sandboxes'))}
              >
                <Trash2Icon /> Delete
              </WriteButton>
            </>
          )
        }
      />

      {!sandbox ? (
        <LoadingRows rows={6} />
      ) : (
        <Tabs
          value={tab}
          onValueChange={(t) =>
            navigate(sandboxHref(ref, t === 'overview' ? undefined : String(t)))
          }
        >
          <div className="overflow-x-auto overflow-y-hidden border-b">
            <TabsList variant="line">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="policy">Policy</TabsTrigger>
              <TabsTrigger value="proposals">
                Proposals
                {pending > 0 && (
                  <Badge className="ml-1 h-4 min-w-4 rounded-full px-1 text-[10px] tabular-nums">
                    {pending}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="logs">Logs</TabsTrigger>
              <TabsTrigger value="terminal">Terminal</TabsTrigger>
              <TabsTrigger value="files">Files</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="overview" className="pt-4">
            <OverviewTab gw={gw} sandbox={sandbox} />
          </TabsContent>
          <TabsContent value="policy" className="pt-4">
            <PolicyTab gw={gw} sandboxRef={ref} />
          </TabsContent>
          <TabsContent value="proposals" className="pt-4">
            <ProposalsTab gw={gw} sandboxRef={ref} />
          </TabsContent>
          <TabsContent value="logs" className="pt-4">
            <LogViewer gw={gw} sandboxRef={ref} />
          </TabsContent>
          <TabsContent value="terminal" className="pt-4">
            <Suspense fallback={<LoadingRows rows={8} />}>
              <TerminalTab gw={gw} sandbox={sandbox} />
            </Suspense>
          </TabsContent>
          <TabsContent value="files" className="pt-4">
            {isReady(sandbox) ? (
              <FilesBrowser gw={gw} sandboxRef={ref} />
            ) : (
              <EmptyState
                icon={<FolderIcon />}
                title="Files unavailable"
                description="The sandbox must be ready to browse its files."
              />
            )}
          </TabsContent>
          <TabsContent value="history" className="pt-4">
            <HistoryTab gw={gw} sandboxRef={ref} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
