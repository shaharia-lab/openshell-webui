import { AlertCircleIcon, RotateCwIcon } from 'lucide-react'

import { errorMessage } from '@/api/errors'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ErrorAlertProps {
  error: unknown
  title?: string
  onRetry?: () => void
  className?: string
}

export function ErrorAlert({
  error,
  title = 'Something went wrong',
  onRetry,
  className,
}: ErrorAlertProps) {
  return (
    <Alert variant="destructive" className={className}>
      <AlertCircleIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className={cn('font-mono text-xs break-words whitespace-pre-wrap')}>
        {errorMessage(error)}
      </AlertDescription>
      {onRetry && (
        <AlertAction>
          <Button size="xs" variant="outline" onClick={onRetry}>
            <RotateCwIcon /> Retry
          </Button>
        </AlertAction>
      )}
    </Alert>
  )
}
