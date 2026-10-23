import { createContext, use, type ReactNode } from 'react'

export interface ConfirmOptions {
  title: ReactNode
  description?: ReactNode
  confirmLabel?: string
  /** Red confirm button, for actions that remove or stop something. */
  destructive?: boolean
  /** The user must type this text (a resource name) before confirming. */
  typeToConfirm?: string
  /** Runs on confirm. The dialog stays open and shows the error if it throws. */
  onConfirm: () => unknown
}

export const ConfirmContext = createContext<((opts: ConfirmOptions) => void) | null>(null)

/** Opens a confirmation dialog for an action that is hard to undo. */
export function useConfirm() {
  const ctx = use(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>')
  return ctx
}
