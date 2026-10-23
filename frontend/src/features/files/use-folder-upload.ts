import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import type { UploadPlan } from './folder-upload'
import { api } from '@/api/client'
import { ApiError, errorMessage } from '@/api/errors'
import { filesKey } from '@/api/queries'
import { joinPath } from '@/lib/path'
import type { SandboxRef } from '@/lib/sandbox'

/** Files written at the same time; each one is an exec in the sandbox. */
const PARALLEL = 4

export interface FolderUploadState {
  dir: string
  /** Files attempted so far, uploaded or failed. */
  done: number
  total: number
  failed: { path: string; error: string }[]
  running: boolean
  cancelled: boolean
}

/**
 * Uploads a planned folder tree: creates the folders, then writes the files
 * a few at a time. Cancel stops starting new files; the ones in flight finish.
 */
export function useFolderUpload(gw: string, { workspace: ws, name }: SandboxRef) {
  const qc = useQueryClient()
  const [state, setState] = useState<FolderUploadState | null>(null)
  const cancelRef = useRef(false)

  const start = async (dir: string, plan: UploadPlan) => {
    cancelRef.current = false
    const failed: FolderUploadState['failed'] = []
    let done = 0
    let ok = 0
    // A refusal (read-only mode, Origin) applies to every file, so stop at the first.
    let refused = false
    const fail = (path: string, e: unknown) => {
      failed.push({ path, error: errorMessage(e) })
      if (e instanceof ApiError && e.status === 403) refused = true
    }
    const stopped = () => cancelRef.current || refused
    const total = plan.files.length
    const update = () =>
      setState({ dir, done, total, failed: [...failed], running: true, cancelled: false })
    update()

    for (const d of plan.dirs) {
      if (stopped()) break
      try {
        await api.files.mkdir(gw, ws, name, joinPath(dir, d))
      } catch (e) {
        fail(d + '/', e)
      }
    }
    update()

    let next = 0
    const worker = async () => {
      while (!stopped() && next < plan.files.length) {
        const item = plan.files[next++]
        try {
          await api.files.write(gw, ws, name, joinPath(dir, item.path), item.file)
          ok++
        } catch (e) {
          fail(item.path, e)
        }
        done++
        update()
      }
    }
    await Promise.all(Array.from({ length: PARALLEL }, worker))

    const cancelled = cancelRef.current
    setState({ dir, done, total, failed, running: false, cancelled })
    await Promise.all([
      qc.invalidateQueries({ queryKey: filesKey(gw, ws, name) }),
      qc.invalidateQueries({ queryKey: ['audit'] }),
    ])
    const summary = `${ok} of ${total} file${total === 1 ? '' : 's'} uploaded to ${dir}.`
    if (cancelled && !refused) toast.warning('Upload cancelled', { description: summary })
    else if (failed.length)
      toast.error(`${failed.length} upload${failed.length === 1 ? '' : 's'} failed`, {
        description: summary,
      })
    else {
      toast.success(summary)
      setState(null)
    }
  }

  return {
    state,
    start,
    cancel: () => {
      cancelRef.current = true
      setState((s) => s && { ...s, cancelled: true })
    },
    dismiss: () => setState(null),
  }
}
