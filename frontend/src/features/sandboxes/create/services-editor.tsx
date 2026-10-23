import { PlusIcon, XIcon } from 'lucide-react'
import {
  Controller,
  useFieldArray,
  type ArrayPath,
  type Control,
  type FieldArray,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form'

import { SimpleSelect } from '@/components/common/simple-select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { type ServiceRow } from './services'
import { AUTH_MODE_OPTIONS } from '@/features/services/auth-modes'

export function ServicesEditor<T extends FieldValues>({
  control,
  name,
}: {
  control: Control<T>
  name: ArrayPath<T>
}) {
  const { fields, append, remove } = useFieldArray({ control, name })
  return (
    <div className="space-y-2">
      {fields.map((f, i) => (
        <div
          key={f.id}
          className="grid grid-cols-[minmax(0,1fr)_6rem_minmax(0,1.3fr)_auto] items-start gap-2"
        >
          <Controller
            control={control}
            name={`${name}.${i}.name` as FieldPath<T>}
            render={({ field, fieldState }) => (
              <div className="space-y-1">
                <Input
                  {...field}
                  aria-label="Service name"
                  placeholder="web (optional)"
                  aria-invalid={fieldState.invalid || undefined}
                />
                {fieldState.error && (
                  <p className="text-xs text-destructive">{fieldState.error.message}</p>
                )}
              </div>
            )}
          />
          <Controller
            control={control}
            name={`${name}.${i}.port` as FieldPath<T>}
            render={({ field, fieldState }) => (
              <div className="space-y-1">
                <Input
                  {...field}
                  aria-label="Port"
                  inputMode="numeric"
                  placeholder="8080"
                  aria-invalid={fieldState.invalid || undefined}
                />
                {fieldState.error && (
                  <p className="text-xs text-destructive">{fieldState.error.message}</p>
                )}
              </div>
            )}
          />
          <Controller
            control={control}
            name={`${name}.${i}.auth` as FieldPath<T>}
            render={({ field }) => (
              <SimpleSelect
                aria-label="Authorization"
                className="w-full"
                value={field.value}
                onValueChange={field.onChange}
                options={AUTH_MODE_OPTIONS}
              />
            )}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Remove service"
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
        onClick={() =>
          append({
            name: '',
            port: '',
            auth: 'SERVICE_AUTHORIZATION_MODE_STRIP',
          } satisfies ServiceRow as FieldArray<T, ArrayPath<T>>)
        }
      >
        <PlusIcon /> Expose a port
      </Button>
    </div>
  )
}
