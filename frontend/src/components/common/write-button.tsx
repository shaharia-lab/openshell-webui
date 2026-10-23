import type * as React from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCanWrite } from '@/hooks/use-scope'

type WriteButtonProps = React.ComponentProps<typeof Button> & {
  /** Why the action is unavailable even in read-write mode. */
  disabledReason?: string
}

/**
 * A button for an action that changes state. In read-only mode it is
 * disabled and explains why.
 */
export function WriteButton({ disabledReason, disabled, ...props }: WriteButtonProps) {
  const canWrite = useCanWrite()
  const reason = !canWrite ? 'The console runs in read-only mode.' : disabledReason
  if (!reason) return <Button disabled={disabled} {...props} />
  return (
    <Tooltip>
      {/* A disabled button gets no pointer events, so the span carries the tooltip. */}
      <TooltipTrigger render={<span className="inline-flex" tabIndex={0} />}>
        <Button disabled {...props} />
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  )
}
