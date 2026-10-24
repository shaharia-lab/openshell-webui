import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const chip = 'rounded-md border bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] leading-4'

/**
 * A wrapped list of monospace tags, e.g. paths or host:port pairs. Long tags
 * are cut (hover shows them whole); with `limit`, the rest collapse into a
 * "+N more" tag that lists them on hover, so a table row stays compact.
 */
export function Chips({
  items,
  className,
  empty = '—',
  limit,
}: {
  items?: string[]
  className?: string
  empty?: string
  limit?: number
}) {
  if (!items?.length) return <span className="text-muted-foreground">{empty}</span>
  const shown = limit && items.length > limit + 1 ? items.slice(0, limit) : items
  const rest = items.slice(shown.length)
  return (
    <div className={cn('flex min-w-0 flex-wrap gap-1', className)}>
      {shown.map((x) => (
        <code key={x} title={x} className={cn(chip, 'max-w-[18rem] truncate')}>
          {x}
        </code>
      ))}
      {rest.length > 0 && (
        <Tooltip>
          <TooltipTrigger
            render={<span className={cn(chip, 'cursor-default font-sans text-muted-foreground')} />}
          >
            +{rest.length} more
          </TooltipTrigger>
          <TooltipContent className="max-w-md flex-col items-start font-mono">
            {rest.map((x) => (
              <span key={x} className="break-all">
                {x}
              </span>
            ))}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}
