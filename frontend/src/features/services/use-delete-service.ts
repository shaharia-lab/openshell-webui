import { useCallback } from 'react'

import { useRpc } from '@/api/mutations'
import { useConfirm } from '@/components/common/confirm-context'

/** Deletes an exposed service after confirmation. */
export function useDeleteService(gw: string) {
  const confirm = useConfirm()
  const del = useRpc(gw, 'DeleteService', { toastErrors: false, success: 'Service deleted.' })
  const { mutateAsync } = del
  return useCallback(
    (ws: string, sandbox: string, name: string) =>
      confirm({
        title: `Delete service ${name || '(unnamed)'}?`,
        description: `Its URL stops working. The process in ${sandbox} keeps running.`,
        confirmLabel: 'Delete service',
        destructive: true,
        onConfirm: () => mutateAsync({ ws, body: { sandbox, name } }),
      }),
    [confirm, mutateAsync],
  )
}
