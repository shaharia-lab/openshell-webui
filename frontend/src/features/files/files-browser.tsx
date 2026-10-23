import {
  ArrowUpIcon,
  DownloadIcon,
  EllipsisIcon,
  EyeIcon,
  FileIcon,
  FolderIcon,
  FolderPlusIcon,
  FolderUpIcon,
  LinkIcon,
  RefreshCwIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from 'lucide-react'
import { useCallback, useMemo, useRef, useState, type DragEvent } from 'react'
import { toast } from 'sonner'

import { FilePreviewDialog, MAX_PREVIEW } from './file-preview-dialog'
import {
  DEFAULT_EXCLUDES,
  MAX_UPLOAD,
  fromDataTransfer,
  fromFileList,
  planUpload,
  type UploadItem,
} from './folder-upload'
import { useFileActions } from './use-file-actions'
import { useFolderUpload, type FolderUploadState } from './use-folder-upload'
import { api } from '@/api/client'
import { useSandboxFiles } from '@/api/queries'
import type { FileEntry } from '@/api/types'
import { useConfirm } from '@/components/common/confirm-context'
import { columnsFor } from '@/components/common/columns'
import { DataTable } from '@/components/common/data-table'
import { ErrorAlert } from '@/components/common/error-alert'
import { DialogForm, FormDialog } from '@/components/common/form-dialog'
import { LoadingRows } from '@/components/common/query-view'
import { WriteButton } from '@/components/common/write-button'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useCanWrite } from '@/hooks/use-scope'
import { formatDateTime, formatRelative } from '@/lib/format'
import { formatBytes, joinPath, normalizePath, parentPath, pathSegments } from '@/lib/path'
import type { SandboxRef } from '@/lib/sandbox'
import { cn } from '@/lib/utils'

const col = columnsFor<FileEntry>()
const iso = (unix: number) => new Date(unix * 1000).toISOString()

interface FilesBrowserProps {
  gw: string
  sandboxRef: SandboxRef
  /** Starting directory: the sandbox's workdir. */
  initialPath?: string
}

