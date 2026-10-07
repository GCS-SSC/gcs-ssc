import type { Selectable } from 'kysely'
import type { Currency_Codes, FundingCaseAgreementAccountReceivableTable, FundingCaseAccountReceivableCreditMemoTable, JsonValue } from './database'
import type { BusinessRecordStateFields } from './business-record-state'
import type { Money } from '../utils/money'
import type { JournalVoucherAccountingLine } from '../utils/journal-voucher'
import type { AccountReceivableRecoveryMethod } from '../utils/account-receivable'

export type AccountReceivableRow = Omit<Selectable<FundingCaseAgreementAccountReceivableTable>,
  'egcs_fc_requesteddate' | 'egcs_fc_createdat' | 'egcs_fc_postedat' | 'egcs_fc_terminalat' | 'egcs_fc_fiscaloutstanding'> & {
    egcs_fc_fiscaloutstanding: Money | null
    egcs_fc_requesteddate: string
    egcs_fc_createdat: string
    egcs_fc_postedat: string | null
    egcs_fc_terminalat: string | null
  } & BusinessRecordStateFields & {
    egcs_fc_principal: Money
    egcs_fc_approvedamount: Money
    egcs_fc_debtorname_en: string
    egcs_fc_debtorname_fr: string
    egcs_fc_fiscalyeardisplay: string
    egcs_fc_effectiverecoverymethod: AccountReceivableRecoveryMethod | null
  }

export type AccountReceivableCoding = {
  id: string
  egcs_fc_receivableline: string
  egcs_fc_commitmentline: string
  egcs_fc_chartofaccount: string
  egcs_fc_agencychartofaccount: string
  egcs_fc_agencyfiscalyear: string
  egcs_fc_periodstart: number
  egcs_fc_periodend: number
  egcs_fc_paidbasis: Money
  egcs_fc_sharedpaidbasis: Money
  egcs_fc_amount: Money
  egcs_fc_accountingdimensions: JournalVoucherAccountingLine['egcs_fc_accountingdimensions']
}

export type AccountReceivableLine = {
  egcs_fc_accountreceivablechartofaccount: string | null
  egcs_fc_accountreceivableaccountingdimensions: JournalVoucherAccountingLine['egcs_fc_accountingdimensions']
  id: string
  egcs_fc_receivable: string
  egcs_fc_fundingagreement: string
  egcs_fc_originalline: string | null
  egcs_fc_sourcekey: string
  egcs_fc_claim: string | null
  egcs_fc_claimline: string | null
  egcs_fc_reconcileline: string | null
  egcs_fc_payment: string | null
  egcs_fc_periodstart: number
  egcs_fc_periodend: number
  egcs_fc_sourceamount: Money
  egcs_fc_amount: Money
  egcs_fc_evidence: JsonValue
  egcs_fc_coding: AccountReceivableCoding[]
  egcs_fc_principal: Money
}

export type AccountReceivableOffsetMemoApplication = {
  id: string
  egcs_fc_recovery: string
  egcs_fc_payment: string
  egcs_fc_amount: Money
  egcs_fc_outcome: 'open' | 'posted' | 'released'
  egcs_fc_createdat: string
  egcs_fc_postedat: string | null
}

export type AccountReceivableOffsetMemo = {
  id: string
  egcs_fc_receivable: string
  egcs_fc_creditmemochartofaccount: string
  egcs_fc_creditmemoaccountingdimensions: JsonValue
  egcs_fc_pool: string
  egcs_fc_creditmemoreference: string
  egcs_fc_amount: Money
  egcs_fc_appliedamount: Money
  egcs_fc_reservedamount: Money
  egcs_fc_receivablereserved: Money
  egcs_fc_receivablerecovered: Money
  egcs_fc_receivableoutstanding: Money
  egcs_fc_receivableavailable: Money
  egcs_fc_createdat: string
  egcs_fc_applications: AccountReceivableOffsetMemoApplication[]
}

export type AccountReceivablePaymentCreditMemo = Pick<AccountReceivableOffsetMemo,
  'id' | 'egcs_fc_creditmemoreference' | 'egcs_fc_amount' | 'egcs_fc_receivableoutstanding' | 'egcs_fc_receivableavailable' | 'egcs_fc_receivablereserved' | 'egcs_fc_receivablerecovered'> & {
    egcs_fc_offsetmemo: string
    egcs_fc_appliedamount: Money
    egcs_fc_outcome: 'open' | 'posted' | 'released'
  }

export type AccountReceivableDetail = AccountReceivableRow & {
  egcs_fc_recovered: Money
  egcs_fc_reserved: Money
  egcs_fc_outstanding: Money
  egcs_fc_available: Money
  egcs_fc_collectionstate: 'cleared' | 'partially_recovered' | 'outstanding'
  egcs_fc_lines: AccountReceivableLine[]
  egcs_fc_adjustments: AccountReceivableRow[]
  egcs_fc_principal: Money
  egcs_fc_agreementreadable: boolean
  egcs_fc_sourcereadable: boolean
  egcs_fc_canwork: boolean
  egcs_fc_canedit: boolean
  egcs_fc_candelete: boolean
  egcs_fc_cancancel: boolean
  egcs_fc_proponentreadable: boolean
  egcs_fc_approvedamount: Money
  egcs_fc_canadjust: boolean
  egcs_fc_cancreditmemo: boolean
  egcs_fc_debtorname_en: string
  egcs_fc_debtorname_fr: string
  egcs_fc_fiscalyeardisplay: string
}

export type AccountReceivableCreditMemoRow = Omit<Selectable<FundingCaseAccountReceivableCreditMemoTable>,
  'egcs_fc_receiveddate' | 'egcs_fc_createdat' | 'egcs_fc_postedat' | 'egcs_fc_terminalat' | 'egcs_fc_amount'> & {
    egcs_fc_receiveddate: string
    egcs_fc_createdat: string
    egcs_fc_postedat: string | null
    egcs_fc_terminalat: string | null
    egcs_fc_amount: Money
  } & BusinessRecordStateFields

export type AccountReceivableCreditMemoDetail = AccountReceivableCreditMemoRow & {
  egcs_fc_receivablerecovered: Money
  egcs_fc_receivablereserved: Money
  egcs_fc_receivableoutstanding: Money
  egcs_fc_receivableavailable: Money
  egcs_fc_fundingagreement: string
  egcs_fc_agreementnumber: string
  egcs_fc_receivablereference: string
  egcs_fc_cancomplete: boolean
  egcs_fc_creditmemoreference: string
  egcs_fc_agencyname_en: string
  egcs_fc_agencyname_fr: string
  egcs_fc_proponentreadable: boolean
  egcs_fc_agreementreadable: boolean
  egcs_fc_canwork: boolean
  egcs_fc_canedit: boolean
  egcs_fc_candelete: boolean
  egcs_fc_cancancel: boolean
  egcs_fc_debtorname_en: string
  egcs_fc_debtorname_fr: string
}

export type AccountReceivableSource = {
  egcs_fc_sourcekey: string
  egcs_fc_type: string
  egcs_fc_claim: string | null
  egcs_fc_claimline: string | null
  egcs_fc_reconcileline: string | null
  egcs_fc_payment: string | null
  egcs_fc_periodstart: number
  egcs_fc_periodend: number
  egcs_fc_sourceamount: Money
  egcs_fc_available: Money
  egcs_fc_currency: Currency_Codes
  egcs_fc_evidence: JsonValue
}
