import type { AdminCommonLookupResponseItem } from './admin-common-ui'

export interface AccountReceivableSourceEntry {
  kind: 'claim' | 'advance'
  id: string
  egcs_fc_applicantrecipient: string
  egcs_fc_agencyfiscalyear: string
  egcs_fc_sources: string[]
  types: AdminCommonLookupResponseItem[]
}
