import type { Ref, ComputedRef } from 'vue'
import type { FetchError } from 'ofetch'
import type { ListResponse } from './admin'

export type ResourceTableStatus = 'idle' | 'pending' | 'success' | 'error'

export interface UseResourceTableOptions {
  fetchUrl: string | Ref<string> | ComputedRef<string>
  query?: Record<string, unknown> | Ref<Record<string, unknown>> | ComputedRef<Record<string, unknown>>
  initialPageSize?: number
  initialStatusFilter?: string
  enabled?: boolean | Ref<boolean> | ComputedRef<boolean>
}

export interface ResourceTableReturn<T> {
  search: Ref<string>
  statusFilter: Ref<string>
  pagination: Ref<{ pageIndex: number; pageSize: number }>
  columnFilters: Ref<Array<Record<string, unknown>>>
  columnVisibility: Ref<Record<string, boolean>>
  rowSelection: Ref<Record<string, boolean>>
  items: ComputedRef<T[]>
  totalRecords: ComputedRef<number>
  response: Ref<ListResponse<T> | null | undefined>
  responseQuery: ComputedRef<Record<string, unknown> | undefined>
  refresh: () => Promise<void>
  retry: () => Promise<void>
  status: Ref<ResourceTableStatus>
  error: Ref<FetchError | undefined>
}
