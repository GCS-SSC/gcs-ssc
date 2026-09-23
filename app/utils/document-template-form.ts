/* eslint-disable jsdoc/require-jsdoc */
import type { AgencyDocumentTemplateItem } from '~~/shared/types/schemas'

export type DocumentTemplateFormState = Partial<AgencyDocumentTemplateItem> & {
  fileEn?: File | null
  fileFr?: File | null
}

export const buildDocumentTemplateFormData = (item: DocumentTemplateFormState) => {
  const formData = new FormData()
  const fields = [
    'egcs_ay_entitytype', 'egcs_ay_name_en', 'egcs_ay_name_fr',
    'egcs_ay_description_en', 'egcs_ay_description_fr', 'egcs_ay_templatekind',
    'egcs_ay_outputformats', 'egcs_ay_active'
  ] as const
  for (const field of fields) {
    const value = item[field]
    if (value !== undefined && value !== null) {
      formData.append(field, Array.isArray(value) ? JSON.stringify(value) : String(value))
    }
  }
  if (item.fileEn) formData.append('fileEn', item.fileEn)
  if (item.fileFr) formData.append('fileFr', item.fileFr)
  return formData
}

export const getDocumentTemplateSaveRequest = (agencyId: string, item: DocumentTemplateFormState) => {
  const isUpdate = Boolean(item.id)
  const baseUrl = `/api/agency/${agencyId}/document-templates`
  return { isUpdate, method: isUpdate ? 'PATCH' : 'POST', url: isUpdate ? `${baseUrl}/${item.id}` : baseUrl } as const
}
