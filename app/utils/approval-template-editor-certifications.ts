/* eslint-disable jsdoc/require-jsdoc */
import { nanoid } from 'nanoid'
import type { ApprovalTemplateCertificationItem } from '~~/shared/types/schemas'
import type { ApprovalTemplateEditorCertification } from '~~/app/types/approval-template-editor'

export const createApprovalTemplateEditorCertification = (
  certification?: Partial<ApprovalTemplateCertificationItem>
): ApprovalTemplateEditorCertification => ({
  id: certification?.id ?? '',
  egcs_cn_order: typeof certification?.egcs_cn_order === 'number' ? certification.egcs_cn_order : 1,
  egcs_cn_description_en: certification?.egcs_cn_description_en ?? '',
  egcs_cn_description_fr: certification?.egcs_cn_description_fr ?? '',
  egcs_cn_name_en: certification?.egcs_cn_name_en ?? '',
  egcs_cn_name_fr: certification?.egcs_cn_name_fr ?? '',
  egcs_cn_optional: certification?.egcs_cn_optional,
  egcs_cn_certification_en: certification?.egcs_cn_certification_en ?? '',
  egcs_cn_certification_fr: certification?.egcs_cn_certification_fr ?? '',
  _key: nanoid()
})
