import type { ApprovalTemplate } from '~~/shared/types/schemas'

export interface ApprovalTemplateModalSubmitRequest {
  url: string
  method: 'PATCH' | 'POST'
  body: Record<string, unknown>
}

/**
 * Builds the shared approval template payload used by create and update requests.
 *
 * @param state - Current approval template form state.
 * @returns API request body.
 */
const buildApprovalTemplateBody = (state: ApprovalTemplate & { id?: string }) => ({
  egcs_cn_name_en: state.egcs_cn_name_en,
  egcs_cn_name_fr: state.egcs_cn_name_fr,
  egcs_cn_description_en: state.egcs_cn_description_en,
  egcs_cn_description_fr: state.egcs_cn_description_fr,
  egcs_cn_allowadditionalapprovals: state.egcs_cn_allowadditionalapprovals,
  egcs_cn_defaultaddedapprovalname_en: state.egcs_cn_defaultaddedapprovalname_en,
  egcs_cn_defaultaddedapprovalname_fr: state.egcs_cn_defaultaddedapprovalname_fr,
  egcs_cn_allowaddedapprovalnamechanges: state.egcs_cn_allowaddedapprovalnamechanges,
  egcs_cn_allowaddedapprovalcertificationchanges: state.egcs_cn_allowaddedapprovalcertificationchanges,
  additionalApprovalCertifications: state.additionalApprovalCertifications,
  steps: state.steps
})

/**
 * Builds the submit request for the approval template modal.
 *
 * @param state - Current modal form state.
 * @param agencyId - Agency that owns the template.
 * @returns Request URL, method, and body.
 */
export const buildApprovalTemplateModalSubmitRequest = (
  state: ApprovalTemplate & { id?: string },
  agencyId: string
): ApprovalTemplateModalSubmitRequest => {
  const body = buildApprovalTemplateBody(state)
  if (state.id) {
    return {
      url: `/api/agency/${agencyId}/approval-templates/${state.id}`,
      method: 'PATCH',
      body
    }
  }

  return {
    url: `/api/agency/${agencyId}/approval-templates`,
    method: 'POST',
    body
  }
}
