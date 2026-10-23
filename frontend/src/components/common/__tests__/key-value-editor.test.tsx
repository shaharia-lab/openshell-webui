import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm, useWatch } from 'react-hook-form'
import { describe, expect, it } from 'vitest'

import { KeyValueEditor } from '../key-value-editor'
import type { KeyValue } from '@/lib/validation'

/** The editor plus its current rows as JSON, to assert on. */
function Form() {
  const { control } = useForm<{ env: KeyValue[] }>({ defaultValues: { env: [] } })
  const env = useWatch({ control, name: 'env' })
  return (
    <>
      <KeyValueEditor control={control} name="env" />
      <output data-testid="value">{JSON.stringify(env)}</output>
    </>
  )
}

const value = () => JSON.parse(screen.getByTestId('value').textContent ?? '[]')

describe('KeyValueEditor', () => {
  it('adds rows and splits a pasted KEY=VALUE', async () => {
    render(<Form />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Add variable/ }))
    await user.click(screen.getByLabelText('Key'))
    await user.paste('API_URL=https://x.test/a=b')
    expect(value()).toEqual([{ key: 'API_URL', value: 'https://x.test/a=b' }])
    await user.click(screen.getByRole('button', { name: 'Remove row' }))
    expect(value()).toEqual([])
  })
})
