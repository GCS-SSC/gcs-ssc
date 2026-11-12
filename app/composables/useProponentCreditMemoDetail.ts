import { computed, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { AccountReceivableCreditMemoDetail } from '~~/shared/types/account-receivable'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { useResourceRequest } from '~/composables/useResourceRequest'

/**
 * Loads an independently authorized Proponent Credit Memo without live Agreement context.
 *
 * @param proponentId - Expected Proponent; null only for a historical entry redirect.
 * @param creditMemoId - Independently authorized Credit Memo identity.
 * @returns Retained detail, durable request state and an isolated reload.
 */
export const useProponentCreditMemoDetail = (proponentId: MaybeRefOrGetter<string | null>, creditMemoId: MaybeRefOrGetter<string>) => {
  const identity = computed(() => `${toValue(proponentId)}:${toValue(creditMemoId)}`)
  return useResourceRequest<AccountReceivableCreditMemoDetail>({
    identity,
    /**
     * Loads retained evidence and validates route containment.
     * @param signal - Cancellation for this exact request.
     * @returns Independently authorized retained detail.
     */
    load: async signal => {
      const expectedParent = toValue(proponentId)
      const expectedId = toValue(creditMemoId)
      const response = await fetch(getClientRequestUrl(`/api/account-receivable-credit-memos/${expectedId}`), { signal })
      if (!response.ok) await throwFetchResponseError(response)
      const detail = await response.json() as AccountReceivableCreditMemoDetail
      if ((expectedParent !== null && detail.egcs_fc_applicantrecipient !== expectedParent) || detail.id !== expectedId) throw new Error('Accounts Receivable route containment failed')
      return detail
    }
  })
}
