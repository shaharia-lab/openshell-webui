import type * as React from 'react'

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  children?: React.ReactNode
}

export function PageHeader({ title, description, actions, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight">
          {title}
        </h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

interface SectionProps extends Omit<React.ComponentProps<typeof Card>, 'title'> {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  /** Render children edge to edge (tables). */
  flush?: boolean
}

/** A titled card. Tables go in flush sections so rows reach the edges. */
export function Section({
  title,
  description,
  actions,
  flush,
  className,
  children,
  ...props
}: SectionProps) {
  return (
    <Card className={cn(flush && 'pb-0', className)} {...props}>
      {/* On phones the actions go below the title instead of squeezing it. */}
      <CardHeader className="max-sm:grid-cols-1!">
        <CardTitle className="flex flex-wrap items-center gap-2">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {actions && (
          <CardAction className="flex flex-wrap gap-2 max-sm:col-start-1 max-sm:row-span-1 max-sm:row-start-auto max-sm:mt-2 max-sm:justify-self-start">
            {actions}
          </CardAction>
        )}
      </CardHeader>
      <CardContent className={cn(flush && 'border-t px-0')}>{children}</CardContent>
    </Card>
  )
}
