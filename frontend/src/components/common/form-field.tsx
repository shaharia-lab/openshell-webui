import type * as React from 'react'
import {
  Controller,
  type Control,
  type ControllerRenderProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form'

import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'

interface FormFieldProps<T extends FieldValues, N extends FieldPath<T>> {
  control: Control<T>
  name: N
  label: React.ReactNode
  description?: React.ReactNode
  /** Renders the input; spread `field` and pass `id` and `aria-invalid`. */
  render: (props: {
    field: ControllerRenderProps<T, N>
    id: string
    invalid: boolean
  }) => React.ReactNode
  className?: string
}

/** A labelled react-hook-form field with its description and error. */
export function FormField<T extends FieldValues, N extends FieldPath<T>>({
  control,
  name,
  label,
  description,
  render,
  className,
}: FormFieldProps<T, N>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const id = `f-${name.replace(/\W/g, '-')}`
        return (
          <Field data-invalid={fieldState.invalid || undefined} className={className}>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            {render({ field, id, invalid: fieldState.invalid })}
            {description && <FieldDescription>{description}</FieldDescription>}
            <FieldError errors={[fieldState.error]} />
          </Field>
        )
      }}
    />
  )
}
