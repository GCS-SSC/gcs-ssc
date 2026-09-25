import type { AssignableEntityType } from './schemas'
import type { BusinessRecordStateFields } from './business-record-state'

/** Open personal casework projected for the home dashboard. */
export type AssignedWorkItem = BusinessRecordStateFields & {
  entity_id: string
  entity_type: AssignableEntityType
  status: string
  identifier_en: string
  identifier_fr: string
  parent_en: string | null
  parent_fr: string | null
  secondary_en: string | null
  secondary_fr: string | null
  detail_name_en: string | null
  detail_name_fr: string | null
  detail_number: number | null
  claim_id: string | null
  fiscal_year: string | null
  period_start: number | null
  period_end: number | null
  payment_type: string | null
  is_primary: boolean
  agreement_id: string | null
  variant: string | null
}

/** Claimable or claimed review and approval work projected for the home dashboard. */
export type GroupWorkItem = {
  kind: 'review' | 'additional_reviewer' | 'approval'
  id: string
  entity_type: string
  entity_id: string
  variant: 'checklist' | 'assessment' | null
  name_en: string
  name_fr: string
  detail_name_en: string | null
  detail_name_fr: string | null
  parent_en: string | null
  parent_fr: string | null
  group_name_en: string
  group_name_fr: string
  agreement_id: string | null
}
