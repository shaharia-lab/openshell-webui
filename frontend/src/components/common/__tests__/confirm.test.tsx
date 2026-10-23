import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ConfirmProvider } from '../confirm'
import { useConfirm, type ConfirmOptions } from '../confirm-context'

function Trigger(opts: ConfirmOptions) {
  const confirm = useConfirm()
  return <button onClick={() => confirm(opts)}>open</button>
}

const renderTrigger = (opts: ConfirmOptions) =>
  render(
    <ConfirmProvider>
      <Trigger {...opts} />
    </ConfirmProvider>,
  )

describe('ConfirmProvider', () => {
  it('requires the exact name before confirming', async () => {
    const onConfirm = vi.fn()
    renderTrigger({ title: 'Delete box?', confirmLabel: 'Delete', typeToConfirm: 'box', onConfirm })
    const user = userEvent.setup()
    await user.click(screen.getByText('open'))
    const submit = await screen.findByRole('button', { name: 'Delete' })
    expect(submit).toBeDisabled()
    await user.type(screen.getByLabelText(/to confirm/), 'bo')
    expect(submit).toBeDisabled()
    await user.type(screen.getByLabelText(/to confirm/), 'x')
    await user.click(submit)
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('keeps the dialog open and shows the error when the action fails', async () => {
    renderTrigger({
      title: 'Stop box?',
      confirmLabel: 'Stop',
      onConfirm: () => Promise.reject(new Error('permission denied')),
    })
    const user = userEvent.setup()
    await user.click(screen.getByText('open'))
    await user.click(await screen.findByRole('button', { name: 'Stop' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('permission denied')
    expect(screen.getByText('Stop box?')).toBeInTheDocument()
  })
})
