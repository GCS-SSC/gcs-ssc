/* eslint-disable jsdoc/require-jsdoc */
import { ref } from 'vue'
import type { Ref } from 'vue'

type TablePaginationState = {
  pageIndex: number
  pageSize: number
}

export const useTableListState = (pageSize = 25): {
  search: Ref<string>
  pagination: Ref<TablePaginationState>
} => ({
  search: ref(''),
  pagination: ref({ pageIndex: 0, pageSize })
})
