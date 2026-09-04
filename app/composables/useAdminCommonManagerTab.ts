/* eslint-disable jsdoc/require-jsdoc -- exported manager helpers are self-descriptive */
import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { useJsonFieldHelpers } from './useJsonFieldHelpers'
import type {
  AdminCommonGenericItem,
  AdminCommonSelectOption
} from '~~/shared/types/admin-common-ui'

export const useAdminCommonManagerTab = () => {
  const { t } = useI18n()
  const { toJsonTextareaValue, parseJsonTextareaValue } = useJsonFieldHelpers()

  const deletedFilter: Ref<string> = ref('all')

  const statusFilterItems = computed<AdminCommonSelectOption[]>(() => [
    { label: t('common.all'), value: 'all' },
    { label: t('common.active'), value: 'active' },
    { label: t('common.deleted'), value: 'deleted' }
  ])

  const toNumberInputValue = (value: unknown): string | number | undefined => {
    if (typeof value === 'number' || typeof value === 'string') {
      return value
    }

    return undefined
  }

  const toDateInputValue = (value: unknown): string | undefined => {
    if (typeof value === 'string') {
      return value
    }

    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        return undefined
      }

      const year = value.getFullYear().toString().padStart(4, '0')
      const month = String(value.getMonth() + 1).padStart(2, '0')
      const day = String(value.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }

    return undefined
  }

  const getRowStringValue = (row: AdminCommonGenericItem, key: string): string => {
    const value = row[key]
    return typeof value === 'string' ? value : ''
  }

  const isCanadianAddress = (state: Partial<AdminCommonGenericItem>): boolean => {
    return String(state.egcs_cn_addresscountry ?? '').toLowerCase() === 'ca'
  }

  const updateAddressCountry = (
    state: Partial<AdminCommonGenericItem>,
    value: string | number | undefined
  ): void => {
    const previousCountry = String(state.egcs_cn_addresscountry ?? '').toLowerCase()
    const nextCountry = String(value ?? '').toLowerCase()

    state.egcs_cn_addresscountry = nextCountry

    if (previousCountry !== nextCountry) {
      state.egcs_cn_addresssubdivision = ''
    }
  }

  return {
    t,
    deletedFilter,
    statusFilterItems,
    toJsonTextareaValue,
    parseJsonTextareaValue,
    toNumberInputValue,
    toDateInputValue,
    getRowStringValue,
    isCanadianAddress,
    updateAddressCountry
  }
}
