import type { RuntimeState } from '~~/shared/constants/system-lifecycle'

export type ApprovalLookupBehalfType = {
  id: string
  egcs_ay_name_en: string
  egcs_ay_name_fr: string
  egcs_ay_require_actual: boolean
}

export type ApprovalCertificationItem = {
  id: string
  egcs_cn_optional: boolean
  egcs_cn_certification_en: string
  egcs_cn_certification_fr: string
  egcs_cn_value: boolean | null
}

export type AdditionalApprovalCertification = {
  id?: string
  egcs_cn_order: number
  egcs_cn_description_en: string
  egcs_cn_description_fr: string
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  egcs_cn_optional: boolean
  egcs_cn_certification_en: string
  egcs_cn_certification_fr: string
}

export type AdditionalApprovalCertificationState = AdditionalApprovalCertification & {
  _key: string
}

export type ApprovalStepItem = {
  id: string
  runtimeItemId: string
  runtimeState: RuntimeState
  sequence: number
  display_order: number
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  egcs_cn_defaultuser: string
  egcs_cn_assigneduser: string | null
  egcs_cn_onbehalf: string | null
  egcs_cn_approvalpositiontitle: string
  egcs_cn_approvalvalue: boolean | null
  egcs_cn_approvaldate: string | null
  egcs_cn_comment: string
  default_user_name: string
  default_user_position_title: string
  assigned_user_name: string
  assigned_user_position_title: string
  onbehalf_name_en: string
  onbehalf_name_fr: string
  onbehalf_require_actual: boolean
  is_current: boolean
  can_action: boolean
  can_reassign: boolean
  can_add_before: boolean
  can_add_after: boolean
  certifications: ApprovalCertificationItem[]
}

export type ApprovalRoutingSlipItem = {
  id: string
  routingSlipId: string
  approvalRuntimeId: string
  approvalRuntimeState: RuntimeState
  runtimeId: string
  runtimeItemId: string
  runtimeState: RuntimeState
  attempt: number
  previousRuntimeId: string | null
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  is_current: boolean
  is_preview: boolean
  allow_additional_approvals: boolean
  allow_added_approval_name_changes: boolean
  allow_added_approval_certification_changes: boolean
  default_added_approval_name_en: string
  default_added_approval_name_fr: string
  additional_approval_certifications: AdditionalApprovalCertification[]
  steps: ApprovalStepItem[]
}

export type ApprovalRuntimeResponse = {
  mode: 'none' | 'runtime'
  can_manage?: boolean
  routingSlips?: ApprovalRoutingSlipItem[]
  template: {
    egcs_cn_name_en: string
    egcs_cn_name_fr: string
  } | null
  steps: ApprovalStepItem[]
}

export type ApprovalTableRow = {
  id: string
  routingSlipGroup: string
  routingSlipId: string
  routingSlipNameEn: string
  routingSlipNameFr: string
  routingSlipRuntimeState: RuntimeState
  routingSlipIsCurrent: boolean
  routingSlipIsPreview: boolean
  rowKind: 'step' | 'empty'
  stepId: string
  stepRuntimeItemId: string
  stepRuntimeState: RuntimeState
  stepDisplayOrder: number
  stepNameEn: string
  stepNameFr: string
  assignedApproverLabel: string
  sequence: number
  egcs_cn_defaultuser: string
  egcs_cn_assigneduser: string | null
  egcs_cn_onbehalf: string | null
  egcs_cn_approvalpositiontitle: string
  egcs_cn_approvalvalue: boolean | null
  egcs_cn_approvaldate: string | null
  egcs_cn_comment: string
  default_user_name: string
  default_user_position_title: string
  assigned_user_name: string
  assigned_user_position_title: string
  onbehalf_name_en: string
  onbehalf_name_fr: string
  onbehalf_require_actual: boolean
  is_current: boolean
  can_action: boolean
  can_reassign: boolean
  can_add_before: boolean
  can_add_after: boolean
  certifications: ApprovalCertificationItem[]
}

export type GroupedApprovalRow = {
  id: string
  depth: number
  groupingColumnId?: string
  original: ApprovalTableRow
  subRows?: GroupedApprovalRow[]
  leafRows?: GroupedApprovalRow[]
  getIsExpanded?: () => boolean
  getIsGrouped?: () => boolean
  toggleExpanded?: () => void
}

export type ActionCertificationState = {
  id: string
  egcs_cn_optional: boolean
  egcs_cn_value: boolean
  egcs_cn_certification_en: string
  egcs_cn_certification_fr: string
}

export type ActionModalState = {
  approvalId: string
  assignedDiffersFromDefault: boolean
  isOnBehalf: boolean
  egcs_cn_onbehalf: string | null
  egcs_cn_approvalpositiontitle: string
  egcs_cn_approvaldate: string
  egcs_cn_comment: string
  certifications: ActionCertificationState[]
}

export type ReassignModalState = {
  approvalId: string
  egcs_cn_assigneduser: string
  egcs_cn_onbehalf: string | null
}

export type AddApprovalPosition = 'after' | 'before'

export type AddApprovalModalState = {
  anchorApprovalId: string
  position: AddApprovalPosition
  egcs_cn_assigneduser: string
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  certifications: AdditionalApprovalCertificationState[]
}
