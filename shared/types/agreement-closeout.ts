import type { Currency_Codes, Entity_Type } from './database'
import type { RuntimeState } from '~~/shared/constants/system-lifecycle'
import type { StatusId } from './status'
import type { Money } from '~~/shared/utils/money'

export type CloseoutFinancialState = 'reconciled' | 'outstanding_payment' | 'outstanding_advance'

export type CloseoutFinancialRow = {
  fiscalYearId: string
  fiscalYear: string
  currency: Currency_Codes
  approvedClaimAmount: Money
  paidAmount: Money
  variance: Money
  state: CloseoutFinancialState
}

export type CloseoutFinancialTotal = Omit<CloseoutFinancialRow, 'fiscalYearId' | 'fiscalYear'>

export type CloseoutFollowup = {
  id: string
  monitorId: string
  name: string
  responsibleParty: string
  status: string
  dueDate: string
  route: string
}

type CloseoutBlockerBase = {
  entityType: Entity_Type
  entityId: string
  labelEn: string
  labelFr: string
  reason: string
  route: string
}

export type CloseoutBlocker = CloseoutBlockerBase & (
  | { category: 'agreement' | 'child', status: StatusId }
  | { category: 'workflow', status: RuntimeState }
)

export type AgreementCloseoutReadiness = {
  schemaVersion: 1
  agreementId: string
  agreementStatus: StatusId
  agreementTerminal: boolean
  ready: boolean
  financial: {
    ready: boolean
    rows: CloseoutFinancialRow[]
    totals: CloseoutFinancialTotal[]
  }
  outstandingFollowups: CloseoutFollowup[]
  blockers: CloseoutBlocker[]
}
