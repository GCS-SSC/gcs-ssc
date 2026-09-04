import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import type { TableColumn } from '@nuxt/ui'

export type LocaleAccessorKey = {
  en: string
  fr: string
}

export type TableColumnInput<T> = TableColumn<T> & {
  headerKey?: string
  accessorKey?: string
}

export type BilingualColumnConfig<T> = {
  id: string
  accessorKey: {
    en: Extract<keyof T, string> | string
    fr: Extract<keyof T, string> | string
  }
  headerKey?: string
  header?: string
}

/**
 * Resolves the appropriate accessor key for a column based on the current locale.
 *
 * @param {BilingualColumnConfig<T>['accessorKey']} accessorKey - The bilingual mapping of accessor keys (en/fr).
 * @param {string} locale - The current active locale (e.g., 'en' or 'fr').
 * @returns {string} The resolved key for the current locale.
 */
const resolveAccessorKey = <T>(accessorKey: BilingualColumnConfig<T>['accessorKey'], locale: string): string => {
  return locale === 'fr' ? accessorKey.fr : accessorKey.en
}

/**
 * Resolves localized table columns, including bilingual accessor switching.
 *
 * @param columns - Base table column definitions.
 * @param bilingualColumns - Optional bilingual accessor mapping config.
 * @returns Localized table columns.
 */
export const useTableColumns = <T>(
  columns: TableColumnInput<T>[],
  bilingualColumns?: BilingualColumnConfig<T>[]
): ComputedRef<TableColumn<T>[]> => {
  const { t, locale } = useI18n()

  return computed(() => {
    const bilingualMap = new Map<string, BilingualColumnConfig<T>>()
    bilingualColumns?.forEach(config => {
      bilingualMap.set(config.id, config)
    })

    return columns.map(column => {
      const bilingual = column.id ? bilingualMap.get(String(column.id)) : undefined
      const { headerKey, accessorKey: baseAccessorKey, ...rest } = column as TableColumnInput<T>
      const resolvedHeaderKey = headerKey ?? bilingual?.headerKey
      const header = column.header ?? (resolvedHeaderKey ? t(resolvedHeaderKey) : bilingual?.header)
      const accessorKey = bilingual ? resolveAccessorKey(bilingual.accessorKey, locale.value) : baseAccessorKey

      // Nuxt UI TableColumn typing is strict; cast after resolving localized header/accessor keys.
      const resolvedColumn = {
        ...rest,
        header
      } as TableColumnInput<T>

      if (accessorKey) {
        (resolvedColumn as TableColumnInput<T>).accessorKey = accessorKey
      }

      return resolvedColumn as TableColumn<T>
    })
  })
}
