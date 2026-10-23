import type * as React from 'react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface SelectOption<V extends string = string> {
  value: V
  label: React.ReactNode
}

interface SimpleSelectProps<V extends string> {
  value: V
  onValueChange: (value: V) => void
  options: SelectOption<V>[]
  placeholder?: string
  size?: 'sm' | 'default'
  className?: string
  disabled?: boolean
  id?: string
  'aria-label'?: string
}

/** A select over a fixed list of string options. */
export function SimpleSelect<V extends string>({
  value,
  onValueChange,
  options,
  placeholder,
  size,
  className,
  disabled,
  id,
  'aria-label': ariaLabel,
}: SimpleSelectProps<V>) {
  return (
    <Select
      value={value}
      onValueChange={(v) => v !== null && onValueChange(v as V)}
      items={options}
      disabled={disabled}
    >
      <SelectTrigger size={size} className={className} id={id} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
