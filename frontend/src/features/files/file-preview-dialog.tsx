import { useQuery } from '@tanstack/react-query'
import { DownloadIcon, PencilIcon } from 'lucide-react'
import { useState } from 'react'

import { useFileActions } from './use-file-actions'
import { api } from '@/api/client'
import { CodeEditor } from '@/components/common/code-editor'
import { ErrorAlert } from '@/components/common/error-alert'
import { DialogForm, FormDialog } from '@/components/common/form-dialog'
import { LoadingRows } from '@/components/common/query-view'
import { Button } from '@/components/ui/button'
import { useCanWrite } from '@/hooks/use-scope'
import { formatBytes } from '@/lib/path'
import type { SandboxRef } from '@/lib/sandbox'

/** Files up to this size open in the preview. */
export const MAX_PREVIEW = 1024 * 1024

const languageOf = (path: string) =>
  /\.ya?ml$/i.test(path) ? 'yaml' : /\.json$/i.test(path) ? 'json' : 'text'

/** Decodes a blob as UTF-8 text, or returns null for binary content. */
async function asText(blob: Blob): Promise<string | null> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  if (bytes.subarray(0, 8192).includes(0)) return null
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

interface FilePreviewDialogProps {
  gw: string
  sandboxRef: SandboxRef
  file: { path: string; size: number } | null
  onOpenChange: (open: boolean) => void
}

/** Shows a text file, and lets the user edit and save it. */
export function FilePreviewDialog({ gw, sandboxRef, file, onOpenChange }: FilePreviewDialogProps) {
  return (
    <FormDialog
      open={!!file}
      onOpenChange={onOpenChange}
      size="xl"
      title={<span className="font-mono text-sm break-all">{file?.path}</span>}
      description={file && formatBytes(file.size)}
    >
      {file && (
        <Preview gw={gw} sandboxRef={sandboxRef} file={file} onDone={() => onOpenChange(false)} />
      )}
    </FormDialog>
  )
}

function Preview({
  gw,
  sandboxRef,
  file,
  onDone,
}: {
  gw: string
  sandboxRef: SandboxRef
  file: { path: string; size: number }
  onDone: () => void
}) {
  const { workspace: ws, name } = sandboxRef
  const canWrite = useCanWrite()
  const content = useQuery({
    queryKey: ['file-content', gw, ws, name, file.path],
    queryFn: async () => asText(await api.files.read(gw, ws, name, file.path)),
    gcTime: 0,
    retry: false,
  })
  const { write } = useFileActions(gw, sandboxRef)
  const [draft, setDraft] = useState<string | null>(null)
  const editing = draft !== null

  const download = (
    <Button
      variant="outline"
      render={<a href={api.files.contentUrl(gw, ws, name, file.path)} download />}
      nativeButton={false}
    >
      <DownloadIcon /> Download
    </Button>
  )

  return (
    <DialogForm
      submitLabel="Save"
      cancelLabel={editing ? 'Cancel' : 'Close'}
      submitDisabled={!editing || draft === content.data}
      pending={write.isPending}
      error={write.error}
      extraActions={
        <>
          {download}
          {canWrite && content.data != null && !editing && (
            <Button type="button" variant="outline" onClick={() => setDraft(content.data ?? '')}>
              <PencilIcon /> Edit
            </Button>
          )}
        </>
      }
      onSubmit={(e) => {
        e.preventDefault()
        if (draft !== null) write.mutate({ path: file.path, text: draft }, { onSuccess: onDone })
      }}
    >
      {content.isPending ? (
        <LoadingRows rows={8} />
      ) : content.isError ? (
        <ErrorAlert error={content.error} title="Could not read the file" />
      ) : content.data === null ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          This is a binary file. Download it to open it.
        </p>
      ) : (
        <CodeEditor
          aria-label={file.path}
          value={draft ?? content.data}
          onChange={setDraft}
          readOnly={!editing}
          language={languageOf(file.path)}
          height="min(60dvh, 36rem)"
        />
      )}
    </DialogForm>
  )
}
