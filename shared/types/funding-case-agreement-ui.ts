import type { Agreement_Type } from './database'
import type { BusinessRecordStateFields } from './business-record-state'
import type { StatusId } from './status'
import type { Money } from '../utils/money'
import type { TransferPaymentStreamChartOfAccountDimension } from './schemas/transfer-payment'
import type {
  FundingCaseAgreementActivityItem,
  FundingCaseAgreementAddressItem,
  FundingCaseAgreementApplicantRecipientItem,
  FundingCaseAgreementCommitmentItem,
  FundingCaseAgreementCommitmentLineItem,
  FundingCaseAgreementMonitorFindingItem,
  FundingCaseAgreementMonitorFollowupItem,
  FundingCaseAgreementMonitorFollowupUpdateItem,
  FundingCaseAgreementMonitorItem,
  FundingCaseAgreementMonitorItemsItem,
  FundingCaseAgreementMonitorPlanningItem,
  FundingCaseAgreementMonitorPromisingPracticeItem,
  FundingCaseAgreementPaymentItem,
  FundingCaseAgreementPaymentLineItem,
  FundingCaseAgreementClaimItem,
  FundingCaseAgreementClaimLineItemItem,
  FundingCaseAgreementClaimReconcileItem,
  FundingCaseAgreementClaimReconcileLineItemItem,
  FundingCaseAgreementForecastItem,
  FundingCaseAgreementForecastLineItemItem,
  FundingCaseAgreementBudgetFiscalYearItem,
  FundingCaseAgreementBudgetLineItemItem,
  FundingCaseAgreementProfileItem
} from './schemas'

export interface FundingCaseAgreementProfileRow extends FundingCaseAgreementProfileItem, BusinessRecordStateFields {
  egcs_fc_status: StatusId
  agency_id: string
  agency_name_en?: string
  agency_name_fr?: string
  program_id: string
  program_name_en?: string
  program_name_fr?: string
  stream_name_en?: string
  stream_name_fr?: string
  agreement_subtype_name_en?: string
  agreement_subtype_name_fr?: string
  risk_rating_name_en?: string | null
  risk_rating_name_fr?: string | null
  can_update?: boolean
  can_delete?: boolean
  can_create_child_records?: boolean
  can_update_child_records?: boolean
  can_delete_child_records?: boolean
}

export type FundingCaseAgreementProfileForm = Partial<
  Omit<
    FundingCaseAgreementProfileItem,
    | 'egcs_fc_authorizedassistancestartdate'
    | 'egcs_fc_authorizedassistanceenddate'
    | 'egcs_fc_agreementtype'
    | 'egcs_fc_riskscore'
  > & {
    egcs_fc_authorizedassistancestartdate?: string
    egcs_fc_authorizedassistanceenddate?: string
    egcs_fc_agreementtype?: Agreement_Type
    egcs_fc_riskscore?: string | number | null
    applicant_recipient_ids?: string[]
    extensions?: Record<string, Record<string, unknown>>
  }
>

export interface FundingCaseAgreementStreamLookupItem {
  id: string
  program_id: string
  agency_id: string
  agency_name_en?: string
  agency_name_fr?: string
  program_name_en?: string
  program_name_fr?: string
  egcs_tp_name_en?: string
  egcs_tp_name_fr?: string
}

export interface FundingCaseAgreementSubtypeLookupItem {
  id: string
  egcs_tp_transferpaymentstream: string
  agreement_name_en?: string
  agreement_name_fr?: string
  agreement_type?: Agreement_Type
}

export interface FundingCaseAgreementApplicantRecipientRow extends FundingCaseAgreementApplicantRecipientItem {
  applicant_recipient_name_en?: string | null
  applicant_recipient_name_fr?: string | null
  lead_agency_name_en?: string | null
  lead_agency_name_fr?: string | null
}

export interface FundingCaseAgreementApplicantRecipientLookupItem {
  id: string
  label_en?: string | null
  label_fr?: string | null
  description_en?: string | null
  description_fr?: string | null
}

