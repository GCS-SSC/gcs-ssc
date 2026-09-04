import type {
  ApprovalTemplateCertificationItem,
  ApprovalTemplateItem,
  ApprovalTemplateStepItem,
  AdditionalApprovalCertificationItem
} from '~~/shared/types/schemas'

export type ApprovalTemplateEditorCertification = ApprovalTemplateCertificationItem & { _key: string }

export type ApprovalTemplateEditorStep = Omit<ApprovalTemplateStepItem, 'certifications'> & {
  _key: string
  certifications: ApprovalTemplateEditorCertification[]
}

export type AdditionalApprovalCertificationEditor = AdditionalApprovalCertificationItem & { _key: string }

export type ApprovalTemplateEditorTemplate = Omit<ApprovalTemplateItem, 'steps' | 'additionalApprovalCertifications'> & {
  steps: ApprovalTemplateEditorStep[]
  additionalApprovalCertifications: AdditionalApprovalCertificationEditor[]
}
