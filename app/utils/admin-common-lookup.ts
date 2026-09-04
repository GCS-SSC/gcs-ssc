export interface AdminCommonLookupLabelOptions {
  valueKey: string
  labelEnKey: string
  labelFrKey: string
  locale: string
  showValueInLabel?: boolean
}

export interface AdminCommonLookupOption {
  value: string
  label: string
  raw: Record<string, unknown>
}

/**
 * Resolves the localized label value for a lookup item.
 *
 * @remarks
 * Uses French key when locale is `fr`, otherwise English key.
 *
 * @param item - Raw lookup item from API.
 * @param options - Lookup field configuration.
 * @returns Localized label text when present.
 *
 * @example
 * ```typescript
 * const label = resolveLookupLabel(item, options)
 * ```
 */
export const resolveLookupLabel = (
  item: Record<string, unknown>,
  options: AdminCommonLookupLabelOptions
): string => {
  const localizedKey = options.locale === 'fr' ? options.labelFrKey : options.labelEnKey
  const localizedValue = item[localizedKey]

  return typeof localizedValue === 'string' ? localizedValue : String(localizedValue ?? '')
}

/**
 * Formats a lookup option label as `id: name` for admin workflows.
 *
 * @remarks
 * Falls back to just `id` when label is empty or equal to id.
 *
 * @param item - Raw lookup item from API.
 * @param options - Lookup field configuration.
 * @returns Select-menu option payload.
 *
 * @example
 * ```typescript
 * const option = toAdminLookupOption(item, options)
 * ```
 */
export const toAdminLookupOption = (
  item: Record<string, unknown>,
  options: AdminCommonLookupLabelOptions
): AdminCommonLookupOption => {
  const value = String(item[options.valueKey] ?? '')
  const label = resolveLookupLabel(item, options).trim()
  const formattedLabel = options.showValueInLabel === false
    ? label || value
    : label.length > 0 && label !== value ? `${value}: ${label}` : value

  return {
    value,
    label: formattedLabel,
    raw: item
  }
}
