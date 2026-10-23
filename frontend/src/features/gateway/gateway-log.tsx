import { useMemo, useState } from 'react'

import { useGatewayLog } from '@/api/queries'
import type { GatewayLogLine } from '@/api/types'
import { QueryView } from '@/components/common/query-view'
import { SearchInput } from '@/components/common/search-input'
import { SimpleSelect } from '@/components/common/simple-select'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { formatClock, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

const RANK: Record<string, number> = { ERROR: 2, WARN: 1 }
const LEVELS = [
  { value: '0', label: 'All levels' },
  { value: '1', label: 'Warn and up' },
  { value: '2', label: 'Errors' },
]
const isAccessLine = (l: GatewayLogLine) =>
  /^request\{.*http\.response\.status_code=2\d\d\}/.test(l.msg)

/** Tail of the local gateway's service log. */
export function GatewayLog() {
  const [level, setLevel] = useState('0')
  const [hideAccess, setHideAccess] = useState(true)
  const [text, setText] = useState('')
  const query = useGatewayLog(1000, true)

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <SimpleSelect
          size="sm"
          aria-label="Level"
          value={level}
          onValueChange={setLevel}
          options={LEVELS}
        />
        <SearchInput
          value={text}
          onChange={setText}
          placeholder="Filter text"
          className="sm:w-56"
        />
        <Label className="gap-2 text-sm font-normal">
          <Switch size="sm" checked={hideAccess} onCheckedChange={setHideAccess} /> Hide successful
          requests
        </Label>
        {query.data && (
          <span className="ml-auto font-mono text-xs text-muted-foreground">{query.data.dir}</span>
        )}
      </div>
      <QueryView query={query} errorTitle="The gateway log is unavailable">
        {(data) => (
          <LogLines lines={data.lines} level={Number(level)} hideAccess={hideAccess} text={text} />
        )}
      </QueryView>
    </Card>
  )
}

function LogLines({
  lines,
  level,
  hideAccess,
  text,
}: {
  lines: GatewayLogLine[]
  level: number
  hideAccess: boolean
  text: string
}) {
  const q = text.toLowerCase()
  const rows = useMemo(
    () =>
      lines
        .filter(
          (l) =>
            (RANK[l.level] ?? 0) >= level &&
            !(hideAccess && isAccessLine(l)) &&
            (!q || l.msg.toLowerCase().includes(q)),
        )
        .reverse(),
    [lines, level, hideAccess, q],
  )
  if (!rows.length)
    return <p className="px-4 py-10 text-center text-sm text-muted-foreground">No log lines.</p>
  return (
    <div className="max-h-[65dvh] overflow-auto font-mono text-xs">
      {rows.map((l, i) => (
        <div
          key={i}
          className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-2 border-b border-border/50 px-3 py-1 sm:grid-cols-[6.5rem_3.5rem_minmax(0,1fr)]"
        >
          <span
            className="text-muted-foreground tabular-nums"
            title={`${formatDateTime(l.time)} · ${l.file}`}
          >
            {formatClock(l.time)}
          </span>
          <span
            className={cn(
              l.level === 'ERROR' && 'font-semibold text-red-600 dark:text-red-400',
              l.level === 'WARN' && 'font-semibold text-amber-600 dark:text-amber-400',
            )}
          >
            {l.level}
          </span>
          <span className="col-span-2 break-words whitespace-pre-wrap sm:col-span-1">{l.msg}</span>
        </div>
      ))}
    </div>
  )
}