export type FundingCaseAgreementApplicantRecipientForm = Partial<FundingCaseAgreementApplicantRecipientItem>

export interface FundingCaseAgreementAddressRow extends FundingCaseAgreementAddressItem {
  egcs_fc_fundingagreement: string
  egcs_fc_addresstype: string
  egcs_fc_address: string
  address_type_name_en?: string | null
  address_type_name_fr?: string | null
}

export type FundingCaseAgreementAddressForm = Partial<FundingCaseAgreementAddressItem>

export interface FundingCaseAgreementBudgetFiscalYearRow extends FundingCaseAgreementBudgetFiscalYearItem {
  fiscal_year_display?: string | null
}

export interface FundingCaseAgreementBudgetLineItemRow extends Omit<FundingCaseAgreementBudgetLineItemItem,
  'egcs_fc_totalamount' | 'egcs_fc_programfunding' | 'egcs_fc_otherfederalfunding' | 'egcs_fc_othergovfunding' | 'egcs_fc_otherfunding'> {
  egcs_fc_totalamount: Money
  egcs_fc_programfunding: Money
  egcs_fc_otherfederalfunding?: Money | null
  egcs_fc_othergovfunding?: Money | null
  egcs_fc_otherfunding?: Money | null
  fiscal_year_id: string
  fiscal_year_display?: string | null
  organization_cost_category_name_en?: string | null
  organization_cost_category_name_fr?: string | null
  line_item_name_en?: string | null
  line_item_name_fr?: string | null
}

export interface FundingCaseAgreementBudgetOverviewRow {
  fiscalYears: FundingCaseAgreementBudgetFiscalYearRow[]
  lineItems: FundingCaseAgreementBudgetLineItemRow[]
  budget_differences?: FundingCaseAgreementBudgetDifference[]
}

export interface FundingCaseAgreementBudgetDifference {
  previousTotal: Money
  amendedTotal: Money
  difference: Money
  currency: string
}

export type FundingCaseAgreementBudgetFiscalYearForm = Partial<FundingCaseAgreementBudgetFiscalYearItem>
export type FundingCaseAgreementBudgetLineItemForm = Partial<Omit<FundingCaseAgreementBudgetLineItemItem,
  'egcs_fc_totalamount' | 'egcs_fc_programfunding' | 'egcs_fc_otherfederalfunding' | 'egcs_fc_othergovfunding' | 'egcs_fc_otherfunding'> & {
    egcs_fc_totalamount: string
    egcs_fc_programfunding: string
    egcs_fc_otherfederalfunding: string | null
    egcs_fc_othergovfunding: string | null
    egcs_fc_otherfunding: string | null
  }>

export interface FundingCaseAgreementAmendmentTypeRow {
  id: string
  egcs_tp_name_en?: string | null
  egcs_tp_name_fr?: string | null
  egcs_tp_amended: string
}

export interface FundingCaseAgreementAmendmentRow extends BusinessRecordStateFields {
  id: string
  egcs_fc_amendmentnumber: number | null
  egcs_fc_name_en?: string | null
  egcs_fc_name_fr?: string | null
  egcs_fc_status: StatusId
  egcs_fc_isopen: boolean
  egcs_fc_proposedauthorizedassistancestartdate?: string | null
  egcs_fc_proposedauthorizedassistanceenddate?: string | null
  amendment_types: FundingCaseAgreementAmendmentTypeRow[]
  amendment_type_ids?: string[]
  amendment_subtypes?: Array<{ id: string, egcs_tp_name_en?: string | null, egcs_tp_name_fr?: string | null }>
  amendment_subtype_ids?: string[]
  has_budget_snapshot: boolean
  has_activity_snapshot: boolean
  budget_differences?: FundingCaseAgreementBudgetDifference[]
  can_create_snapshot: boolean
  can_edit: boolean
  can_edit_scope?: boolean
  can_cancel?: boolean
}

export interface FundingCaseAgreementAmendmentListResponse {
  items: FundingCaseAgreementAmendmentRow[]
  total: number
  can_create: boolean
}

