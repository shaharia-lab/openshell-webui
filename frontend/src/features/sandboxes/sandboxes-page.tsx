import { BoxIcon, PlayIcon, PlusIcon, SquareIcon, TagIcon, Trash2Icon, XIcon } from 'lucide-react'
import { createContext, use, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { useBulkSandboxActions } from './bulk-actions'
import { CreateSandboxDialog } from './create-sandbox-dialog'
import {
  labelPairs,
  matchesFilters,
  matchesText,
  parseSelector,
  type SandboxFilters,
} from './sandbox-filters'
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
import { ImageRef } from '@/components/common/truncated-text'
import { WriteButton } from '@/components/common/write-button'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { SandboxPhase, type Sandbox } from '@/gen/openshell'
import { useScope } from '@/hooks/use-scope'
import {
  canStart,
  canStop,
  phaseLabel,
  refOf,
  sandboxHref,
  sandboxPhase,
  type SandboxRef,
} from '@/lib/sandbox'
import { useDocumentTitle } from '@/hooks/use-document-title'

const col = columnsFor<Sandbox>()

const FILTER_KEYS = ['q', 'phase', 'provider', 'labels'] as const

const keyOf = (r: SandboxRef) => `${r.workspace}/${r.name}`

/**
 * The row selection, read by the checkbox cells. A context keeps the column
 * definitions stable; columns that change on every click would remount the
 * cells, and an open row menu would close on each refresh.
 */
interface Selection {
  shown: Sandbox[]
  isSelected: (s: Sandbox) => boolean
  toggle: (refs: SandboxRef[], on: boolean) => void
}
const SelectionContext = createContext<Selection | null>(null)

function SelectAllCheckbox() {
  const sel = use(SelectionContext)!
  const all = sel.shown.length > 0 && sel.shown.every(sel.isSelected)
  return (
    <Checkbox
      aria-label="Select all shown sandboxes"
      checked={all}
      indeterminate={!all && sel.shown.some(sel.isSelected)}
      onCheckedChange={(on) => sel.toggle(sel.shown.map(refOf), !!on)}
    />
  )
}

function RowCheckbox({ sandbox }: { sandbox: Sandbox }) {
  const sel = use(SelectionContext)!
  return (
    <Checkbox
      aria-label={`Select ${sandbox.metadata?.name}`}
      checked={sel.isSelected(sandbox)}
      onCheckedChange={(on) => sel.toggle([refOf(sandbox)], !!on)}
    />
  )
}

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
  const bulk = useBulkSandboxActions(gw)
  // Selected sandboxes by workspace/name; rows that disappear simply drop out.
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const all = useMemo(() => query.data?.sandboxes ?? [], [query.data])
  let terms: ReturnType<typeof parseSelector> = []
  let selectorError = ''
  try {
    terms = parseSelector(filters.labels)
  } catch (e) {
    selectorError = (e as Error).message
  }
  const rows = selectorError
    ? []
    : all.filter((s) => matchesFilters(s, filters, terms) && matchesText(s, filter))
  const isSelected = (s: Sandbox) => selected.has(keyOf(refOf(s)))
  const picked = all.filter(isSelected)
  const toggle = (refs: SandboxRef[], on: boolean) =>
    setSelected((cur) => {
      const next = new Set(cur)
      for (const r of refs) {
        if (on) next.add(keyOf(r))
        else next.delete(keyOf(r))
      }
      return next
    })
  const clearSelection = () => setSelected(new Set())

  const columns = useMemo(
    () => [
      col.display({
        id: 'select',
        header: () => <SelectAllCheckbox />,
        cell: ({ row }) => <RowCheckbox sandbox={row.original} />,
        meta: { className: 'w-8 pr-0' },
      }),
      // Labels sit under the name: no extra column, and the text filter finds them.
      col.accessor((s) => [s.metadata?.name ?? '', ...labelPairs(s)].join(' '), {
        id: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <div className="space-y-1">
            <Link to={sandboxHref(row.original)} className="font-medium hover:underline">
              {row.original.metadata?.name}
            </Link>
            <Chips items={labelPairs(row.original)} limit={3} empty="" />
          </div>
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
        cell: ({ getValue }) => <ImageRef image={getValue()} />,
        meta: { className: 'hidden @3xl/table:table-cell' },
      }),
      col.accessor((s) => (s.spec?.providers ?? []).join(' '), {
        id: 'providers',
        header: 'Providers',
        cell: ({ row }) => <Chips items={row.original.spec?.providers} limit={3} />,
        meta: { className: 'hidden @xl/table:table-cell' },
      }),
      col.accessor((s) => s.status?.current_policy_version ?? 0, {
        id: 'policy',
        header: 'Policy',
        cell: ({ getValue }) => <span className="tabular-nums">v{getValue()}</span>,
        meta: { className: 'hidden @xl/table:table-cell' },
      }),
      col.accessor((s) => s.metadata?.created_time ?? '', {
        id: 'created',
        header: 'Created',
        sortFn: 'datetime',
        cell: ({ getValue }) => <RelativeTime iso={getValue()} className="text-muted-foreground" />,
        meta: { className: 'hidden @lg/table:table-cell' },
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
        {() => {
          if (!all.length) return <NoSandboxes onCreate={() => setCreating(true)} />
          const providers = [...new Set(all.flatMap((s) => s.spec?.providers ?? []))].sort()
          return (
            <Card className="gap-0 py-0">
              {picked.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 p-3">
                  <span className="text-sm font-medium">{picked.length} selected</span>
                  <WriteButton
                    variant="outline"
                    size="sm"
                    disabledReason={picked.some(canStart) ? undefined : 'None of them is stopped.'}
                    onClick={() => void bulk.start(picked.filter(canStart).map(refOf))}
                  >
                    <PlayIcon /> Start
                  </WriteButton>
                  <WriteButton
                    variant="outline"
                    size="sm"
                    disabledReason={picked.some(canStop) ? undefined : 'None of them is running.'}
                    onClick={() => bulk.stop(picked.filter(canStop).map(refOf), clearSelection)}
                  >
                    <SquareIcon /> Stop
                  </WriteButton>
                  <WriteButton
                    variant="destructive"
                    size="sm"
                    onClick={() => bulk.remove(picked.map(refOf), clearSelection)}
                  >
                    <Trash2Icon /> Delete
                  </WriteButton>
                  <Button variant="ghost" size="sm" className="ml-auto" onClick={clearSelection}>
                    <XIcon /> Clear selection
                  </Button>
                </div>
              ) : (
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
              )}
              <SelectionContext value={{ shown: rows, isSelected, toggle }}>
                <DataTable
                  data={rows}
                  columns={columns}
                  empty="No sandboxes match the filters."
                  getRowId={(s) => s.metadata?.id ?? s.metadata?.name ?? ''}
                  onRowClick={(s) => navigate(sandboxHref(s))}
                  rowClassName={(s) => (isSelected(s) ? 'bg-muted/50' : undefined)}
                  initialSorting={[{ id: 'name', desc: false }]}
                />
              </SelectionContext>
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
