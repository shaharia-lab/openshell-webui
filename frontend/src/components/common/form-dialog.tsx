import type * as React from 'react'

import { errorMessage } from '@/api/errors'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

const SIZES = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl', xl: 'sm:max-w-5xl' }

interface FormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  size?: keyof typeof SIZES
  /** The form. It mounts on open, so its state starts fresh every time. */
  children: React.ReactNode
}

/** A dialog sized for a form; long forms scroll inside it. */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  size = 'md',
  children,
}: FormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn('flex max-h-[min(90dvh,56rem)] flex-col gap-0 p-0', SIZES[size])}
      >
        <DialogHeader className="border-b p-4 pr-12">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}

interface DialogFormProps extends Omit<React.ComponentProps<'form'>, 'onSubmit'> {
  onSubmit: React.FormEventHandler<HTMLFormElement>
  submitLabel: string
  pending?: boolean
  /** A request error, shown above the buttons. */
  error?: unknown
  destructive?: boolean
  /** Extra buttons on the left of the footer (e.g. "Check"). */
  extraActions?: React.ReactNode
  submitDisabled?: boolean
  /** Label of the button that closes the dialog. */
  cancelLabel?: string
}

export function DialogForm({
  onSubmit,
  submitLabel,
  pending,
  error,
  destructive,
  extraActions,
  submitDisabled,
  cancelLabel = 'Cancel',
  children,
  className,
  ...props
}: DialogFormProps) {
  return (
    <form noValidate onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col" {...props}>
      <div className={cn('min-h-0 flex-1 space-y-5 overflow-y-auto p-4', className)}>
        {children}
        {error != null && (
          <Alert variant="destructive">
            <AlertDescription className="font-mono text-xs break-words whitespace-pre-wrap">
              {errorMessage(error)}
            </AlertDescription>
          </Alert>
        )}
      </div>
      <DialogFooter className="m-0 rounded-b-xl sm:items-center">
        {extraActions && (
          <div className="flex gap-2 *:flex-1 sm:mr-auto sm:*:flex-none">{extraActions}</div>
        )}
        <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>
          {cancelLabel}
        </DialogClose>
        <Button
          type="submit"
          variant={destructive ? 'destructive' : 'default'}
          disabled={pending || submitDisabled}
        >
          {pending && <Spinner />}
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  )
}