export interface FundingCaseAgreementCommitmentRow extends FundingCaseAgreementCommitmentItem, BusinessRecordStateFields {
  commitment_type_name_en?: string | null
  commitment_type_name_fr?: string | null
}

export interface FundingCaseAgreementCommitmentDetailRow extends FundingCaseAgreementCommitmentRow {
  agreement_title_en?: string | null
  agreement_title_fr?: string | null
  agreement_number?: string | null
  agreement_financial_system_number?: string | null
  stream_name_en?: string | null
  stream_name_fr?: string | null
}

export interface FundingCaseAgreementCommitmentLineRow extends FundingCaseAgreementCommitmentLineItem {
  fiscal_year_display?: string | null
  accounting_dimensions: TransferPaymentStreamChartOfAccountDimension[]
}

export interface FundingCaseAgreementCommitmentOverviewRow {
  commitments: FundingCaseAgreementCommitmentRow[]
  lines: FundingCaseAgreementCommitmentLineRow[]
}

export interface FundingCaseAgreementChartOfAccountLookupItem {
  id: string
  label_en?: string | null
  label_fr?: string | null
  fiscal_year_display?: string | null
}

export type FundingCaseAgreementCommitmentForm = Partial<FundingCaseAgreementCommitmentItem>
export type FundingCaseAgreementCommitmentLineForm = Partial<
  Omit<FundingCaseAgreementCommitmentLineItem, 'egcs_fc_amount'> & { egcs_fc_amount: string }
>

export interface FundingCaseAgreementPaymentRow extends FundingCaseAgreementPaymentItem, BusinessRecordStateFields {
  commitment_type?: string | null
  commitment_type_name_en?: string | null
  commitment_type_name_fr?: string | null
  fiscal_year_display?: string | null
  line_count?: number
  line_total?: Money
}

export interface FundingCaseAgreementPaymentLineRow extends FundingCaseAgreementPaymentLineItem {
  commitment_line_number?: number | null
  commitment_line_amount?: Money | null
  commitment_line_paid_amount?: Money | null
  commitment_line_remaining_amount?: Money | null
  fiscal_year_display?: string | null
  accounting_dimensions: TransferPaymentStreamChartOfAccountDimension[]
}

export interface FundingCaseAgreementPaymentDetailRow extends FundingCaseAgreementPaymentRow {
  agreement_id: string
  agreement_title_en?: string | null
  agreement_title_fr?: string | null
  agreement_number?: string | null
  agreement_financial_system_number?: string | null
  stream_name_en?: string | null
  stream_name_fr?: string | null
  lines: FundingCaseAgreementPaymentLineRow[]
}

export interface FundingCaseAgreementPaymentOverviewRow {
  payments: FundingCaseAgreementPaymentRow[]
}

export interface FundingCaseAgreementPaymentCommitmentLookupItem {
  id: string
  label_en?: string | null
  label_fr?: string | null
}

export interface FundingCaseAgreementPaymentCommitmentLineLookupItem {
  id: string
  label_en?: string | null
  label_fr?: string | null
  remaining_amount: Money
}

export type FundingCaseAgreementPaymentForm = Partial<
  Omit<FundingCaseAgreementPaymentItem, 'egcs_fc_paymentamount'> & { egcs_fc_paymentamount: string }
> & {
  extensions?: Record<string, Record<string, unknown>>
}
export type FundingCaseAgreementPaymentLineForm = Partial<
  Omit<FundingCaseAgreementPaymentLineItem, 'egcs_fc_amount'> & { egcs_fc_amount: string }
>

export interface FundingCaseAgreementMonitorRow extends FundingCaseAgreementMonitorItem, BusinessRecordStateFields {
  monitor_type_name_en?: string | null
  monitor_type_name_fr?: string | null
  fiscal_year_display?: string | null
}

export type FundingCaseAgreementMonitorForm = Partial<FundingCaseAgreementMonitorItem>

export type FundingCaseAgreementMonitorPlanningRow = FundingCaseAgreementMonitorPlanningItem
export type FundingCaseAgreementMonitorPlanningForm = Partial<FundingCaseAgreementMonitorPlanningItem>

