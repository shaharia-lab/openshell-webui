import type * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const toneClass: Record<Tone, string> = {
  success: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  warning: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  danger: 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-400',
  info: 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-400',
  neutral: 'border-border bg-muted text-muted-foreground',
}

const dotClass: Record<Tone, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-sky-500',
  neutral: 'bg-muted-foreground/60',
}

interface StatusBadgeProps extends React.ComponentProps<'span'> {
  tone: Tone
  dot?: boolean
  /** Pulse the dot, for states that are still changing. */
  pulse?: boolean
}

export function StatusBadge({
  tone,
  dot = true,
  pulse,
  className,
  children,
  ...props
}: StatusBadgeProps) {
  return (
    <Badge variant="outline" className={cn(toneClass[tone], className)} {...props}>
      {dot && (
        <span className="relative flex size-1.5">
          {pulse && (
            <span
              className={cn(
                'absolute inline-flex size-full animate-ping rounded-full opacity-75',
                dotClass[tone],
              )}
            />
          )}
          <span className={cn('relative inline-flex size-1.5 rounded-full', dotClass[tone])} />
        </span>
      )}
      {children}
    </Badge>
  )
}
