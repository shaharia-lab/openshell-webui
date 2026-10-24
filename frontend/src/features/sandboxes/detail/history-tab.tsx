import { useState } from 'react'

import { useGwCall, usePolicyHistory } from '@/api/queries'
import { CodeEditor } from '@/components/common/code-editor'
import { columnsFor } from '@/components/common/columns'
import { DataTable } from '@/components/common/data-table'
import { DiffView } from '@/components/common/diff-view'
import { ErrorAlert } from '@/components/common/error-alert'
import { Section } from '@/components/common/page'
import { LoadingRows, QueryView } from '@/components/common/query-view'
import { RelativeTime } from '@/components/common/relative-time'
import { SimpleSelect } from '@/components/common/simple-select'
import { StatusBadge, type Tone } from '@/components/common/status-badge'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { DraftHistoryEntry, SandboxPolicyRevision } from '@/gen/openshell'
import { enumLabel, shortHash } from '@/lib/format'
import { policyToYaml, withoutProviderRules } from '@/lib/policy'
import type { SandboxRef } from '@/lib/sandbox'
import { cn } from '@/lib/utils'

const STATUS_TONE: Record<string, Tone> = {
  POLICY_STATUS_LOADED: 'success',
  POLICY_STATUS_PENDING: 'info',
  POLICY_STATUS_FAILED: 'danger',
  POLICY_STATUS_SUPERSEDED: 'neutral',
}

const col = columnsFor<SandboxPolicyRevision>()
const revisionColumns = [
  col.accessor((r) => r.version ?? 0, {
    id: 'version',
    header: 'Version',
    cell: ({ getValue }) => <span className="font-medium tabular-nums">v{getValue()}</span>,
  }),
  col.accessor((r) => enumLabel(r.status, 'POLICY_STATUS_'), {
    id: 'status',
    header: 'Status',
    cell: ({ row, getValue }) => (
      <StatusBadge tone={STATUS_TONE[row.original.status ?? ''] ?? 'neutral'}>
        {getValue()}
      </StatusBadge>
    ),
  }),
  col.accessor((r) => shortHash(r.policy_hash), {
    id: 'hash',
    header: 'Hash',
    cell: ({ getValue }) => <code className="font-mono text-xs">{getValue()}</code>,
    meta: { className: 'hidden @xl/table:table-cell' },
  }),
  col.accessor((r) => r.created_time ?? '', {
    id: 'created',
    header: 'Created',
    sortFn: 'datetime',
    cell: ({ getValue }) => <RelativeTime iso={getValue()} />,
  }),
  col.accessor((r) => r.loaded_time ?? '', {
    id: 'loaded',
    header: 'Loaded',
    cell: ({ getValue }) => <RelativeTime iso={getValue()} />,
    meta: { className: 'hidden @2xl/table:table-cell' },
  }),
  col.accessor((r) => r.load_error ?? '', {
    id: 'error',
    header: 'Error',
    cell: ({ getValue }) => <span className="text-xs text-destructive">{getValue()}</span>,
    meta: { className: 'whitespace-normal' },
  }),
]

export function HistoryTab({ gw, sandboxRef }: { gw: string; sandboxRef: SandboxRef }) {
  const history = usePolicyHistory(gw, sandboxRef.workspace, sandboxRef.name)
  const [selected, setSelected] = useState<number | null>(null)

  return (
    <div className="space-y-6">
      <Section
        title="Policy revisions"
        description="Every policy version of this sandbox. Select one to view or compare it."
        flush
      >
        <QueryView query={history}>
          {(data) => {
            const revisions = data.revisions ?? []
            const latest = Math.max(0, ...revisions.map((r) => r.version ?? 0))
            const current = selected ?? latest
            return (
              <>
                <DataTable
                  data={revisions}
                  columns={revisionColumns}
                  getRowId={(r) => String(r.version)}
                  onRowClick={(r) => setSelected(r.version ?? null)}
                  rowClassName={(r) => cn(r.version === current && 'bg-muted/60')}
                  initialSorting={[{ id: 'version', desc: true }]}
                  empty="No policy revisions."
                />
                {current > 0 && (
                  <div className="border-t p-4">
                    <RevisionViewer
                      gw={gw}
                      sandboxRef={sandboxRef}
                      version={current}
                      versions={revisions.map((r) => r.version ?? 0)}
                    />
                  </div>
                )}
              </>
            )
          }}
        </QueryView>
      </Section>
      <DraftHistory gw={gw} sandboxRef={sandboxRef} />
    </div>
  )
}