export interface FundingCaseAgreementMonitorItemsRow extends Omit<
  FundingCaseAgreementMonitorItemsItem,
  'egcs_fc_plannedstart' | 'egcs_fc_plannedend' | 'egcs_fc_actualstart' | 'egcs_fc_actualend'
> {
  egcs_fc_plannedstart: string
  egcs_fc_plannedend: string
  egcs_fc_actualstart?: string | null
  egcs_fc_actualend?: string | null
}

export type FundingCaseAgreementMonitorItemsForm = Partial<Omit<
  FundingCaseAgreementMonitorItemsItem,
  'egcs_fc_plannedstart' | 'egcs_fc_plannedend' | 'egcs_fc_actualstart' | 'egcs_fc_actualend'
> & {
  egcs_fc_plannedstart?: string
  egcs_fc_plannedend?: string
  egcs_fc_actualstart?: string | null
  egcs_fc_actualend?: string | null
}>

export type FundingCaseAgreementMonitorFindingRow = FundingCaseAgreementMonitorFindingItem
export type FundingCaseAgreementMonitorFindingForm = Partial<FundingCaseAgreementMonitorFindingItem>

export interface FundingCaseAgreementMonitorFollowupRow extends Omit<FundingCaseAgreementMonitorFollowupItem, 'egcs_fc_duedate'> {
  egcs_fc_duedate: string
}

export type FundingCaseAgreementMonitorFollowupForm = Partial<Omit<FundingCaseAgreementMonitorFollowupItem, 'egcs_fc_duedate'> & {
  egcs_fc_duedate?: string
}>

export interface FundingCaseAgreementMonitorFollowupUpdateRow extends Omit<FundingCaseAgreementMonitorFollowupUpdateItem, 'egcs_fc_updatedate'> {
  egcs_fc_updatedate: string
}

export type FundingCaseAgreementMonitorFollowupUpdateForm = Partial<Omit<FundingCaseAgreementMonitorFollowupUpdateItem, 'egcs_fc_updatedate'> & {
  egcs_fc_updatedate?: string
}>
export type FundingCaseAgreementMonitorPromisingPracticeRow = FundingCaseAgreementMonitorPromisingPracticeItem
export type FundingCaseAgreementMonitorPromisingPracticeForm = Partial<FundingCaseAgreementMonitorPromisingPracticeItem>

export interface FundingCaseAgreementMonitorDetailRow extends FundingCaseAgreementMonitorRow {
  agreement_title_en?: string | null
  agreement_title_fr?: string | null
  agreement_number?: string | null
  agreement_financial_system_number?: string | null
  stream_name_en?: string | null
  stream_name_fr?: string | null
  planning: FundingCaseAgreementMonitorPlanningRow[]
  items: FundingCaseAgreementMonitorItemsRow[]
  findings: FundingCaseAgreementMonitorFindingRow[]
  followups: FundingCaseAgreementMonitorFollowupRow[]
  followupUpdates: FundingCaseAgreementMonitorFollowupUpdateRow[]
  promisingPractices: FundingCaseAgreementMonitorPromisingPracticeRow[]
}

export interface FundingCaseAgreementForecastRow extends FundingCaseAgreementForecastItem, BusinessRecordStateFields {
  fiscal_year_display?: string | null
}

export interface FundingCaseAgreementForecastLineItemRow extends FundingCaseAgreementForecastLineItemItem {
  forecast_fiscal_year_id: string
  fiscal_year_display?: string | null
  budget_fiscal_year_id: string
  budget_fiscal_year_display?: string | null
  organization_cost_category_name_en?: string | null
  organization_cost_category_name_fr?: string | null
  egcs_fc_costsubsection?: string | null
  line_item_name_en?: string | null
  line_item_name_fr?: string | null
  budget_line_total_amount?: Money | null
  budget_line_program_funding?: Money | null
}

