import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

export type WorkspaceDataTableColumn<T> = {
  key: string
  header: string
  width?: string
  align?: 'left' | 'center' | 'right'
  headerClassName?: string
  cellClassName?: string
  cell: (row: T) => ReactNode
}

export interface WorkspaceDataTableProps<T> {
  columns: WorkspaceDataTableColumn<T>[]
  rows: T[]
  totalCount: number
  currentPage: number
  pageSize: number
  onPageChange: (page: number) => void
  getRowKey: (row: T, index: number) => string
  emptyState: ReactNode
  maxBodyHeightClassName?: string
}

export function WorkspaceDataTable<T>({
  columns,
  rows,
  totalCount,
  currentPage,
  pageSize,
  onPageChange,
  getRowKey,
  emptyState,
  maxBodyHeightClassName,
}: WorkspaceDataTableProps<T>) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const pageItems = buildPaginationItems(currentPage, totalPages)
  const rangeStart = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const rangeEnd = totalCount === 0 ? 0 : Math.min(currentPage * pageSize, totalCount)

  return (
    <div className="ref-data-table-shell">
      <div className="ref-data-table-frame">
        <ScrollArea className={cn('ref-data-table-scroll', maxBodyHeightClassName)}>
          {rows.length > 0 ? (
            <table className="ref-data-table-grid">
              <colgroup>
                {columns.map((column) => (
                  <col key={column.key} style={column.width ? { width: column.width } : undefined} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {columns.map((column, index) => (
                    <th
                      className={cn(
                        'ref-data-table-header-cell',
                        column.align === 'center' && 'is-center',
                        column.align === 'right' && 'is-right',
                        index > 0 && 'has-divider',
                        column.headerClassName,
                      )}
                      key={column.key}
                      scope="col"
                    >
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr className="ref-data-table-row" key={getRowKey(row, rowIndex)}>
                    {columns.map((column, columnIndex) => (
                      <td
                        className={cn(
                          'ref-data-table-cell',
                          column.align === 'center' && 'is-center',
                          column.align === 'right' && 'is-right',
                          columnIndex > 0 && 'has-divider',
                          column.cellClassName,
                        )}
                        key={column.key}
                      >
                        {column.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="ref-data-table-empty">{emptyState}</div>
          )}
        </ScrollArea>
      </div>

      <div className="ref-section-table-footer">
        <span>
          {rangeStart}-{rangeEnd} / {totalCount}
        </span>
        <div className="ref-section-pagination">
          <Button
            className="ref-section-more-action"
            disabled={currentPage === 1}
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            {'<'}
          </Button>
          {pageItems.map((item, index) =>
            item === 'ellipsis' ? (
              <span className="ref-section-pagination-ellipsis" key={`ellipsis-${index}`}>
                ...
              </span>
            ) : (
              <button
                className={`ref-section-page-chip ${item === currentPage ? 'is-active' : ''}`}
                key={item}
                onClick={() => onPageChange(item)}
                type="button"
              >
                {item}
              </button>
            ),
          )}
          <Button
            className="ref-section-more-action"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            {'>'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function buildPaginationItems(currentPage: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 1) return [1]
  if (totalPages <= 6) return Array.from({ length: totalPages }, (_, index) => index + 1)
  if (currentPage <= 3) return [1, 2, 3, 'ellipsis', totalPages]
  if (currentPage >= totalPages - 2) return [1, 'ellipsis', totalPages - 2, totalPages - 1, totalPages]
  return [1, 'ellipsis', currentPage, currentPage + 1, 'ellipsis', totalPages]
}
