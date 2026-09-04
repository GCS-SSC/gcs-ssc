/* eslint-disable jsdoc/require-jsdoc */
import type { TransferPaymentStreamDocumentTemplateItem } from '~~/shared/types/schemas'

export type DocumentTemplateFormState = Partial<TransferPaymentStreamDocumentTemplateItem> & {
  fileEn?: File | null
  fileFr?: File | null
}

export const buildDocumentTemplateFormData = (item: DocumentTemplateFormState) => {
  const formData = new FormData()

  for (const [key, value] of Object.entries(item)) {
    if (key === 'fileEn' || key === 'fileFr' || key.startsWith('attachment_')) {
      continue
    }

    if (value !== undefined && value !== null) {
      formData.append(key, String(value))
    }
  }

  if (item.fileEn) {
    formData.append('fileEn', item.fileEn)
  }

  if (item.fileFr) {
    formData.append('fileFr', item.fileFr)
  }

  return formData
}

export const getDocumentTemplateSaveRequest = (
  transferPaymentId: string,
  streamId: string,
  item: DocumentTemplateFormState
) => {
  const isUpdate = Boolean(item.id)
  const baseUrl = `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/document-templates`

  return {
    isUpdate,
    method: isUpdate ? 'PATCH' : 'POST',
    url: isUpdate ? `${baseUrl}/${item.id}` : baseUrl
  } as const
}
