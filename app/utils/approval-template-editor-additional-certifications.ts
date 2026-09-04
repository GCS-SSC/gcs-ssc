import { nanoid } from 'nanoid'
import type { AdditionalApprovalCertificationItem } from '~~/shared/types/schemas'
import type { AdditionalApprovalCertificationEditor } from '~/types/approval-template-editor'

/** Creates stable editor state for a template's user-added approval certification.
 * @param certification - Persisted certification values to copy into editor state.
 * @returns Certification editor state with a stable local key.
 */
export const createAdditionalApprovalCertificationEditor = (
  certification?: Partial<AdditionalApprovalCertificationItem>
): AdditionalApprovalCertificationEditor => ({
  id: certification?.id ?? '',
  _key: nanoid(),
  egcs_cn_order: typeof certification?.egcs_cn_order === 'number' ? certification.egcs_cn_order : 1,
  egcs_cn_description_en: certification?.egcs_cn_description_en ?? '',
  egcs_cn_description_fr: certification?.egcs_cn_description_fr ?? '',
  egcs_cn_name_en: certification?.egcs_cn_name_en ?? '',
  egcs_cn_name_fr: certification?.egcs_cn_name_fr ?? '',
  egcs_cn_optional: certification?.egcs_cn_optional === true,
  egcs_cn_certification_en: certification?.egcs_cn_certification_en ?? '',
  egcs_cn_certification_fr: certification?.egcs_cn_certification_fr ?? ''
})
