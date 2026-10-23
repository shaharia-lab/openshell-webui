import { ArrowRightIcon, PlusIcon, XIcon } from 'lucide-react'
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

import { SimpleSelect } from '@/components/common/simple-select'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ACCESS_OPTIONS, emptyRuleRow, type RuleRow } from '@/lib/policy'

const accessOptions = ACCESS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))

interface RuleRowsEditorProps<T extends FieldValues> {
  control: Control<T>
  name: ArrayPath<T>
}

/** Rows of "binary may reach host:port with this access level". */
export function RuleRowsEditor<T extends FieldValues>({ control, name }: RuleRowsEditorProps<T>) {
  const { fields, append, remove } = useFieldArray({ control, name })
  const rows = (useWatch({ control, name: name as FieldPath<T> }) ?? []) as RuleRow[]

  return (
    <div className="space-y-2">
      {fields.map((f, i) => (
        <Controller
          key={f.id}
          control={control}
          name={`${name}.${i}.endpoint` as FieldPath<T>}
          render={({ field: ep, fieldState }) => (
            <div className="space-y-1 rounded-lg border bg-muted/30 p-2 sm:border-0 sm:bg-transparent sm:p-0">
              <div className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[minmax(0,1.2fr)_auto_minmax(0,1.4fr)_8.5rem_auto_auto] sm:items-center">
                <Controller
                  control={control}
                  name={`${name}.${i}.binary` as FieldPath<T>}
                  render={({ field }) => (
                    <Input
                      {...field}
                      aria-label="Binary path"
                      placeholder="/usr/bin/curl"
                      className="col-span-2 font-mono text-xs sm:col-span-1"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  )}
                />
                <ArrowRightIcon
                  className="hidden size-4 text-muted-foreground sm:block"
                  aria-hidden
                />
                <Input
                  {...ep}
                  aria-label="Host and port"
                  aria-invalid={fieldState.invalid || undefined}
                  placeholder="api.github.com:443"
                  className="col-span-2 font-mono text-xs sm:col-span-1"
                  autoComplete="off"
                  spellCheck={false}
                />
                <Controller
                  control={control}
                  name={`${name}.${i}.access` as FieldPath<T>}
                  render={({ field }) => (
                    <SimpleSelect
                      aria-label="Access"
                      className="w-full"
                      value={field.value}
                      onValueChange={field.onChange}
                      options={accessOptions}
                      disabled={rows[i]?.l4}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name={`${name}.${i}.l4` as FieldPath<T>}
                  render={({ field }) => (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Label className="gap-1.5 text-xs font-normal text-muted-foreground" />
                        }
                      >
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          aria-label="L4 pass-through"
                        />
                        L4
                      </TooltipTrigger>
                      <TooltipContent className="max-w-64">
                        L4 pass-through: no HTTP inspection, so no method control and no credential
                        injection.
                      </TooltipContent>
                    </Tooltip>
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove rule row"
                  onClick={() => remove(i)}
                >
                  <XIcon />
                </Button>
              </div>
              {fieldState.error && (
                <p className="text-xs text-destructive">{fieldState.error.message}</p>
              )}
            </div>
          )}
        />
      ))}
      <Button
        type="button"
        variant="outline"
        size="xs"
        onClick={() => append(emptyRuleRow() as FieldArray<T, ArrayPath<T>>)}
      >
        <PlusIcon /> Add rule
      </Button>
    </div>
  )
}
