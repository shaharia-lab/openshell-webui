import type { LucideIcon } from 'lucide-react'
import type * as React from 'react'
import { Link } from 'react-router'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon: LucideIcon
  to?: string
  loading?: boolean
}

export function StatCard({ label, value, hint, icon: Icon, to, loading }: StatCardProps) {
  const body = (
    <>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        {label}
        <Icon className="size-4" />
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-12" />
      ) : (
        <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      )}
      {hint && <div className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</div>}
    </>
  )
  const cls = 'block rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors'
  return to ? (
    <Link
      to={to}
      className={cn(
        cls,
        'hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}
