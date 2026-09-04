/* eslint-disable jsdoc/require-jsdoc */
import type { ApprovalTemplateItem } from '~~/shared/types/schemas'
import type { ApprovalTemplateEditorTemplate } from '~~/app/types/approval-template-editor'
import { createApprovalTemplateEditorStep } from '~~/app/utils/approval-template-editor-steps'
import { createAdditionalApprovalCertificationEditor } from '~/utils/approval-template-editor-additional-certifications'

export const createApprovalTemplateEditorTemplate = (
  approvalTemplate: ApprovalTemplateItem
): ApprovalTemplateEditorTemplate => ({
  id: String(approvalTemplate.id),
  publicationId: approvalTemplate.publicationId,
  publicationState: approvalTemplate.publicationState,
  publicationVersionId: approvalTemplate.publicationVersionId,
  publicationVersion: approvalTemplate.publicationVersion,
  hasUnpublishedChanges: approvalTemplate.hasUnpublishedChanges,
  egcs_cn_description_en: approvalTemplate.egcs_cn_description_en,
  egcs_cn_description_fr: approvalTemplate.egcs_cn_description_fr,
  egcs_cn_name_en: approvalTemplate.egcs_cn_name_en,
  egcs_cn_name_fr: approvalTemplate.egcs_cn_name_fr,
  egcs_cn_allowadditionalapprovals: approvalTemplate.egcs_cn_allowadditionalapprovals,
  egcs_cn_defaultaddedapprovalname_en: approvalTemplate.egcs_cn_defaultaddedapprovalname_en,
  egcs_cn_defaultaddedapprovalname_fr: approvalTemplate.egcs_cn_defaultaddedapprovalname_fr,
  egcs_cn_allowaddedapprovalnamechanges: approvalTemplate.egcs_cn_allowaddedapprovalnamechanges,
  egcs_cn_allowaddedapprovalcertificationchanges: approvalTemplate.egcs_cn_allowaddedapprovalcertificationchanges,
  additionalApprovalCertifications: (approvalTemplate.additionalApprovalCertifications ?? [])
    .map(item => createAdditionalApprovalCertificationEditor(item)),
  steps: (approvalTemplate.steps ?? []).map(item => createApprovalTemplateEditorStep(item))
})
