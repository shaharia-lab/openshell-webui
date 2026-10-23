import { ExternalLinkIcon } from 'lucide-react'

import { CopyButton } from '@/components/common/copy-button'

export function ServiceUrl({ url }: { url?: string }) {
  if (!url) return <span className="text-muted-foreground">—</span>
  return (
    <span className="inline-flex max-w-full items-center gap-1">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-w-0 items-center gap-1 font-mono text-xs break-all hover:underline"
      >
        {url}
        <ExternalLinkIcon className="size-3 shrink-0" />
      </a>
      <CopyButton value={url} label="Copy URL" />
    </span>
  )
}
