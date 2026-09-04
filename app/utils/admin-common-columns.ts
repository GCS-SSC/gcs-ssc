import type { BilingualColumnConfig, TableColumnInput } from '../composables/useTableColumns'
import type { AdminCommonGenericItem } from '../../shared/types/admin-common-ui'

const NAME_EN_SUFFIX = '_name_en'
const NAME_FR_SUFFIX = '_name_fr'

/**
 * Resolves the matching French name key for an English name key.
 *
 * @remarks
 * The convention is `*_name_en` paired with `*_name_fr`.
 *
 * @param key - Candidate column key.
 * @returns Matching French key when the input is an English name key.
 *
 * @example
 * ```typescript
 * const frKey = toFrenchNameKey('egcs_cn_name_en')
 * ```
 */
const toFrenchNameKey = (key: string): string | null => {
  if (!key.endsWith(NAME_EN_SUFFIX)) {
    return null
  }

  return `${key.slice(0, -NAME_EN_SUFFIX.length)}${NAME_FR_SUFFIX}`
}

/**
 * Resolves the matching English name key for a French name key.
 *
 * @remarks
 * The convention is `*_name_fr` paired with `*_name_en`.
 *
 * @param key - Candidate column key.
 * @returns Matching English key when the input is a French name key.
 *
 * @example
 * ```typescript
 * const enKey = toEnglishNameKey('egcs_cn_name_fr')
 * ```
 */
const toEnglishNameKey = (key: string): string | null => {
  if (!key.endsWith(NAME_FR_SUFFIX)) {
    return null
  }

  return `${key.slice(0, -NAME_FR_SUFFIX.length)}${NAME_EN_SUFFIX}`
}

/**
 * Builds table and bilingual column config for admin-common resource tables.
 *
 * @remarks
 * Any `*_name_en` key with a matching `*_name_fr` key is represented as a
 * single `name` column with localized primary/secondary display.
 *
 * @param columnKeys - Ordered list of column keys configured for the table.
 * @param availableFieldKeys - All available field keys for the resource.
 * @returns Resolved table columns and bilingual column config.
 *
 * @example
 * ```typescript
 * const result = buildAdminCommonColumns(['egcs_cn_name_en'], ['egcs_cn_name_en', 'egcs_cn_name_fr'])
 * ```
 */
export const buildAdminCommonColumns = (
  columnKeys: string[],
  availableFieldKeys: string[]
): {
  columns: TableColumnInput<AdminCommonGenericItem>[]
  bilingualColumns: BilingualColumnConfig<AdminCommonGenericItem>[]
} => {
  const fieldKeySet = new Set(availableFieldKeys)
  const columnKeySet = new Set(columnKeys)
  const dynamicColumns: TableColumnInput<AdminCommonGenericItem>[] = []
  const bilingualColumns: BilingualColumnConfig<AdminCommonGenericItem>[] = []

  for (const key of columnKeys) {
    const englishNameKey = toEnglishNameKey(key)
    if (englishNameKey && columnKeySet.has(englishNameKey)) {
      continue
    }

    const frenchNameKey = toFrenchNameKey(key)
    const hasFrenchPair = !!frenchNameKey && fieldKeySet.has(frenchNameKey)

    if (hasFrenchPair) {
      const bilingualColumnId = `${frenchNameKey.slice(0, -NAME_FR_SUFFIX.length)}_name`
      dynamicColumns.push({
        id: bilingualColumnId,
        accessorKey: key,
        headerKey: 'common.name'
      })
      bilingualColumns.push({
        id: bilingualColumnId,
        accessorKey: {
          en: key,
          fr: frenchNameKey
        }
      })
      continue
    }

    dynamicColumns.push({
      id: key,
      accessorKey: key,
      headerKey: `admin_common.fields.${key}`
    })
  }

  return {
    columns: [
      { id: 'id', accessorKey: 'id', headerKey: 'common.id' },
      ...dynamicColumns,
      { id: '_deleted', accessorKey: '_deleted', headerKey: 'admin_common.fields._deleted' },
      { id: 'actions', headerKey: 'common.actions' }
    ],
    bilingualColumns
  }
}
