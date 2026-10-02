import type { Selectable } from 'kysely'
import type { FundingCaseAgreementCorrectionTable, Currency_Codes } from './database'
import type { BusinessRecordStateFields } from './business-record-state'
import type { CorrectionFinancialLine } from '../utils/correction'
import type { JournalVoucherAccountingLine } from '../utils/journal-voucher'
import type { Money } from '../utils/money'

export type CorrectionRow = Omit<Selectable<FundingCaseAgreementCorrectionTable>, 'egcs_fc_requesteddate' | 'egcs_fc_createdat' | 'egcs_fc_postedat' | 'egcs_fc_terminalat'> & {
  egcs_fc_requesteddate: string
  egcs_fc_createdat: string
  egcs_fc_postedat: string | null
  egcs_fc_terminalat: string | null
} & BusinessRecordStateFields

export type CorrectionLine = CorrectionFinancialLine & {
  id: string
  egcs_fc_commitmentlinenumber: number
  egcs_fc_chartofaccount: string
  egcs_fc_agencyfiscalyear: string
  egcs_fc_fiscalyeardisplay: string
  egcs_fc_accountingdimensions: JournalVoucherAccountingLine['egcs_fc_accountingdimensions']
  egcs_fc_correctedpaid: Money
  egcs_fc_remaining: Money
}

export type CorrectionSourceEvidence = {
  header: { egcs_fc_currency: Currency_Codes; egcs_fc_fiscalyear: string; egcs_fc_agencyfiscalyear: string;
    egcs_fc_fiscalyeardisplay: string; egcs_fc_agreementnumber: string }
  allocations: JournalVoucherAccountingLine[]
}

export type CorrectionDetail = CorrectionRow & {
  egcs_fc_lines: CorrectionLine[]
  egcs_fc_sources: Array<{ id: string; egcs_fc_payment: string; egcs_fc_evidence: CorrectionSourceEvidence }>
  egcs_fc_agreementreadable: boolean
  egcs_fc_sourcereadable: boolean
  egcs_fc_canwork: boolean
  egcs_fc_canedit: boolean
  egcs_fc_candelete: boolean
  egcs_fc_cancancel: boolean
  egcs_fc_canlink: boolean
}
