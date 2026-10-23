import { cn } from '@/lib/utils'

/** A wrapped list of monospace tags, e.g. paths or host:port pairs. */
export function Chips({
  items,
  className,
  empty = '—',
}: {
  items?: string[]
  className?: string
  empty?: string
}) {
  if (!items?.length) return <span className="text-muted-foreground">{empty}</span>
  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {items.map((x) => (
        <code
          key={x}
          className="rounded-md border bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] leading-4"
        >
          {x}
        </code>
      ))}
    </div>
  )
}