/** Browse, preview, upload and delete files inside a sandbox. */
export function FilesBrowser({ gw, sandboxRef, initialPath = '/sandbox' }: FilesBrowserProps) {
  const [path, setPath] = useState(initialPath)
  const [pathInput, setPathInput] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ path: string; size: number } | null>(null)
  const [mkdirOpen, setMkdirOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const uploadRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement | null>(null)
  const listing = useSandboxFiles(gw, sandboxRef.workspace, sandboxRef.name, path)
  const actions = useFileActions(gw, sandboxRef)
  const folderUpload = useFolderUpload(gw, sandboxRef)
  const busy = actions.upload.isPending || !!folderUpload.state?.running
  const canWrite = useCanWrite()
  const confirm = useConfirm()
  const { workspace: ws, name } = sandboxRef

  const startUpload = (files: File[]) => {
    if (!files.length) return
    const existing = new Set((listing.data?.entries ?? []).map((e) => e.name))
    const clashes = files.filter((f) => existing.has(f.name)).map((f) => f.name)
    const run = () => actions.upload.mutateAsync({ dir: path, files })
    if (!clashes.length) return void run().catch(() => {})
    confirm({
      title: `Replace ${clashes.length === 1 ? clashes[0] : `${clashes.length} files`}?`,
      description: `${clashes.join(', ')} already exist${clashes.length === 1 ? 's' : ''} in ${path} and will be overwritten.`,
      confirmLabel: 'Replace',
      destructive: true,
      onConfirm: run,
    })
  }

  const startFolderUpload = async (items: UploadItem[], emptyDirs: string[] = []) => {
    if (!items.length && !emptyDirs.length) return
    const dir = path
    const plan = await planUpload(items, emptyDirs)
    const skipped = [
      plan.excluded &&
        `${plan.excluded} file${plan.excluded === 1 ? '' : 's'} excluded (${DEFAULT_EXCLUDES.join(', ')} and .gitignore rules)`,
      plan.tooLarge.length &&
        `${plan.tooLarge.map((i) => i.path).join(', ')} over ${formatBytes(MAX_UPLOAD)}`,
    ].filter(Boolean)
    if (!plan.files.length && !plan.dirs.length) {
      toast.error('Nothing to upload', {
        description: skipped.length ? `Skipped ${skipped.join('; ')}.` : undefined,
      })
      return
    }
    const existing = new Set((listing.data?.entries ?? []).map((e) => e.name))
    const clashes = plan.roots.filter((r) => existing.has(r))
    const count = `${plan.files.length} file${plan.files.length === 1 ? '' : 's'}`
    confirm({
      title: `Upload ${plan.roots.length === 1 ? plan.roots[0] : count}?`,
      description: [
        `${count} (${formatBytes(plan.totalBytes)}) will be copied into ${dir}, keeping their folders.`,
        skipped.length ? `Skipped: ${skipped.join('; ')}.` : '',
        clashes.length
          ? `${clashes.join(', ')} already exist${clashes.length === 1 ? 's' : ''} here; files with the same path are overwritten.`
          : '',
      ]
        .filter(Boolean)
        .join(' '),
      confirmLabel: 'Upload',
      onConfirm: () => void folderUpload.start(dir, plan),
    })
  }

  const { mutateAsync: removePath } = actions.remove
  const remove = useCallback(
    (entry: FileEntry) => {
      const target = joinPath(path, entry.name)
      confirm({
        title: `Delete ${target}?`,
        description:
          entry.type === 'dir'
            ? 'The folder and everything in it is removed. You cannot undo this.'
            : 'You cannot undo this.',
        confirmLabel: 'Delete',
        destructive: true,
        typeToConfirm: entry.type === 'dir' ? entry.name : undefined,
        onConfirm: () => removePath(target),
      })
    },
    [path, confirm, removePath],
  )

  const open = (e: FileEntry) => {
    if (e.type === 'dir') setPath(joinPath(path, e.name))
    else if (e.type === 'file' && e.size <= MAX_PREVIEW)
      setPreview({ path: joinPath(path, e.name), size: e.size })
  }

  const columns = useMemo(
    () => [
      col.accessor('name', {
        header: 'Name',
        cell: ({ row }) => {
          const e = row.original
          const Icon = e.type === 'dir' ? FolderIcon : e.type === 'symlink' ? LinkIcon : FileIcon
          return (
            <span className="inline-flex min-w-0 items-center gap-2">
              <Icon
                className={cn(
                  'size-4 shrink-0',
                  e.type === 'dir' ? 'text-sky-600 dark:text-sky-400' : 'text-muted-foreground',
                )}
              />
              <span className={cn('break-all', e.type === 'dir' && 'font-medium')}>{e.name}</span>
              {e.link_target && (
                <span className="truncate text-xs text-muted-foreground">→ {e.link_target}</span>
              )}
            </span>
          )
        },
      }),
      col.accessor('size', {
        header: 'Size',
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.type === 'dir' ? '—' : formatBytes(row.original.size)}
          </span>
        ),
        meta: { className: 'w-24' },
      }),
      col.accessor('mtime', {
        header: 'Modified',
        cell: ({ getValue }) => (
          <span title={formatDateTime(iso(getValue()))}>{formatRelative(iso(getValue()))}</span>
        ),
        meta: { className: 'hidden sm:table-cell w-36' },
      }),
      col.accessor('mode', {
        header: 'Mode',
        cell: ({ getValue }) => <code className="font-mono text-xs">{getValue()}</code>,
        meta: { className: 'hidden md:table-cell w-16' },
      }),
      col.accessor('owner', { header: 'Owner', meta: { className: 'hidden md:table-cell w-28' } }),
      col.display({
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        meta: { className: 'w-10 text-right' },
        cell: ({ row }) => {
          const e = row.original
          const target = joinPath(path, e.name)
          return (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${e.name}`} />
                }
              >
                <EllipsisIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-40">
                {e.type === 'file' && (
                  <>
                    <DropdownMenuItem
                      disabled={e.size > MAX_PREVIEW}
                      onClick={() => setPreview({ path: target, size: e.size })}
                    >
                      <EyeIcon /> {e.size > MAX_PREVIEW ? 'Too large to preview' : 'Preview'}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      render={<a href={api.files.contentUrl(gw, ws, name, target)} download />}
                    >
                      <DownloadIcon /> Download
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem
                  variant="destructive"
                  disabled={!canWrite}
                  onClick={() => remove(e)}
                >
                  <Trash2Icon /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      }),
    ],
    [path, gw, ws, name, canWrite, remove],
  )

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (!canWrite || busy) return
    const drop = fromDataTransfer(e.dataTransfer)
    if (!drop.hasFolder) return startUpload([...e.dataTransfer.files])
    drop
      .read()
      .then(({ items, dirs }) => startFolderUpload(items, dirs))
      .catch((err) =>
        toast.error('Could not read the dropped folder', { description: String(err) }),
      )
  }

  return (
    <Card
      className={cn('relative gap-0 overflow-hidden py-0', dragging && 'ring-2 ring-primary')}
      onDragOver={(e) => {
        if (!canWrite || !e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
      }}
      onDrop={onDrop}
    >
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <Button
          size="icon-sm"
          variant="outline"
          aria-label="Parent folder"
          disabled={path === '/'}
          onClick={() => setPath(parentPath(path))}
        >
          <ArrowUpIcon />
        </Button>
        {pathInput === null ? (
          <nav
            aria-label="Path"
            className="order-last flex min-w-0 basis-full flex-wrap items-center rounded-md px-1 font-mono text-sm hover:bg-muted/50 sm:order-none sm:flex-1 sm:basis-auto"
            onDoubleClick={() => setPathInput(path)}
            title="Double-click to type a path"
          >
            {pathSegments(path).map((s, i, all) => (
              <span key={s.path} className="inline-flex items-center">
                {i > 1 && <span className="px-0.5 text-muted-foreground">/</span>}
                <button
                  type="button"
                  className={cn(
                    'rounded px-1 py-0.5 hover:bg-muted',
                    i === all.length - 1 && 'font-semibold',
                  )}
                  onClick={() => setPath(s.path)}
                >
                  {s.name}
                </button>
              </span>
            ))}
          </nav>
        ) : (
          <form
            className="order-last min-w-0 basis-full sm:order-none sm:flex-1 sm:basis-auto"
            onSubmit={(e) => {
              e.preventDefault()
              setPath(normalizePath(pathInput))
              setPathInput(null)
            }}
          >
            <Input
              autoFocus
              aria-label="Path"
              className="h-7 font-mono text-xs"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              onBlur={() => setPathInput(null)}
              onKeyDown={(e) => e.key === 'Escape' && setPathInput(null)}
            />
          </form>
        )}
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Refresh"
          onClick={() => listing.refetch()}
        >
          <RefreshCwIcon className={cn(listing.isFetching && 'animate-spin')} />
        </Button>
        <WriteButton size="sm" variant="outline" onClick={() => setMkdirOpen(true)}>
          <FolderPlusIcon /> New folder
        </WriteButton>
        <WriteButton size="sm" onClick={() => uploadRef.current?.click()} disabled={busy}>
          <UploadIcon /> {busy ? 'Uploading…' : 'Upload'}
        </WriteButton>
        <WriteButton
          size="sm"
          variant="outline"
          onClick={() => folderRef.current?.click()}
          disabled={busy}
        >
          <FolderUpIcon /> Upload folder
        </WriteButton>
        <input
          ref={(el) => {
            folderRef.current = el
            // Not in React's DOM types; lets the picker select a folder.
            el?.setAttribute('webkitdirectory', '')
          }}
          type="file"
          hidden
          aria-label="Upload folder"
          onChange={(e) => {
            void startFolderUpload(fromFileList(e.target.files ?? []))
            e.target.value = ''
          }}
        />
        <input
          ref={uploadRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            startUpload([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
      </div>

      {folderUpload.state && (
        <UploadProgress
          state={folderUpload.state}
          onCancel={folderUpload.cancel}
          onDismiss={folderUpload.dismiss}
        />
      )}

      {listing.isPending ? (
        <div className="p-3">
          <LoadingRows rows={6} />
        </div>
      ) : listing.isError ? (
        <ErrorAlert
          className="m-3"
          error={listing.error}
          title={`Could not list ${path}`}
          onRetry={() => listing.refetch()}
        />
      ) : (
        <DataTable
          data={listing.data.entries}
          columns={columns}
          getRowId={(e) => e.name}
          onRowClick={open}
          empty={
            canWrite ? 'Empty folder. Drop files or folders here to upload them.' : 'Empty folder.'
          }
        />
      )}

      {dragging && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/80 text-sm font-medium">
          Drop files or folders to upload to {path}
        </div>
      )}

      <FilePreviewDialog
        gw={gw}
        sandboxRef={sandboxRef}
        file={preview}
        onOpenChange={(o) => !o && setPreview(null)}
      />
      <FormDialog
        open={mkdirOpen}
        onOpenChange={setMkdirOpen}
        size="sm"
        title="New folder"
        description={`Inside ${path}. Parent folders are created as needed.`}
      >
        <MkdirForm
          pending={actions.mkdir.isPending}
          error={actions.mkdir.error}
          onCreate={(folder) =>
            actions.mkdir.mutate(joinPath(path, folder), { onSuccess: () => setMkdirOpen(false) })
          }
        />
      </FormDialog>
    </Card>
  )
}

function MkdirForm({
  onCreate,
  pending,
  error,
}: {
  onCreate: (name: string) => void
  pending: boolean
  error: unknown
}) {
  const [folder, setFolder] = useState('')
  const invalid = /(^|\/)\.\.(\/|$)/.test(folder)
  return (
    <DialogForm
      submitLabel="Create"
      pending={pending}
      error={error}
      submitDisabled={!folder.trim() || invalid}
      onSubmit={(e) => {
        e.preventDefault()
        onCreate(folder.trim())
      }}
    >
      <Field data-invalid={invalid || undefined}>
        <FieldLabel htmlFor="mkdir-name">Name</FieldLabel>
        <Input
          id="mkdir-name"
          autoComplete="off"
          data-1p-ignore
          autoFocus
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          placeholder="data or a/b/c"
          className="font-mono text-xs"
        />
        {invalid ? (
          <p className="text-sm text-destructive">“..” is not allowed.</p>
        ) : (
          <FieldDescription>Use / for nested folders.</FieldDescription>
        )}
      </Field>
    </DialogForm>
  )
}

function UploadProgress({
  state: { dir, done, total, failed, running, cancelled },
  onCancel,
  onDismiss,
}: {
  state: FolderUploadState
  onCancel: () => void
  onDismiss: () => void
}) {
  const pct = total ? Math.round((done / total) * 100) : 100
  return (
    <div className="space-y-2 border-b p-3 text-sm" role="status" aria-label="Folder upload">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate">
          {running ? (cancelled ? 'Cancelling…' : 'Uploading to ') : 'Uploaded to '}
          {!(running && cancelled) && <code className="font-mono text-xs">{dir}</code>}
          <span className="ml-2 text-muted-foreground tabular-nums">
            {done} / {total} files
            {failed.length > 0 && `, ${failed.length} failed`}
            {!running && cancelled && ', cancelled'}
          </span>
        </span>
        {running ? (
          <Button size="sm" variant="outline" disabled={cancelled} onClick={onCancel}>
            Cancel
          </Button>
        ) : (
          <Button size="icon-sm" variant="ghost" aria-label="Dismiss" onClick={onDismiss}>
            <XIcon />
          </Button>
        )}
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      {failed.length > 0 && (
        <ul className="max-h-32 overflow-auto font-mono text-xs text-destructive">
          {failed.map((f) => (
            <li key={f.path} className="break-all">
              {f.path}: {f.error}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
