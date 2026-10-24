import { ChevronRightIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

interface FormSectionProps {
  title: string
  /** Short state of the section, shown next to the title while collapsed or open. */
  summary?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  defaultOpen?: boolean
  children: ReactNode
}

/** A collapsible part of a long form: one row with a title and a summary of its values. */
export function FormSection({
  title,
  summary,
  open,
  onOpenChange,
  defaultOpen,
  children,
}: FormSectionProps) {
  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      defaultOpen={defaultOpen}
      className="rounded-lg border"
    >
      <CollapsibleTrigger className="group flex w-full items-center gap-2 px-3 py-2 text-left text-sm">
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-90" />
        <span className="font-medium">{title}</span>
        {summary && (
          <span className="ml-auto truncate text-xs text-muted-foreground">{summary}</span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 border-t px-3 py-3">{children}</CollapsibleContent>
    </Collapsible>
  )
}
