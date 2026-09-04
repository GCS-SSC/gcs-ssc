import type { Ref } from 'vue'
import { throwFetchResponseError } from '~/utils/fetch-error'

export interface AssessmentModalSubmitRequest {
  url: string
  method: 'PATCH' | 'POST'
}

export interface SubmitAssessmentModalRequestOptions {
  isSubmitting: Ref<boolean>
  session: Ref<number>
  open: Ref<boolean>
  request: AssessmentModalSubmitRequest
  data: unknown
  buildRequestUrl: (path: string) => RequestInfo | URL
  emitSaved: () => void
  showError: (error: unknown) => void
}

/**
 * Builds the submit request for an assessment set modal.
 *
 * @param transferPaymentId - Transfer payment profile id.
 * @param streamId - Transfer payment stream id.
 * @param assessmentSetId - Existing assessment set id, when updating.
 * @returns Submit request URL and method.
 */
export const buildAssessmentSetSubmitRequest = (
  transferPaymentId: string,
  streamId: string,
  assessmentSetId: string | null
): AssessmentModalSubmitRequest => ({
  url: assessmentSetId
    ? `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/assessment-sets/${assessmentSetId}`
    : `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/assessment-sets`,
  method: assessmentSetId ? 'PATCH' : 'POST'
})

/**
 * Builds the submit request for an assessment set item modal.
 *
 * @param transferPaymentId - Transfer payment profile id.
 * @param streamId - Transfer payment stream id.
 * @param assessmentSetId - Parent assessment set id.
 * @param itemId - Existing assessment item id, when updating.
 * @returns Submit request URL and method.
 */
export const buildAssessmentSetItemSubmitRequest = (
  transferPaymentId: string,
  streamId: string,
  assessmentSetId: string,
  itemId: string | null
): AssessmentModalSubmitRequest => ({
  url: itemId
    ? `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/assessment-sets/${assessmentSetId}/items/${itemId}`
    : `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/assessment-sets/${assessmentSetId}/items`,
  method: itemId ? 'PATCH' : 'POST'
})

/**
 * Submits an assessment modal request and closes the modal on success.
 *
 * @param options - Submit state and request dependencies.
 */
export const submitAssessmentModalRequest = async (options: SubmitAssessmentModalRequestOptions) => {
  if (options.isSubmitting.value) {
    return
  }

  const session = options.session.value
  try {
    options.isSubmitting.value = true
    const response = await fetch(options.buildRequestUrl(options.request.url), {
      method: options.request.method,
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(options.data)
    })
    if (!response.ok) {
      await throwFetchResponseError(response)
    }

    if (options.session.value !== session) return
    options.open.value = false
    options.emitSaved()
  } catch (error) {
    if (options.session.value === session) options.showError(error)
  } finally {
    if (options.session.value === session) options.isSubmitting.value = false
  }
}
