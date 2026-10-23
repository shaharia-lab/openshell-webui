import { useCallback, useState, type ReactNode } from 'react'

import { ConfirmContext, type ConfirmOptions } from './confirm-context'

import { errorMessage } from '@/api/errors'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o)
    setTyped('')
    setError(null)
    setPending(false)
    setOpen(true)
  }, [])

  const run = async () => {
    if (!opts) return
    setPending(true)
    setError(null)
    try {
      await opts.onConfirm()
      setOpen(false)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setPending(false)
    }
  }

  const blocked = !!opts?.typeToConfirm && typed !== opts.typeToConfirm

  return (
    <ConfirmContext value={confirm}>
      {children}
      <AlertDialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <AlertDialogContent>
          <form
            className="contents"
            onSubmit={(e) => {
              e.preventDefault()
              if (!blocked && !pending) void run()
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>{opts?.title}</AlertDialogTitle>
              {opts?.description && (
                <AlertDialogDescription>{opts.description}</AlertDialogDescription>
              )}
            </AlertDialogHeader>
            {opts?.typeToConfirm && (
              <Field>
                <FieldLabel htmlFor="confirm-name">
                  Type <code className="font-mono font-semibold">{opts.typeToConfirm}</code> to
                  confirm
                </FieldLabel>
                <Input
                  id="confirm-name"
                  autoComplete="off"
                  autoFocus
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                />
              </Field>
            )}
            {error && (
              <p role="alert" className="text-sm break-words text-destructive">
                {error}
              </p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                type="submit"
                variant={opts?.destructive ? 'destructive' : 'default'}
                disabled={blocked || pending}
              >
                {pending && <Spinner />}
                {opts?.confirmLabel ?? 'Confirm'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext>
  )
}
