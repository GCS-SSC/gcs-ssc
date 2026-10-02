import type { Selectable } from 'kysely'
import type { FundingCaseAgreementJournalVoucherTable } from './database'
import type { BusinessRecordStateFields } from './business-record-state'
import type { JournalVoucherAccountingLine } from '../utils/journal-voucher'

export type JournalVoucherCodingChoice = {
  id: string
  egcs_fc_agencychartofaccount: string
  label_en: string
  label_fr: string
  egcs_fc_accountingdimensions: JournalVoucherAccountingLine['egcs_fc_accountingdimensions']
  egcs_fc_agreementcodingmatched: boolean
}

/** Local allocation editor state; the header Save projects only the allocation request fields. */
export type JournalVoucherAllocationDraft = {
  key: string
  egcs_fc_commitmentline: string
  egcs_fc_chartofaccount: string
  egcs_fc_amount: string
  egcs_fc_accountingdimensions: JournalVoucherAccountingLine['egcs_fc_accountingdimensions']
  egcs_fc_agreementcodingmatched: boolean
}

export type JournalVoucherRow = Omit<Selectable<FundingCaseAgreementJournalVoucherTable>, 'egcs_fc_requesteddate'> & {
  egcs_fc_requesteddate: string
} & BusinessRecordStateFields
export type JournalVoucherDetail = JournalVoucherRow & {
  egcs_fc_lines: Array<JournalVoucherAccountingLine & {
    id: string
    egcs_fc_agencychartofaccount: string
    egcs_fc_kind: 'original' | 'corrected' | 'adjustment'
    egcs_fc_agreementcodingmatched: boolean
  }>
  egcs_fc_fiscaleligible: boolean
  egcs_fc_sourcereadable: boolean
  egcs_fc_canwork: boolean
  egcs_fc_candelete: boolean
  egcs_fc_canedit: boolean
  egcs_fc_canreverse: boolean
  egcs_fc_canreplace: boolean
}
