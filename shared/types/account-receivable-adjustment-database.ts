import type { Generated } from 'kysely'

export interface FundingCaseAccountReceivableClaimReductionTable {
  id: Generated<string>
  egcs_fc_receivable: string
  egcs_fc_claim: string
  egcs_fc_claimline: string
  egcs_fc_amount: string
  egcs_fc_appliedat: Generated<Date | null>
  _deleted: Generated<boolean>
}
