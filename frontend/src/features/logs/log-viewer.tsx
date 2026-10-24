import { useVirtualizer } from '@tanstack/react-virtual'
import { ChevronRightIcon, RadioIcon } from 'lucide-react'
import { useDeferredValue, useMemo, useRef, useState, type ReactNode } from 'react'

import { useLogStream } from './use-log-stream'
import { useSandboxLogs, type LogParams } from '@/api/queries'
import { ErrorAlert } from '@/components/common/error-alert'
import { LoadingRows } from '@/components/common/query-view'
import { SearchInput } from '@/components/common/search-input'
import { SimpleSelect } from '@/components/common/simple-select'
import { StatusBadge } from '@/components/common/status-badge'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { SandboxLogLine } from '@/gen/openshell'
import { formatClock, formatDateTime } from '@/lib/format'
import type { SandboxRef } from '@/lib/sandbox'
import { cn } from '@/lib/utils'

const SOURCES = [
  { value: 'all', label: 'All sources' },
  { value: 'sandbox', label: 'Sandbox' },
  { value: 'gateway', label: 'Gateway' },
] as const
const LEVELS = [
  { value: '', label: 'Info and up' },
  { value: 'warn', label: 'Warn and up' },
  { value: 'error', label: 'Errors' },
  { value: 'debug', label: 'Debug and up' },
  { value: 'trace', label: 'Everything' },
]
const SINCE = [
  { value: '', label: 'Any time' },
  { value: '5m', label: 'Last 5 min' },
  { value: '30m', label: 'Last 30 min' },
  { value: '1h', label: 'Last hour' },
  { value: '24h', label: 'Last day' },
]
const LINES = ['200', '500', '1000', '5000'].map((n) => ({ value: n, label: `${n} lines` }))

/** Stable identity of a line while newer lines arrive above it. */
const lineId = (l: SandboxLogLine) => `${l.event_time}|${l.source}|${l.target}|${l.message}`
// OCSF shorthand: DENIED for refused connections and requests, BLOCKED for findings.
const isDenied = (l: SandboxLogLine) => /\b(DENIED|BLOCKED)\b/.test(l.message ?? '')
const isAllowed = (l: SandboxLogLine) => /\bALLOWED\b/.test(l.message ?? '')

const levelClass: Record<string, string> = {
  ERROR: 'text-red-600 dark:text-red-400 font-semibold',
  WARN: 'text-amber-600 dark:text-amber-400 font-semibold',
  OCSF: 'text-sky-600 dark:text-sky-400',
  DEBUG: 'text-muted-foreground',
  TRACE: 'text-muted-foreground',
}

