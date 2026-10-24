import { XIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import type { Provider } from '@/gen/datamodel'

interface ProviderPickerProps {
  providers: Provider[]
  value: string[]
  onChange: (names: string[]) => void
}

/**
 * Picks providers from a searchable, scrolling list, so a workspace with
 * hundreds of them stays usable. Selected ones show as removable chips.
 */
export function ProviderPicker({ providers, value, onChange }: ProviderPickerProps) {
  const toggle = (name: string) =>
    onChange(value.includes(name) ? value.filter((x) => x !== name) : [...value, name])
  const typeOf = new Map(providers.map((p) => [p.metadata?.name ?? '', p.type]))

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Selected providers">
          {value.map((name) => (
            <Badge key={name} variant="secondary" className="gap-1 pr-1">
              {name}
              <span className="text-muted-foreground">{typeOf.get(name)}</span>
              <button
                type="button"
                aria-label={`Remove ${name}`}
                className="rounded-sm opacity-60 hover:opacity-100"
                onClick={() => toggle(name)}
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Command className="rounded-lg! border bg-transparent">
        <CommandInput
          placeholder={`Search ${providers.length} provider${providers.length === 1 ? '' : 's'} by name or type`}
        />
        <CommandList className="max-h-44">
          <CommandEmpty>No provider matches.</CommandEmpty>
          {providers.map((p) => {
            const name = p.metadata?.name ?? ''
            const checked = value.includes(name)
            return (
              <CommandItem key={name} value={`${name} ${p.type}`} onSelect={() => toggle(name)}>
                <Checkbox
                  checked={checked}
                  tabIndex={-1}
                  aria-hidden
                  className="pointer-events-none"
                />
                <span className="font-medium">{name}</span>
                <span className="text-xs text-muted-foreground">{p.type}</span>
              </CommandItem>
            )
          })}
        </CommandList>
      </Command>
    </div>
  )
}
