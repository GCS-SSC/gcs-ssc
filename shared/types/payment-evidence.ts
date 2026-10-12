import type { GcsExtensionPaymentCalculationResult } from '@gcs-ssc/extensions/server'
import type { Currency_Codes, Payment_Type } from './database'
import type { Money } from '../utils/money'
import type { FundingCaseAgreementCommitmentLineBalances } from './funding-case-agreement-ui'

/** Host financial basis retained on calculation and refreshed only while the Payment is editable. */
export interface PaymentEvidence {
  version: 1
  capturedAt: string
  selection: {
    fiscalYearId: string
    fiscalYearDisplay: string
    commitmentTypeId: string
    currency: Currency_Codes
    paymentType: Payment_Type
    periodStart: number
    periodEnd: number
    paymentAmount: Money
  }
  financialInputs: GcsExtensionPaymentCalculationResult
  commitmentBalances: FundingCaseAgreementCommitmentLineBalances
}
