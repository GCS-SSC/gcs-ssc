type BilingualRecord = object

/**
 * Resolves localized bilingual values from `{base}_en` / `{base}_fr` record fields.
 *
 * @returns Localized value resolver.
 */
export const useBilingualValue = () => {
  const { locale, t } = useI18n()

  /**
   * Resolves a localized bilingual value from an item record based on current locale.
   *
   * @param item - The data record containing bilingual fields.
   * @param keyBase - The base key name (e.g. 'name' resolves to 'name_en' or 'name_fr').
   * @param fallback - Optional fallback string when no bilingual values are found.
   * @returns The resolved localized string, or the fallback value.
   */
  const getBilingualValue: (item: BilingualRecord | null | undefined, keyBase: string, fallback?: string) => string = (
    item,
    keyBase,
    fallback = t('common.loading')
  ) => {
    if (!item) return fallback
    const record = item as Record<string, unknown>
    const localeKey = `${keyBase}_${locale.value}`
    const enKey = `${keyBase}_en`
    const frKey = `${keyBase}_fr`
    const localeValue = record[localeKey]
    if (typeof localeValue === 'string' && localeValue.trim()) return localeValue.trim()
    const enValue = record[enKey]
    if (typeof enValue === 'string' && enValue.trim()) return enValue.trim()
    const frValue = record[frKey]
    if (typeof frValue === 'string' && frValue.trim()) return frValue.trim()
    return fallback
  }

  return { getBilingualValue }
}