export interface FundingCaseAgreementForecastOverviewRow {
  forecasts: FundingCaseAgreementForecastRow[]
  budgetLineItems: FundingCaseAgreementBudgetLineItemRow[]
  lineItems: FundingCaseAgreementForecastLineItemRow[]
}

export type FundingCaseAgreementForecastForm = Partial<FundingCaseAgreementForecastItem>
export type FundingCaseAgreementForecastLineItemForm = Partial<FundingCaseAgreementForecastLineItemItem>

export interface FundingCaseAgreementClaimRow extends FundingCaseAgreementClaimItem, BusinessRecordStateFields {
  hasPositiveCompletionTerminus?: boolean
  fiscal_year_display?: string | null
}

export interface FundingCaseAgreementClaimLineItemRow extends FundingCaseAgreementClaimLineItemItem {
  claim_fiscal_year_id: string
  budget_fiscal_year_id?: string | null
  budget_fiscal_year_display?: string | null
  organization_cost_category_name_en?: string | null
  organization_cost_category_name_fr?: string | null
  egcs_fc_costsubsection?: string | null
  line_item_name_en?: string | null
  line_item_name_fr?: string | null
  budget_line_total_amount?: Money | null
  budget_line_program_funding?: Money | null
}

export interface FundingCaseAgreementClaimReconcileRow extends FundingCaseAgreementClaimReconcileItem, BusinessRecordStateFields {
  user_name?: string | null
  user_position_title?: string | null
}

export interface FundingCaseAgreementClaimReconcileLineItemRow extends FundingCaseAgreementClaimReconcileLineItemItem {
  claim_line_item_amount?: Money | null
  claim_line_item_description?: string | null
  organization_cost_category_name_en?: string | null
  organization_cost_category_name_fr?: string | null
  egcs_fc_costsubsection?: string | null
  line_item_name_en?: string | null
  line_item_name_fr?: string | null
}

export interface FundingCaseAgreementClaimOverviewRow {
  claims: FundingCaseAgreementClaimRow[]
  budgetLineItems: FundingCaseAgreementBudgetLineItemRow[]
  lineItems: FundingCaseAgreementClaimLineItemRow[]
  reconciles: FundingCaseAgreementClaimReconcileRow[]
  reconcileLineItems: FundingCaseAgreementClaimReconcileLineItemRow[]
}

export type FundingCaseAgreementClaimForm = Partial<Omit<FundingCaseAgreementClaimItem, 'egcs_fc_receiveddate'> & {
  egcs_fc_receiveddate?: string
}>
export type FundingCaseAgreementClaimLineItemForm = Partial<FundingCaseAgreementClaimLineItemItem>
export type FundingCaseAgreementClaimReconcileForm = Partial<FundingCaseAgreementClaimReconcileItem>
export type FundingCaseAgreementClaimReconcileLineItemForm = Partial<FundingCaseAgreementClaimReconcileLineItemItem>

export interface FundingCaseAgreementActivityOutcomeTag {
  id: string
  label_en?: string | null
  label_fr?: string | null
}

export interface FundingCaseAgreementActivityResponsiblePartyTag {
  id: string
  label_en?: string | null
  label_fr?: string | null
}

export interface FundingCaseAgreementActivityRow extends Omit<FundingCaseAgreementActivityItem, 'egcs_fc_startdate' | 'egcs_fc_enddate'> {
  egcs_fc_startdate: string
  egcs_fc_enddate: string
  outcome_ids: string[]
  responsible_party_ids: string[]
  outcomes: FundingCaseAgreementActivityOutcomeTag[]
  responsible_parties: FundingCaseAgreementActivityResponsiblePartyTag[]
}

export type FundingCaseAgreementActivityForm = Partial<
  Omit<FundingCaseAgreementActivityItem, 'egcs_fc_startdate' | 'egcs_fc_enddate'>
> & {
  egcs_fc_startdate?: string
  egcs_fc_enddate?: string
  outcome_ids?: string[]
  responsible_party_ids?: string[]
  outcomes?: FundingCaseAgreementActivityOutcomeTag[]
  responsible_parties?: FundingCaseAgreementActivityResponsiblePartyTag[]
}
