import type { Money, MoneyInput } from '~~/shared/utils/money'

export type AgreementClaimReconciliationTableLine = {
  id: string
  name: string
  description?: string | null
  costCategory?: string
  costSubsection?: string
  submittedAmount: Money
  reconciledAmount: MoneyInput
  sampledAmount: MoneyInput
  balance?: Money
  rationale: string
  editable: boolean
}
