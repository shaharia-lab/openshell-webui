import { toast } from 'sonner'

import { useRpc } from '@/api/mutations'
import { errorMessage } from '@/api/errors'
import { useConfirm } from '@/components/common/confirm-context'
import type { SandboxRef } from '@/lib/sandbox'

/** How many requests run at once; enough to be quick without flooding the gateway. */
const PARALLEL = 4

/** Runs `run` for every item, a few at a time, and returns the failures. */
export async function forEachLimited<T>(
  items: T[],
  run: (item: T) => Promise<unknown>,
  limit = PARALLEL,
): Promise<{ item: T; error: unknown }[]> {
  const failed: { item: T; error: unknown }[] = []
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++]
      try {
        await run(item)
      } catch (error) {
        failed.push({ item, error })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return failed
}

const plural = (n: number) => `${n} sandbox${n === 1 ? '' : 'es'}`

/** The first few names, then how many more. */
const names = (refs: SandboxRef[], shown = 5) =>
  refs.length <= shown
    ? refs.map((r) => r.name).join(', ')
    : `${refs
        .slice(0, shown)
        .map((r) => r.name)
        .join(', ')} and ${refs.length - shown} more`

/** Start, stop and delete for many sandboxes at once, with one summary toast each. */
export function useBulkSandboxActions(gw: string) {
  const confirm = useConfirm()
  const start = useRpc(gw, 'StartSandbox', { toastErrors: false })
  const stop = useRpc(gw, 'StopSandbox', { toastErrors: false })
  const del = useRpc(gw, 'DeleteSandbox', { toastErrors: false })

  const runAll = async (
    refs: SandboxRef[],
    call: (r: SandboxRef) => Promise<unknown>,
    verb: string,
  ) => {
    const failed = await forEachLimited(refs, call)
    const ok = refs.length - failed.length
    if (ok) toast.success(`${verb} ${plural(ok)}.`)
    if (failed.length) {
      toast.error(`${failed.length} of ${plural(refs.length)} failed`, {
        description: failed.map((f) => `${f.item.name}: ${errorMessage(f.error)}`).join('\n'),
      })
    }
    return failed.length === 0
  }

  return {
    start: (refs: SandboxRef[]) =>
      runAll(
        refs,
        (r) => start.mutateAsync({ ws: r.workspace, body: { name: r.name } }),
        'Starting',
      ),
    stop: (refs: SandboxRef[], onDone?: () => void) =>
      confirm({
        title: `Stop ${plural(refs.length)}?`,
        description:
          'Their main processes stop. The sandboxes and their files are kept, and you can start them again.',
        confirmLabel: `Stop ${plural(refs.length)}`,
        onConfirm: async () => {
          await runAll(
            refs,
            (r) => stop.mutateAsync({ ws: r.workspace, body: { name: r.name } }),
            'Stopping',
          )
          onDone?.()
        },
      }),
    remove: (refs: SandboxRef[], onDone?: () => void) =>
      confirm({
        title: `Delete ${plural(refs.length)}?`,
        description: `This removes ${names(refs)}, with their files and exposed services. You cannot undo this.`,
        confirmLabel: `Delete ${plural(refs.length)}`,
        destructive: true,
        typeToConfirm: `delete ${plural(refs.length)}`,
        onConfirm: async () => {
          await runAll(
            refs,
            (r) => del.mutateAsync({ ws: r.workspace, body: { name: r.name } }),
            'Deleting',
          )
          onDone?.()
        },
      }),
  }
}
