import type * as React from 'react'

import { cn } from '@/lib/utils'

export interface KeyValueItem {
  label: React.ReactNode
  value: React.ReactNode
  mono?: boolean
  /** Hide the row when the value is empty. */
  optional?: boolean
}

const isEmpty = (v: React.ReactNode) => v === undefined || v === null || v === '' || v === false

export function KeyValueList({ items, className }: { items: KeyValueItem[]; className?: string }) {
  return (
    <dl
      className={cn(
        'grid grid-cols-[minmax(7rem,max-content)_1fr] gap-x-6 gap-y-2 text-sm',
        className,
      )}
    >
      {items
        .filter((it) => !(it.optional && isEmpty(it.value)))
        .map((it, i) => (
          <div key={i} className="contents">
            <dt className="text-muted-foreground">{it.label}</dt>
            <dd className={cn('min-w-0 break-words', it.mono && 'font-mono text-xs leading-5')}>
              {isEmpty(it.value) ? <span className="text-muted-foreground">—</span> : it.value}
            </dd>
          </div>
        ))}
    </dl>
  )
}
