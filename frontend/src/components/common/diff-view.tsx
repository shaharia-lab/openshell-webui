import { diffLines } from 'diff'
import { useMemo } from 'react'

import { cn } from '@/lib/utils'

type Line = { kind: 'add' | 'del' | 'same' | 'gap'; text: string }

const CONTEXT = 3

/** Line-level diff of two texts, with unchanged runs folded to a few lines of context. */
export function DiffView({
  before,
  after,
  className,
}: {
  before: string
  after: string
  className?: string
}) {
  const lines = useMemo(() => {
    const out: Line[] = []
    for (const part of diffLines(before, after)) {
      const kind = part.added ? 'add' : part.removed ? 'del' : 'same'
      const text = part.value.replace(/\n$/, '').split('\n')
      if (kind !== 'same' || text.length <= CONTEXT * 2 + 1) {
        out.push(...text.map((t) => ({ kind, text: t }) as Line))
      } else {
        const first = out.length === 0
        if (!first) out.push(...text.slice(0, CONTEXT).map((t) => ({ kind, text: t }) as Line))
        out.push({
          kind: 'gap',
          text: `${text.length - (first ? CONTEXT : CONTEXT * 2)} unchanged lines`,
        })
        out.push(...text.slice(-CONTEXT).map((t) => ({ kind, text: t }) as Line))
      }
    }
    return out
  }, [before, after])

  if (before === after) return <p className="text-sm text-muted-foreground">No differences.</p>
  return (
    <pre
      className={cn(
        'max-h-[28rem] overflow-auto rounded-lg border bg-muted/30 py-2 font-mono text-xs leading-5',
        className,
      )}
    >
      {lines.map((l, i) => (
        <div
          key={i}
          className={cn(
            'px-3 whitespace-pre',
            l.kind === 'add' && 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
            l.kind === 'del' && 'bg-red-500/10 text-red-800 dark:text-red-300',
            l.kind === 'gap' && 'my-1 bg-muted py-0.5 text-center text-muted-foreground italic',
          )}
        >
          {l.kind === 'add' ? '+ ' : l.kind === 'del' ? '- ' : l.kind === 'same' ? '  ' : ''}
          {l.text}
        </div>
      ))}
    </pre>
  )
}
