import { useRpc } from '@/api/mutations'
import { useConfirm } from '@/components/common/confirm-context'
import type { SandboxRef } from '@/lib/sandbox'

/** Start, stop and delete for a sandbox, with confirmation where it matters. */
export function useSandboxActions(gw: string) {
  const confirm = useConfirm()
  const start = useRpc(gw, 'StartSandbox', { success: (_, v) => `Starting ${v.body.name}.` })
  const stop = useRpc(gw, 'StopSandbox', {
    toastErrors: false,
    success: (_, v) => `Stopping ${v.body.name}.`,
  })
  const del = useRpc(gw, 'DeleteSandbox', {
    toastErrors: false,
    success: (_, v) => `Deleting ${v.body.name}.`,
  })

  return {
    starting: start.isPending,
    start: ({ workspace, name }: SandboxRef) => start.mutate({ ws: workspace, body: { name } }),
    stop: ({ workspace, name }: SandboxRef) =>
      confirm({
        title: `Stop ${name}?`,
        description:
          'The main process stops. The sandbox and its files are kept, and you can start it again.',
        confirmLabel: 'Stop sandbox',
        onConfirm: () => stop.mutateAsync({ ws: workspace, body: { name } }),
      }),
    remove: ({ workspace, name }: SandboxRef, onDeleted?: () => void) =>
      confirm({
        title: `Delete sandbox ${name}?`,
        description:
          'This removes the sandbox, its files and its exposed services. You cannot undo this.',
        confirmLabel: 'Delete sandbox',
        destructive: true,
        typeToConfirm: name,
        onConfirm: async () => {
          await del.mutateAsync({ ws: workspace, body: { name } })
          onDeleted?.()
        },
      }),
  }
}
