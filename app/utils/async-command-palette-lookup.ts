type LookupItem = Record<string, unknown>

interface BuildAsyncLookupItemsOptions {
  valueKey: string
  labelEnKey: string
  labelFrKey: string
  descriptionEnKey?: string
  descriptionFrKey?: string
  locale: string
  icon: string
  onSelect: (item: LookupItem) => Promise<void> | void
}

/**
 * Resolves a trimmed preferred-language value with alternate-language fallback.
 *
 * @param item Lookup record.
 * @param locale Active locale.
 * @param enKey English field key.
 * @param frKey French field key.
 * @returns Localized lookup text.
 */
const getLocalizedLookupValue = (
  item: LookupItem,
  locale: string,
  enKey: string,
  frKey: string
): string => {
  const preferredKey = locale === 'fr' ? frKey : enKey
  const alternateKey = locale === 'fr' ? enKey : frKey
  const preferred = String(item[preferredKey] ?? '').trim()
  return preferred || String(item[alternateKey] ?? '').trim()
}

/**
 * Maps API lookup rows into Nuxt UI command palette items.
 *
 * @param items - Lookup rows returned by the API.
 * @param options - Mapping keys, locale, icon, and selection callback.
 * @returns Command palette item records.
 */
export const buildAsyncCommandPaletteLookupItems = (
  items: LookupItem[],
  options: BuildAsyncLookupItemsOptions
) => items.map(item => {
  return {
    id: String(item[options.valueKey] ?? ''),
    label: getLocalizedLookupValue(item, options.locale, options.labelEnKey, options.labelFrKey),
    description: options.descriptionEnKey && options.descriptionFrKey
      ? getLocalizedLookupValue(item, options.locale, options.descriptionEnKey, options.descriptionFrKey)
      : undefined,
    icon: options.icon,
    onSelect: async () => await options.onSelect(item)
  }
})