function usePolicyVersion(gw: string, ref: SandboxRef, version: number) {
  return useGwCall(
    gw,
    'GetSandboxPolicyStatus',
    ref.workspace,
    { sandbox: ref.name, version },
    {
      enabled: version > 0,
      // A revision never changes.
      staleTime: Infinity,
      refetchInterval: false,
    },
  )
}

function RevisionViewer({
  gw,
  sandboxRef,
  version,
  versions,
}: {
  gw: string
  sandboxRef: SandboxRef
  version: number
  versions: number[]
}) {
  const [mode, setMode] = useState<'view' | 'diff'>('view')
  const older = versions.filter((v) => v < version).sort((a, b) => b - a)
  const [against, setAgainst] = useState<number>(0)
  const base = against && against !== version ? against : (older[0] ?? 0)

  const rev = usePolicyVersion(gw, sandboxRef, version)
  const other = usePolicyVersion(gw, sandboxRef, mode === 'diff' ? base : 0)
  const yaml = (p?: SandboxPolicyRevision) => policyToYaml(withoutProviderRules(p?.policy))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Version {version}</span>
        <ToggleGroup
          variant="outline"
          size="sm"
          value={[mode]}
          onValueChange={(v) => v[0] && setMode(v[0] as 'view' | 'diff')}
        >
          <ToggleGroupItem value="view">View</ToggleGroupItem>
          <ToggleGroupItem value="diff" disabled={!versions.some((v) => v !== version)}>
            Compare
          </ToggleGroupItem>
        </ToggleGroup>
        {mode === 'diff' && (
          <SimpleSelect
            size="sm"
            aria-label="Compare with"
            value={String(base)}
            onValueChange={(v) => setAgainst(Number(v))}
            options={versions
              .filter((v) => v !== version)
              .sort((a, b) => b - a)
              .map((v) => ({ value: String(v), label: `with v${v}` }))}
          />
        )}
      </div>
      {rev.isError ? (
        <ErrorAlert error={rev.error} title={`Could not load v${version}`} />
      ) : !rev.data || (mode === 'diff' && !other.data && !other.isError) ? (
        <LoadingRows rows={4} />
      ) : mode === 'view' ? (
        <CodeEditor
          aria-label={`Policy v${version}`}
          value={yaml(rev.data.revision)}
          readOnly
          height="22rem"
        />
      ) : other.isError ? (
        <ErrorAlert error={other.error} title={`Could not load v${base}`} />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Changes from v{base} to v{version}. Provider rules are left out.
          </p>
          <DiffView before={yaml(other.data?.revision)} after={yaml(rev.data.revision)} />
        </>
      )}
    </div>
  )
}

const EVENT_TONE: Record<string, Tone> = {
  approved: 'success',
  rejected: 'danger',
  denial_detected: 'warning',
  undone: 'neutral',
  cleared: 'neutral',
  edited: 'info',
  analysis_cycle: 'info',
}

function DraftHistory({ gw, sandboxRef }: { gw: string; sandboxRef: SandboxRef }) {
  const history = useGwCall(gw, 'GetDraftHistory', sandboxRef.workspace, {
    sandbox: sandboxRef.name,
  })
  return (
    <Section
      title="Proposal activity"
      description="Denials, analysis and review decisions for this sandbox's proposals."
    >
      <QueryView query={history}>
        {(data) => {
          const entries: DraftHistoryEntry[] = [...(data.entries ?? [])].reverse()
          if (!entries.length)
            return <p className="text-sm text-muted-foreground">No activity yet.</p>
          return (
            <ol className="relative space-y-4 border-l pl-5">
              {entries.slice(0, 100).map((e, i) => (
                <li key={i} className="relative">
                  <span className="absolute top-1.5 -left-[1.4rem] size-2 rounded-full bg-border ring-4 ring-card" />
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={EVENT_TONE[e.event_type ?? ''] ?? 'neutral'} dot={false}>
                      {(e.event_type ?? 'event').replace(/_/g, ' ')}
                    </StatusBadge>
                    <RelativeTime iso={e.event_time} className="text-xs text-muted-foreground" />
                  </div>
                  {e.description && <p className="mt-1 text-sm">{e.description}</p>}
                </li>
              ))}
            </ol>
          )
        }}
      </QueryView>
    </Section>
  )
}
