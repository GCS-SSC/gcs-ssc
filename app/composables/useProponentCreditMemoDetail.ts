import { computed, onBeforeUnmount, ref, watch, toValue } from 'vue'
import type { MaybeRefOrGetter, Ref } from 'vue'
import type { AccountReceivableCreditMemoDetail } from '~~/shared/types/account-receivable'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'

/**
 * Loads an independently authorized Proponent Credit Memo without live Agreement context.
 *
 * @param proponentId - Expected Proponent; null only for a historical entry redirect.
 * @param creditMemoId - Independently authorized Credit Memo identity.
 * @returns Retained detail, durable request state and an isolated reload.
 */
export const useProponentCreditMemoDetail = (proponentId: MaybeRefOrGetter<string | null>, creditMemoId: MaybeRefOrGetter<string>) => {
  const data: Ref<AccountReceivableCreditMemoDetail | null> = ref(null)
  const status: Ref<'idle' | 'pending' | 'success' | 'error'> = ref('idle')
  const error: Ref<unknown | null> = ref(null)
  const identity = computed(() => `${toValue(proponentId)}:${toValue(creditMemoId)}`)
  let generation = 0
  let disposed = false
  let controller: AbortController | null = null
  /**
   * Commits only a response for the current independent subject and parent identity.
   * @returns Whether current retained evidence was accepted.
   */
  const refresh = async () => {
    const requestGeneration = ++generation
    const requestIdentity = identity.value
    const expectedProponent = toValue(proponentId)
    controller?.abort()
    controller = new AbortController()
    status.value = 'pending'
    error.value = null
    try {
      const response = await fetch(getClientRequestUrl(`/api/account-receivable-credit-memos/${toValue(creditMemoId)}`), { signal: controller.signal })
      if (!response.ok) await throwFetchResponseError(response)
      const detail = await response.json() as AccountReceivableCreditMemoDetail
      if (disposed || requestGeneration !== generation || requestIdentity !== identity.value) return false
      if ((expectedProponent !== null && detail.egcs_fc_applicantrecipient !== expectedProponent) || detail.id !== toValue(creditMemoId)) throw new Error('Accounts Receivable route containment failed')
      data.value = detail
      status.value = 'success'
      return true
    } catch (failure) {
      if (disposed || requestGeneration !== generation || requestIdentity !== identity.value) return false
      error.value = failure
      status.value = 'error'
      return false
    }
  }
  watch(identity, () => {
    data.value = null
    void refresh()
  }, { immediate: true, flush: 'sync' })
  onBeforeUnmount(() => {
    disposed = true
    generation += 1
    controller?.abort()
  })
  return { data, status, error, refresh }
}
