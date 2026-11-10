import { CheckIcon, CopyIcon } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { copyText } from '@/lib/clipboard'
import { cn } from '@/lib/utils'

export function CopyButton({
  value,
  className,
  label = 'Copy',
}: {
  value: string
  className?: string
  label?: string
}) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      size="icon-xs"
      variant="ghost"
      className={cn('text-muted-foreground', className)}
      aria-label={label}
      title={label}
      onClick={async () => {
        if (!(await copyText(value))) return
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  )
}
