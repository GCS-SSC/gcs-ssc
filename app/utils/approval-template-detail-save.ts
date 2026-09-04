import { throwFetchResponseError } from '~/utils/fetch-error'
import type { ApprovalTemplate } from '~~/shared/types/schemas'
import type { ApprovalTemplateEditorTemplate } from '~/types/approval-template-editor'

export interface ApprovalTemplateDetailSaveOptions {
  state: ApprovalTemplateEditorTemplate | null
  requestUrl: RequestInfo | URL
  validate: (payload: ApprovalTemplate) => Promise<Array<{ message?: unknown }>>
  toast: {
    add: (notification: { title: string, description: string, color: 'error' | 'success' }) => void
  }
  t: (key: string) => string
  showError: (error: unknown) => void
  showSuccess?: boolean
}

/**
 * Builds the persisted approval template payload from the detail editor state.
 *
 * @param state - Current approval template editor state.
 * @returns API payload with ordered steps and certifications.
 */
export const buildApprovalTemplateDetailPayload = (
  state: ApprovalTemplateEditorTemplate
): ApprovalTemplate => ({
  egcs_cn_description_en: state.egcs_cn_description_en,
  egcs_cn_description_fr: state.egcs_cn_description_fr,
  egcs_cn_name_en: state.egcs_cn_name_en,
  egcs_cn_name_fr: state.egcs_cn_name_fr,
  egcs_cn_allowadditionalapprovals: state.egcs_cn_allowadditionalapprovals,
  egcs_cn_defaultaddedapprovalname_en: state.egcs_cn_defaultaddedapprovalname_en,
  egcs_cn_defaultaddedapprovalname_fr: state.egcs_cn_defaultaddedapprovalname_fr,
  egcs_cn_allowaddedapprovalnamechanges: state.egcs_cn_allowaddedapprovalnamechanges,
  egcs_cn_allowaddedapprovalcertificationchanges: state.egcs_cn_allowaddedapprovalcertificationchanges,
  additionalApprovalCertifications: state.additionalApprovalCertifications
    .toSorted((left, right) => left.egcs_cn_order - right.egcs_cn_order)
    .map(certification => ({
      ...(certification.id ? { id: certification.id } : {}),
      egcs_cn_order: certification.egcs_cn_order,
      egcs_cn_description_en: certification.egcs_cn_description_en,
      egcs_cn_description_fr: certification.egcs_cn_description_fr,
      egcs_cn_name_en: certification.egcs_cn_name_en,
      egcs_cn_name_fr: certification.egcs_cn_name_fr,
      egcs_cn_optional: certification.egcs_cn_optional,
      egcs_cn_certification_en: certification.egcs_cn_certification_en,
      egcs_cn_certification_fr: certification.egcs_cn_certification_fr
    })),
  steps: state.steps
    .toSorted((left, right) => left.egcs_cn_sequence - right.egcs_cn_sequence)
    .map(step => ({
      ...(step.id ? { id: step.id } : {}),
      egcs_cn_sequence: step.egcs_cn_sequence,
      egcs_cn_description_en: step.egcs_cn_description_en,
      egcs_cn_description_fr: step.egcs_cn_description_fr,
      egcs_cn_name_en: step.egcs_cn_name_en,
      egcs_cn_name_fr: step.egcs_cn_name_fr,
      egcs_cn_defaultuser: step.egcs_cn_defaultuser,
      egcs_cn_approvertitle: step.egcs_cn_approvertitle,
      certifications: step.certifications
        .toSorted((left, right) => left.egcs_cn_order - right.egcs_cn_order)
        .map(certification => ({
          ...(certification.id ? { id: certification.id } : {}),
          egcs_cn_order: certification.egcs_cn_order,
          egcs_cn_description_en: certification.egcs_cn_description_en,
          egcs_cn_description_fr: certification.egcs_cn_description_fr,
          egcs_cn_name_en: certification.egcs_cn_name_en,
          egcs_cn_name_fr: certification.egcs_cn_name_fr,
          egcs_cn_optional: certification.egcs_cn_optional,
          egcs_cn_certification_en: certification.egcs_cn_certification_en,
          egcs_cn_certification_fr: certification.egcs_cn_certification_fr
        }))
    }))
})

/**
 * Saves an approval template detail editor state through the existing PATCH flow.
 *
 * @param options - Save dependencies and current editor state.
 * @returns Whether validation and persistence completed successfully.
 */
export const saveApprovalTemplateDetail = async (options: ApprovalTemplateDetailSaveOptions): Promise<boolean> => {
  const {
    state,
    requestUrl,
    validate,
    toast,
    t,
    showError,
    showSuccess = true
  } = options
  if (!state) {
    return false
  }

  try {
    const payload = buildApprovalTemplateDetailPayload(state)
    const result = await validate(payload)
    if (result.length > 0) {
      toast.add({
        title: t('common.error'),
        description: t(String(result[0]?.message ?? 'common.error')),
        color: 'error'
      })
      return false
    }

    const response = await fetch(requestUrl, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      await throwFetchResponseError(response)
    }
    if (showSuccess) {
      toast.add({
        title: t('common.success'),
        description: t('common.updated_success'),
        color: 'success'
      })
    }
    return true
  } catch (error) {
    showError(error)
    return false
  }
}