/** Highlights ALLOWED, DENIED and BLOCKED in a log message. */
function Message({ text }: { text: string }) {
  const parts = text.split(/\b(ALLOWED|DENIED|BLOCKED)\b/)
  return (
    <>
      {parts.map((p, i) =>
        p === 'ALLOWED' ? (
          <span key={i} className="font-semibold text-emerald-600 dark:text-emerald-400">
            ALLOWED
          </span>
        ) : p === 'DENIED' || p === 'BLOCKED' ? (
          <span key={i} className="font-semibold text-red-600 dark:text-red-400">
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </>
  )
}

interface LogViewerProps {
  gw: string
  sandboxRef: SandboxRef
  /** Extra controls on the left of the toolbar (the Logs page's sandbox picker). */
  toolbarStart?: ReactNode
}

export function LogViewer({ gw, sandboxRef, toolbarStart }: LogViewerProps) {
  const [source, setSource] = useState<NonNullable<LogParams['source']>>('all')
  const [level, setLevel] = useState('')
  const [since, setSince] = useState('')
  const [n, setN] = useState('500')
  const [text, setText] = useState('')
  const [deniedOnly, setDeniedOnly] = useState(false)
  const [follow, setFollow] = useState(false)
  const params: LogParams = {
    n: Number(n),
    source,
    level: level || undefined,
    since: since || undefined,
  }

  const stream = useLogStream(gw, sandboxRef, params, follow)
  // Poll when not following, or when the backend has no stream endpoint.
  const polling = !follow || stream.status === 'unavailable'
  const query = useSandboxLogs(gw, sandboxRef.workspace, sandboxRef.name, params, {
    enabled: polling,
  })
  const all = useMemo(
    () => (polling ? (query.data?.logs ?? []) : stream.lines),
    [polling, query.data, stream.lines],
  )

  const q = useDeferredValue(text.toLowerCase())
  const rows = useMemo(() => {
    const filtered = all.filter(
      (l) =>
        (!deniedOnly || isDenied(l)) &&
        (!q || `${l.message} ${l.target}`.toLowerCase().includes(q)),
    )
    return filtered.reverse() // newest first
  }, [all, deniedOnly, q])
  const denied = useMemo(() => all.filter(isDenied).length, [all])
  const allowed = useMemo(() => all.filter(isAllowed).length, [all])

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        {toolbarStart}
        <SimpleSelect
          size="sm"
          aria-label="Source"
          value={source}
          onValueChange={setSource}
          options={[...SOURCES]}
        />
        <SimpleSelect
          size="sm"
          aria-label="Level"
          value={level}
          onValueChange={setLevel}
          options={LEVELS}
        />
        <SimpleSelect
          size="sm"
          aria-label="Since"
          value={since}
          onValueChange={setSince}
          options={SINCE}
        />
        <SimpleSelect size="sm" aria-label="Lines" value={n} onValueChange={setN} options={LINES} />
        <SearchInput
          value={text}
          onChange={setText}
          placeholder="Filter text"
          className="sm:w-56"
        />
        <Label className="gap-2 text-sm font-normal">
          <Switch checked={deniedOnly} onCheckedChange={setDeniedOnly} size="sm" /> Denied only
        </Label>
        <Label className="ml-auto gap-2 text-sm font-normal">
          <Switch checked={follow} onCheckedChange={setFollow} size="sm" />
          <RadioIcon
            className={cn('size-4', follow && stream.status === 'live' && 'text-emerald-500')}
          />{' '}
          Live
        </Label>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
        <span>
          {rows.length} of {all.length} lines
          {polling &&
            query.data?.buffer_total !== undefined &&
            ` (gateway buffer ${query.data.buffer_total})`}
        </span>
        <span className="text-emerald-700 dark:text-emerald-400">{allowed} allowed</span>
        <span className="text-red-700 dark:text-red-400">{denied} denied</span>
        <span>newest first</span>
        {follow && (
          <StatusBadge
            className="ml-auto"
            tone={
              stream.status === 'live'
                ? 'success'
                : stream.status === 'error'
                  ? 'danger'
                  : 'neutral'
            }
            pulse={stream.status === 'live'}
          >
            {stream.status === 'unavailable'
              ? 'Streaming unavailable, polling'
              : stream.status === 'live'
                ? 'Following'
                : stream.status}
          </StatusBadge>
        )}
      </div>
      {follow && stream.status === 'error' && (
        <ErrorAlert className="m-3" error={stream.error} title="The live stream stopped" />
      )}
      {polling && query.isPending ? (
        <div className="p-3">
          <LoadingRows rows={8} />
        </div>
      ) : polling && query.isError && !query.data ? (
        <ErrorAlert
          className="m-3"
          error={query.error}
          title="Could not load logs"
          onRetry={() => query.refetch()}
        />
      ) : (
        <LogRows rows={rows} />
      )}
    </Card>
  )
}

/** Virtualized log lines; a click shows a line's structured fields. */
function LogRows({ rows }: { rows: SandboxLogLine[] }) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState<Set<string>>(new Set())
  // eslint-disable-next-line react-hooks/incompatible-library -- the virtualizer is designed for this
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 26,
    overscan: 20,
  })

  if (!rows.length)
    return <p className="px-4 py-10 text-center text-sm text-muted-foreground">No log lines.</p>
  return (
    <div
      ref={parentRef}
      className="h-[min(65dvh,40rem)] overflow-auto font-mono text-xs"
      role="log"
      aria-live="off"
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const l = rows[item.index]
          const fields = Object.entries(l.fields ?? {})
          const id = lineId(l)
          const expanded = open.has(id)
          return (
            <div
              key={item.key}
              data-index={item.index}
              ref={virtualizer.measureElement}
              className={cn(
                'absolute left-0 w-full border-b border-border/50 px-3 py-1',
                isDenied(l) && 'bg-red-500/5',
              )}
              style={{ transform: `translateY(${item.start}px)` }}
            >
              <div
                className={cn(
                  // Phones: time, source and level on one line, the message below.
                  'grid grid-cols-[1rem_6.5rem_4rem_minmax(0,1fr)] gap-x-2 sm:grid-cols-[1rem_6.5rem_4rem_3.5rem_10rem_minmax(0,1fr)]',
                  fields.length && 'cursor-pointer',
                )}
                onClick={() =>
                  fields.length &&
                  setOpen((s) => {
                    const next = new Set(s)
                    if (!next.delete(id)) next.add(id)
                    return next
                  })
                }
              >
                <ChevronRightIcon
                  className={cn(
                    'mt-0.5 size-3 text-muted-foreground transition-transform',
                    !fields.length && 'invisible',
                    expanded && 'rotate-90',
                  )}
                />
                <span
                  className="text-muted-foreground tabular-nums"
                  title={formatDateTime(l.event_time)}
                >
                  {formatClock(l.event_time)}
                </span>
                <span className="truncate text-muted-foreground">{l.source || 'gateway'}</span>
                <span className={cn('truncate', levelClass[(l.level ?? '').toUpperCase()])}>
                  {l.level}
                </span>
                <span className="hidden truncate text-muted-foreground sm:block" title={l.target}>
                  {l.target}
                </span>
                <span className="col-span-3 col-start-2 break-words whitespace-pre-wrap sm:col-span-1 sm:col-start-auto">
                  <Message text={l.message ?? ''} />
                </span>
              </div>
              {expanded && (
                <dl className="mt-1 mb-1 ml-6 grid grid-cols-[max-content_1fr] gap-x-3 rounded bg-muted/50 p-2">
                  {fields.map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="break-all">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
