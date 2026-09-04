import type { TransferPaymentStreamChartOfAccountDimension } from '../types/schemas/transfer-payment'

export type AccountingDimensionLocale = 'en' | 'fr'

/**
 * Formats one ordered accounting dimension in the requested language.
 *
 * @param dimension - Dimension to format.
 * @param locale - Requested label language.
 * @returns Localized name and persisted value.
 */
export const formatAccountingDimension = (
  dimension: TransferPaymentStreamChartOfAccountDimension,
  locale: AccountingDimensionLocale
) => `${locale === 'fr' ? dimension.label_fr : dimension.label_en} ${dimension.value}`

/**
 * Formats all dimensions while preserving their configured order.
 *
 * @param dimensions - Ordered accounting dimensions.
 * @param locale - Requested label language.
 * @param separator - Text placed between dimensions.
 * @returns Joined localized dimension text.
 */
export const formatAccountingDimensions = (
  dimensions: TransferPaymentStreamChartOfAccountDimension[],
  locale: AccountingDimensionLocale,
  separator = ' | '
) => dimensions.map(dimension => formatAccountingDimension(dimension, locale)).join(separator)

/**
 * Returns every persisted label and value for locale-independent client filtering.
 *
 * @param dimensions - Accounting dimensions to flatten.
 * @returns English labels, French labels, and values.
 */
export const getAccountingDimensionSearchValues = (
  dimensions: TransferPaymentStreamChartOfAccountDimension[]
) => dimensions.flatMap(dimension => [dimension.label_en, dimension.label_fr, dimension.value])
