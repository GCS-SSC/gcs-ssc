import type { AccountReceivableRecoveryMethod } from '../utils/account-receivable'
import type { Money } from '../utils/money'
import type { Currency_Codes } from './database'
import type { AccountReceivableOffsetMemoApplication } from './account-receivable'

/** Retained debit evidence; credits are not matched to individual receivables. */
export type ProponentAccountReceivableRow = {
  id: string
  egcs_fc_fundingagreement: string
  egcs_fc_agreementnumber: string
  egcs_fc_number: number
  egcs_fc_linkedreceivable: string | null
  egcs_fc_status: string
  egcs_fc_currency: Currency_Codes
  egcs_fc_typename_en: string
  egcs_fc_typename_fr: string
  egcs_fc_fiscalyeardisplay: string
  egcs_fc_originalamount: Money
  egcs_fc_approvedamount: Money
  egcs_fc_effectiverecoverymethod: AccountReceivableRecoveryMethod | null
}

/** Independent credits and Payment offset plans share Proponent/Agency/currency context. */
export type ProponentCreditMemoApplication = AccountReceivableOffsetMemoApplication & {
  egcs_fc_fundingagreement: string
  egcs_fc_agreementnumber: string
}

/** Payment provenance is independently filtered by Agreement read authority. */
export type ProponentCreditMemoRow = {
  id: string
  egcs_fc_creditmemoreference: string
  egcs_fc_agency: string
  egcs_fc_agencyname_en: string
  egcs_fc_agencyname_fr: string
  egcs_fc_currency: Currency_Codes
  egcs_fc_amount: Money
  egcs_fc_createdat: string
} & (
  | { egcs_fc_kind: 'cash'; egcs_fc_status: string; egcs_fc_receiveddate: string; egcs_fc_candelete: boolean }
  | {
    egcs_fc_kind: 'automatic'
    egcs_fc_status: null
    /** Outstanding balance of the linked AR; this is not unused memo credit. */
    egcs_fc_receivableoutstanding: Money
    egcs_fc_originapplication: ProponentCreditMemoApplication | null
    egcs_fc_applications: ProponentCreditMemoApplication[]
  }
)

/** One complete, independently authorized ledger in its native denomination. */
export type ProponentAccountBalanceRow = {
  id: string
  egcs_fc_agency: string
  egcs_fc_agencyname_en: string
  egcs_fc_agencyname_fr: string
  egcs_fc_currency: Currency_Codes
  egcs_fc_debitamount: Money
  egcs_fc_creditamount: Money
  egcs_fc_netamount: Money
  egcs_fc_receivableamount: Money
  egcs_fc_refundableamount: Money
}
