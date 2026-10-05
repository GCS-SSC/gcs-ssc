import type { AccountReceivableDetail, AccountReceivableRow } from '~~/shared/types/account-receivable'
import type { Money } from '~~/shared/utils/money'
import { accountReceivableReference } from '~/utils/account-receivable-display'

export type AccountReceivableAdjustmentRow = {
  id: string
  reference: string
  createdAt: string
  amount: Money | null
  adjustment: AccountReceivableRow
}

/**
 * Shows approved signed changes to this receivable. Proponent credit entries are
 * independent ledger records and cannot be treated as payments of this AR.
 * @param receivable - Authorized detail with its linked adjustments.
 * @returns Adjustment rows with no amount implied for unapproved proposals.
 */
export const buildAccountReceivableAdjustmentRows = (receivable: Pick<AccountReceivableDetail, 'egcs_fc_adjustments'>): AccountReceivableAdjustmentRow[] =>
  receivable.egcs_fc_adjustments.map(adjustment => ({
    id: adjustment.id,
    adjustment,
    reference: accountReceivableReference(adjustment),
    createdAt: adjustment.egcs_fc_createdat,
    amount: adjustment.egcs_fc_outcome === 'posted' ? adjustment.egcs_fc_approvedamount : null
  })).sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id))
