import { PlusIcon, XIcon } from 'lucide-react'
import {
  Controller,
  useFieldArray,
  useWatch,
  type ArrayPath,
  type Control,
  type FieldArray,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { KeyValue } from '@/lib/validation'

interface KeyValueEditorProps<T extends FieldValues> {
  control: Control<T>
  /** Path of an array of {key, value} rows in the form. */
  name: ArrayPath<T>
  addLabel?: string
  keyPlaceholder?: string
  valuePlaceholder?: string
  /** Mask the values (credentials). */
  secret?: boolean
}

/** Editable KEY = value rows. Pasting KEY=VALUE into a key fills both fields. */
export function KeyValueEditor<T extends FieldValues>({
  control,
  name,
  addLabel = 'Add variable',
  keyPlaceholder = 'KEY',
  valuePlaceholder = 'value',
  secret,
}: KeyValueEditorProps<T>) {
  const { fields, append, remove, update } = useFieldArray({ control, name })
  const rows = (useWatch({ control, name: name as FieldPath<T> }) ?? []) as KeyValue[]

  return (
    <div className="space-y-2">
      {fields.map((f, i) => (
        <div
          key={f.id}
          className="grid grid-cols-[minmax(0,2fr)_auto_minmax(0,3fr)_auto] items-start gap-2"
        >
          <Controller
            control={control}
            name={`${name}.${i}.key` as FieldPath<T>}
            render={({ field, fieldState }) => (
              <div className="space-y-1">
                <Input
                  {...field}
                  aria-label="Key"
                  aria-invalid={fieldState.invalid || undefined}
                  className="font-mono text-xs"
                  placeholder={keyPlaceholder}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => {
                    const v = e.target.value
                    const eq = v.indexOf('=')
                    if (eq > 0 && !rows[i]?.value)
                      update(i, {
                        key: v.slice(0, eq).trim(),
                        value: v.slice(eq + 1),
                      } as FieldArray<T, ArrayPath<T>>)
                    else field.onChange(v)
                  }}
                />
                {fieldState.error && (
                  <p className="text-xs text-destructive">{fieldState.error.message}</p>
                )}
              </div>
            )}
          />
          <span className="pt-1.5 text-muted-foreground">=</span>
          <Controller
            control={control}
            name={`${name}.${i}.value` as FieldPath<T>}
            render={({ field }) => (
              <Input
                {...field}
                aria-label="Value"
                type={secret ? 'password' : 'text'}
                data-1p-ignore={secret || undefined}
                autoComplete={secret ? 'new-password' : 'off'}
                spellCheck={false}
                placeholder={valuePlaceholder}
              />
            )}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Remove row"
            onClick={() => remove(i)}
          >
            <XIcon />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="xs"
        onClick={() => append({ key: '', value: '' } as FieldArray<T, ArrayPath<T>>)}
      >
        <PlusIcon /> {addLabel}
      </Button>
    </div>
  )
}
