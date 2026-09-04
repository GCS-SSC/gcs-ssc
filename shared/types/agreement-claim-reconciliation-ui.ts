import type { Money } from '~~/shared/utils/money'

export type AgreementClaimReconciliationTableLine = {
  id: string
  name: string
  description?: string | null
  costCategory?: string
  costSubsection?: string
  submittedAmount: Money
  reconciledAmount: string
  sampledAmount: string | null
  balance?: Money
  rationale: string
  editable: boolean
}
