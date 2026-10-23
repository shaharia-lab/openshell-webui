import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { MAX_UPLOAD } from './folder-upload'
import { api } from '@/api/client'
import { errorMessage } from '@/api/errors'
import { filesKey } from '@/api/queries'
import { formatBytes, joinPath } from '@/lib/path'
import type { SandboxRef } from '@/lib/sandbox'

/** Upload, write, mkdir and delete in a sandbox; each refreshes the listings. */
export function useFileActions(gw: string, { workspace: ws, name }: SandboxRef) {
  const qc = useQueryClient()
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: filesKey(gw, ws, name) }),
      qc.invalidateQueries({ queryKey: ['audit'] }),
    ])

  const upload = useMutation({
    mutationFn: async ({ dir, files }: { dir: string; files: File[] }) => {
      const tooBig = files.find((f) => f.size > MAX_UPLOAD)
      if (tooBig)
        throw new Error(
          `${tooBig.name} is ${formatBytes(tooBig.size)}; the limit is ${formatBytes(MAX_UPLOAD)}.`,
        )
      for (const f of files) await api.files.write(gw, ws, name, joinPath(dir, f.name), f)
      return files.length
    },
    onSuccess: (n, { dir }) => toast.success(`Uploaded ${n} file${n === 1 ? '' : 's'} to ${dir}.`),
    onError: (e) => toast.error('Upload failed', { description: errorMessage(e) }),
    onSettled: refresh,
  })

  const write = useMutation({
    mutationFn: ({ path, text }: { path: string; text: string }) =>
      api.files.write(gw, ws, name, path, new Blob([text])),
    onSuccess: (_, { path }) => toast.success(`Saved ${path}.`),
    onSettled: refresh,
  })

  const mkdir = useMutation({
    mutationFn: (path: string) => api.files.mkdir(gw, ws, name, path),
    onSuccess: (_, path) => toast.success(`Created ${path}.`),
    onSettled: refresh,
  })

  const remove = useMutation({
    mutationFn: (path: string) => api.files.remove(gw, ws, name, path),
    onSuccess: (_, path) => toast.success(`Deleted ${path}.`),
    onSettled: refresh,
  })

  return { upload, write, mkdir, remove }
}
