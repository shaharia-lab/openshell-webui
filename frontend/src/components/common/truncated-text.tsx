import { toast } from 'sonner'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { shortImage } from '@/lib/format'
import { cn } from '@/lib/utils'

interface TruncatedTextProps {
  /** The full value: shown on hover and copied on click. */
  value: string
  /** What to show in place, usually a shortened form of the value. */
  display: string
  /** What the toast calls the value, e.g. "image". */
  what?: string
  className?: string
}

/**
 * A long value shown shortened, so it cannot widen its table or card. Hover
 * shows the whole value; a click copies it.
 */
export function TruncatedText({ value, display, what = 'value', className }: TruncatedTextProps) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(`Copied ${what}`, { description: value })
    } catch {
      toast.error(`Could not copy the ${what}`)
    }
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={`Copy ${what} ${value}`}
            className={cn(
              'max-w-full cursor-copy truncate rounded text-left font-mono text-xs hover:underline hover:decoration-dotted',
              className,
            )}
          />
        }
        onClick={(e) => {
          e.stopPropagation()
          void copy()
        }}
      >
        {display}
      </TooltipTrigger>
      <TooltipContent className="max-w-md flex-col items-start font-mono break-all">
        {value}
        <span className="block font-sans text-[11px] opacity-70">Click to copy</span>
      </TooltipContent>
    </Tooltip>
  )
}

/** An image reference shown as `name:tag`; hover for the full reference, click to copy. */
export function ImageRef({
  image,
  max,
  className,
}: {
  image?: string
  /** Longest shown form, in characters. */
  max?: number
  className?: string
}) {
  if (!image) return <span className="text-xs text-muted-foreground">default</span>
  return (
    <TruncatedText
      value={image}
      display={shortImage(image, max)}
      what="image"
      className={className}
    />
  )
}
