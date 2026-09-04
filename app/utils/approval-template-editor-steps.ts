/* eslint-disable jsdoc/require-jsdoc */
import { nanoid } from 'nanoid'
import type { ApprovalTemplateStepItem } from '~~/shared/types/schemas'
import type { ApprovalTemplateEditorStep } from '~~/app/types/approval-template-editor'
import { createApprovalTemplateEditorCertification } from '~~/app/utils/approval-template-editor-certifications'

export const createApprovalTemplateEditorStep = (
  step?: Partial<ApprovalTemplateStepItem>
): ApprovalTemplateEditorStep => ({
  id: step?.id ?? '',
  egcs_cn_sequence: typeof step?.egcs_cn_sequence === 'number' ? step.egcs_cn_sequence : 1,
  egcs_cn_description_en: step?.egcs_cn_description_en ?? '',
  egcs_cn_description_fr: step?.egcs_cn_description_fr ?? '',
  egcs_cn_name_en: step?.egcs_cn_name_en ?? '',
  egcs_cn_name_fr: step?.egcs_cn_name_fr ?? '',
  egcs_cn_defaultuser: step?.egcs_cn_defaultuser ?? '',
  egcs_cn_approvertitle: step?.egcs_cn_approvertitle ?? '',
  certifications: (step?.certifications ?? []).map(item => createApprovalTemplateEditorCertification(item)),
  _key: nanoid()
})
