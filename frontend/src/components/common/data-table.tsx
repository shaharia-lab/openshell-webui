import { useTable, type RowData, type SortingState } from '@tanstack/react-table'
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { features, type Column } from './columns'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

interface DataTableProps<T extends RowData> {
  data: T[]
  columns: Column<T>[]
  /** Text filter applied to every column's accessor value. */
  filter?: string
  empty?: ReactNode
  getRowId?: (row: T) => string
  onRowClick?: (row: T) => void
  rowClassName?: (row: T) => string | undefined
  initialSorting?: SortingState
  className?: string
}

/**
 * A sortable table. Columns with an accessor sort by clicking their header;
 * display-only columns (actions) set enableSorting: false.
 */
export function DataTable<T extends RowData>({
  data,
  columns,
  filter,
  empty = 'Nothing here.',
  getRowId,
  onRowClick,
  rowClassName,
  initialSorting = [],
  className,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting)
  const table = useTable({
    features,
    data,
    columns,
    state: { sorting, globalFilter: filter ?? '' },
    onSortingChange: setSorting,
    onGlobalFilterChange: () => {},
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
    globalFilterFn: 'includesString',
  })
  const rows = table.getRowModel().rows

  return (
    <div className={cn('overflow-x-auto', className)}>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id} className="hover:bg-transparent">
              {hg.headers.map((h) => {
                const sortable = h.column.getCanSort()
                const dir = h.column.getIsSorted()
                return (
                  <TableHead
                    key={h.id}
                    className={cn(
                      'px-4 text-xs text-muted-foreground',
                      h.column.columnDef.meta?.className,
                    )}
                    aria-sort={dir ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    {h.isPlaceholder ? null : sortable ? (
                      <button
                        type="button"
                        className="-ml-1 inline-flex items-center gap-1 rounded px-1 hover:text-foreground"
                        onClick={h.column.getToggleSortingHandler()}
                      >
                        <table.FlexRender header={h} />
                        {dir === 'asc' ? (
                          <ArrowUpIcon className="size-3" />
                        ) : dir === 'desc' ? (
                          <ArrowDownIcon className="size-3" />
                        ) : (
                          <ArrowUpDownIcon className="size-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      <table.FlexRender header={h} />
                    )}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length ? (
            rows.map((row) => (
              <TableRow
                key={row.id}
                className={cn(onRowClick && 'cursor-pointer', rowClassName?.(row.original))}
                onClick={
                  onRowClick
                    ? (e) => {
                        // Buttons and links inside a row do their own thing.
                        if ((e.target as HTMLElement).closest('button,a,input,[role=menuitem]'))
                          return
                        onRowClick(row.original)
                      }
                    : undefined
                }
              >
                {row.getAllCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cn('px-4 align-top', cell.column.columnDef.meta?.className)}
                  >
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={columns.length}
                className="px-4 py-8 text-center text-muted-foreground"
              >
                {filter ? 'No rows match the filter.' : empty}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
