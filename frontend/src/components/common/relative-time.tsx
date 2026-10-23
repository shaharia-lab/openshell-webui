import { formatDateTime, formatRelative } from '@/lib/format'

/** "5 minutes ago" with the exact time on hover. */
export function RelativeTime({ iso, className }: { iso?: string | null; className?: string }) {
  if (!iso) return <span className="text-muted-foreground">—</span>
  return (
    <time dateTime={iso} title={formatDateTime(iso)} className={className}>
      {formatRelative(iso)}
    </time>
  )
}
