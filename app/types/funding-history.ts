import type { Money } from '~~/shared/utils/money'

type FundingHistorySource = 'system' | 'external'

export interface FundingHistoryMoneyTotal {
  currency: string
  amount: Money
}

export interface FundingHistoryRecipient {
  id: string
  labelEn?: string | null
  labelFr?: string | null
}

interface FundingHistoryRowBase {
  rowKey: string
  source: FundingHistorySource
  restricted: boolean
}

export interface RestrictedFundingHistoryRow extends FundingHistoryRowBase {
  source: FundingHistorySource
  restricted: true
}

export interface VisibleFundingHistoryRow extends FundingHistoryRowBase {
  restricted: false
  historyId?: string
  agreementId?: string
  agencyNameEn?: string | null
  agencyNameFr?: string | null
  programNameEn?: string | null
  programNameFr?: string | null
  agreementNumber: string
  titleEn?: string | null
  titleFr?: string | null
  descriptionEn?: string | null
  descriptionFr?: string | null
  startDate: string
  endDate: string
  totals: FundingHistoryMoneyTotal[]
  recipients?: FundingHistoryRecipient[]
  canUpdate?: boolean
  canDelete?: boolean
}

export type FundingHistoryRow = RestrictedFundingHistoryRow | VisibleFundingHistoryRow

export type FundingHistoryWarningKind = 'agency' | 'program' | 'agreement_number'

export interface FundingHistorySimilarityWarning {
  kind: FundingHistoryWarningKind
  fingerprint: string
  restricted: boolean
  candidateId?: string
  labelEn?: string | null
  labelFr?: string | null
}

export interface FundingHistorySimilarityResponse {
  warnings: FundingHistorySimilarityWarning[]
}

export interface FundingHistoryFormState {
  historyId?: string
  recipientIds: string[]
  egcs_ar_agencyname_en?: string
  egcs_ar_agencyname_fr?: string
  egcs_ar_programname_en?: string
  egcs_ar_programname_fr?: string
  egcs_ar_agreementnumber?: string
  egcs_ar_title_en?: string
  egcs_ar_title_fr?: string
  egcs_ar_description_en?: string
  egcs_ar_description_fr?: string
  egcs_ar_startdate?: string
  egcs_ar_enddate?: string
  egcs_ar_fundingamount?: string
  egcs_ar_currency?: string
  confirmations: string[]
}
