import { BoxIcon, PlusIcon, TagIcon, XIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { CreateSandboxDialog } from './create-sandbox-dialog'
import { labelPairs, matchesFilters, parseSelector, type SandboxFilters } from './sandbox-filters'
import { SandboxActionsMenu } from './sandbox-actions-menu'
import { useSandboxes } from '@/api/queries'
import { Chips } from '@/components/common/chips'
import { columnsFor } from '@/components/common/columns'
import { DataTable } from '@/components/common/data-table'
import { EmptyState } from '@/components/common/empty-state'
import { PageHeader } from '@/components/common/page'
import { PhaseBadge } from '@/components/common/phase-badge'
import { QueryView } from '@/components/common/query-view'
import { RelativeTime } from '@/components/common/relative-time'
import { SearchInput } from '@/components/common/search-input'
import { SimpleSelect } from '@/components/common/simple-select'
import { WriteButton } from '@/components/common/write-button'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { SandboxPhase, type Sandbox } from '@/gen/openshell'
import { useScope } from '@/hooks/use-scope'
import { phaseLabel, sandboxHref, sandboxPhase } from '@/lib/sandbox'
import { useDocumentTitle } from '@/hooks/use-document-title'

const col = columnsFor<Sandbox>()

const FILTER_KEYS = ['q', 'phase', 'provider', 'labels'] as const

const PHASE_OPTIONS = [
  { value: '', label: 'Any phase' },
  ...Object.values(SandboxPhase)
    .filter((p) => p !== 'SANDBOX_PHASE_UNSPECIFIED')
    .map((p) => ({ value: p, label: phaseLabel(p) })),
]

export default function SandboxesPage() {
  useDocumentTitle('Sandboxes')
  const { gw, ws, allWorkspaces } = useScope()
  const query = useSandboxes(gw, ws)
  // Filters live in the URL, so a filtered view can be bookmarked or shared.
  const [params, setParams] = useSearchParams()
  const filter = params.get('q') ?? ''
  const filters: SandboxFilters = {
    phase: params.get('phase') ?? '',
    provider: params.get('provider') ?? '',
    labels: params.get('labels') ?? '',
  }
  const setFilter = (key: (typeof FILTER_KEYS)[number], value: string) =>
    setParams(
      (p) => {
        if (value) p.set(key, value)
        else p.delete(key)
        return p
      },
      { replace: true },
    )
  const active = FILTER_KEYS.some((k) => params.get(k))
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()

  const columns = useMemo(
    () => [
      col.accessor((s) => s.metadata?.name ?? '', {
        id: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <Link to={sandboxHref(row.original)} className="font-medium hover:underline">
            {row.original.metadata?.name}
          </Link>
        ),
      }),
      col.accessor((s) => phaseLabel(sandboxPhase(s)), {
        id: 'phase',
        header: 'Phase',
        cell: ({ row }) => <PhaseBadge phase={sandboxPhase(row.original)} />,
      }),
      ...(allWorkspaces
        ? [
            col.accessor((s) => s.metadata?.workspace ?? '', {
              id: 'workspace',
              header: 'Workspace',
            }),
          ]
        : []),
      col.accessor((s) => s.spec?.template?.image ?? '', {
        id: 'image',
        header: 'Image',
        cell: ({ getValue }) => (
          <span className="font-mono text-xs break-all">
            {getValue() || <span className="text-muted-foreground">default</span>}
          </span>
        ),
        meta: { className: 'hidden lg:table-cell' },
      }),
      col.accessor((s) => (s.spec?.providers ?? []).join(' '), {
        id: 'providers',
        header: 'Providers',
        cell: ({ row }) => <Chips items={row.original.spec?.providers} />,
        meta: { className: 'hidden md:table-cell' },
      }),
      col.accessor((s) => labelPairs(s).join(' '), {
        id: 'labels',
        header: 'Labels',
        enableSorting: false,
        cell: ({ row }) => <Chips items={labelPairs(row.original)} />,
        meta: { className: 'hidden xl:table-cell' },
      }),
      col.accessor((s) => s.status?.current_policy_version ?? 0, {
        id: 'policy',
        header: 'Policy',
        cell: ({ getValue }) => <span className="tabular-nums">v{getValue()}</span>,
        meta: { className: 'hidden sm:table-cell' },
      }),
      col.accessor((s) => s.metadata?.created_time ?? '', {
        id: 'created',
        header: 'Created',
        sortFn: 'datetime',
        cell: ({ getValue }) => <RelativeTime iso={getValue()} className="text-muted-foreground" />,
        meta: { className: 'hidden sm:table-cell' },
      }),
      col.display({
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => <SandboxActionsMenu gw={gw} sandbox={row.original} />,
        meta: { className: 'w-10 text-right' },
      }),
    ],
    [gw, allWorkspaces],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sandboxes"
        description={`Isolated environments on ${gw}${allWorkspaces ? ', in every workspace' : `, in workspace ${ws}`}.`}
        actions={
          <WriteButton onClick={() => setCreating(true)}>
            <PlusIcon /> New sandbox
          </WriteButton>
        }
      />
      <QueryView query={query}>
        {(data) => {
          const all = data.sandboxes ?? []
          if (!all.length) return <NoSandboxes onCreate={() => setCreating(true)} />
          let terms: ReturnType<typeof parseSelector> = []
          let selectorError = ''
          try {
            terms = parseSelector(filters.labels)
          } catch (e) {
            selectorError = (e as Error).message
          }
          const rows = selectorError ? [] : all.filter((s) => matchesFilters(s, filters, terms))
          const providers = [...new Set(all.flatMap((s) => s.spec?.providers ?? []))].sort()
          return (
            <Card className="gap-0 py-0">
              <div className="flex flex-wrap items-center gap-2 border-b p-3">
                <SearchInput
                  value={filter}
                  onChange={(v) => setFilter('q', v)}
                  placeholder="Filter sandboxes"
                />
                <SimpleSelect
                  aria-label="Phase"
                  value={filters.phase}
                  onValueChange={(v) => setFilter('phase', v)}
                  options={PHASE_OPTIONS}
                />
                <SimpleSelect
                  aria-label="Provider"
                  value={filters.provider}
                  onValueChange={(v) => setFilter('provider', v)}
                  options={[
                    { value: '', label: 'Any provider' },
                    ...providers.map((p) => ({ value: p, label: p })),
                  ]}
                />
                <InputGroup className="w-full sm:w-64">
                  <InputGroupAddon>
                    <TagIcon />
                  </InputGroupAddon>
                  <InputGroupInput
                    aria-label="Label selector"
                    aria-invalid={!!selectorError || undefined}
                    title={selectorError || 'Labels, as in the CLI: key=value,key2=value2'}
                    placeholder="team=ml,env=dev"
                    value={filters.labels}
                    onChange={(e) => setFilter('labels', e.target.value)}
                    className="font-mono text-xs"
                    spellCheck={false}
                  />
                </InputGroup>
                {active && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setParams(new URLSearchParams(), { replace: true })}
                  >
                    <XIcon /> Clear
                  </Button>
                )}
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                  {selectorError ||
                    (rows.length === all.length
                      ? `${all.length} sandboxes`
                      : `${rows.length} of ${all.length}`)}
                </span>
              </div>
              <DataTable
                data={rows}
                columns={columns}
                filter={filter}
                getRowId={(s) => s.metadata?.id ?? s.metadata?.name ?? ''}
                onRowClick={(s) => navigate(sandboxHref(s))}
                initialSorting={[{ id: 'name', desc: false }]}
              />
            </Card>
          )
        }}
      </QueryView>
      <CreateSandboxDialog open={creating} onOpenChange={setCreating} />
    </div>
  )
}

function NoSandboxes({ onCreate }: { onCreate: () => void }) {
  return (
    <Card>
      <EmptyState
        icon={<BoxIcon />}
        title="No sandboxes yet"
        description="A sandbox runs an agent or tool in an isolated container with a network policy you control."
        action={
          <WriteButton onClick={onCreate}>
            <PlusIcon /> Create a sandbox
          </WriteButton>
        }
      />
    </Card>
  )
}
