import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  metaHelper,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  type ColumnDef,
  type RowData,
} from '@tanstack/react-table'

interface ColumnMeta {
  /** Classes for the header and the cells of this column. */
  className?: string
}

/** Features every WebUI table registers: client sorting and text filtering. */
export const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    text: sortFn_text,
    datetime: sortFn_datetime,
    basic: sortFn_basic,
  },
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString },
  columnMeta: metaHelper<ColumnMeta>(),
})

export type Features = typeof features
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Column<T extends RowData> = ColumnDef<Features, T, any>

/** Typed column builder for a DataTable over rows of type T. */
export const columnsFor = <T extends RowData>() => createColumnHelper<Features, T>()
