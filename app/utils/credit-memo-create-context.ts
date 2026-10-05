import type { Currency_Codes } from '~~/shared/types/database'

/** Independent Proponent credit authoring context, with optional initial choices. */
export type CreditMemoCreateContext = {
  egcs_fc_applicantrecipient: string
  egcs_fc_debtorname_en: string
  egcs_fc_debtorname_fr: string
  egcs_fc_agency?: string
  egcs_fc_currency?: Currency_Codes
}
