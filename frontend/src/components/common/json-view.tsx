import { ChevronRightIcon } from 'lucide-react'

import { CopyButton } from './copy-button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

/** A collapsed, copyable JSON dump for details that have no dedicated view. */
export function JsonView({ value, label = 'Raw JSON' }: { value: unknown; label?: string }) {
  const text = JSON.stringify(value, null, 2)
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronRightIcon className="size-3.5 transition-transform group-data-[panel-open]:rotate-90" />
        {label}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="relative mt-2">
          <CopyButton value={text} className="absolute top-1 right-1" />
          <pre className="max-h-96 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-5">
            {text}
          </pre>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
