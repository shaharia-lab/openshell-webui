import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { columnsFor } from '../columns'
import { DataTable } from '../data-table'

interface Row {
  name: string
  size: number
}
const col = columnsFor<Row>()
const columns = [col.accessor('name', { header: 'Name' }), col.accessor('size', { header: 'Size' })]
const data: Row[] = [
  { name: 'beta', size: 2 },
  { name: 'alpha', size: 1 },
  { name: 'gamma', size: 10 },
]
const names = () =>
  within(screen.getAllByRole('rowgroup')[1])
    .getAllByRole('row')
    .map((r) => within(r).getAllByRole('cell')[0].textContent)

describe('DataTable', () => {
  it('sorts by a column header', async () => {
    render(<DataTable data={data} columns={columns} />)
    expect(names()).toEqual(['beta', 'alpha', 'gamma'])
    await userEvent.click(screen.getByRole('button', { name: /Name/ }))
    expect(names()).toEqual(['alpha', 'beta', 'gamma'])
    // Numbers sort largest first on the first click.
    await userEvent.click(screen.getByRole('button', { name: /Size/ }))
    expect(names()).toEqual(['gamma', 'beta', 'alpha'])
    await userEvent.click(screen.getByRole('button', { name: /Size/ }))
    expect(names()).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('filters rows and explains an empty result', () => {
    const { rerender } = render(<DataTable data={data} columns={columns} filter="alp" />)
    expect(names()).toEqual(['alpha'])
    rerender(<DataTable data={data} columns={columns} filter="zzz" />)
    expect(screen.getByText('No rows match the filter.')).toBeInTheDocument()
  })

  it('calls onRowClick but not for clicks on buttons inside the row', async () => {
    const onRowClick = vi.fn()
    const withButton = [...columns, col.display({ id: 'x', cell: () => <button>act</button> })]
    render(<DataTable data={data.slice(0, 1)} columns={withButton} onRowClick={onRowClick} />)
    await userEvent.click(screen.getByRole('button', { name: 'act' }))
    expect(onRowClick).not.toHaveBeenCalled()
    await userEvent.click(screen.getByText('beta'))
    expect(onRowClick).toHaveBeenCalledWith(data[0])
  })
})
