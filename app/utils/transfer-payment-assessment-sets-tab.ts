import type { TransferPaymentAssessmentSetRecord } from '~~/shared/types/schemas/transfer-payment'

/**
 * Resolves the selected assessment set after the table rows change.
 *
 * @param currentId - Current selected assessment set id.
 * @param rows - Current assessment set rows.
 * @returns Current id when still present, otherwise the first row id or null.
 */
export const resolveSelectedAssessmentSetId = (
  currentId: string | null,
  rows: TransferPaymentAssessmentSetRecord[]
): string | null => {
  const firstId = rows[0]?.id ? String(rows[0].id) : null
  if (!currentId) {
    return firstId
  }

  return rows.some(item => String(item.id) === currentId) ? currentId : firstId
}
