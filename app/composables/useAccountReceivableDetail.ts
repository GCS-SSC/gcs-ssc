import { computed, onBeforeUnmount, ref, watch, toValue } from 'vue'
import type { MaybeRefOrGetter, Ref } from 'vue'
import type { AccountReceivableDetail } from '~~/shared/types/account-receivable'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'

/**
 * Loads retained Accounts Receivable evidence without requesting its parent or live sources.
 *
 * @param agreementId - Owning Agreement from the nested route.
 * @param accountReceivableId - Independent Accounts Receivable identity.
 * @returns Retained detail, durable request state and an isolated reload.
 */
export const useAccountReceivableDetail = (agreementId: MaybeRefOrGetter<string>, accountReceivableId: MaybeRefOrGetter<string>) => {
  const data: Ref<AccountReceivableDetail | null> = ref(null)
  const status: Ref<'idle' | 'pending' | 'success' | 'error'> = ref('idle')
  const error: Ref<unknown | null> = ref(null)
  const identity = computed(() => `${toValue(agreementId)}:${toValue(accountReceivableId)}`)
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
    const expectedAgreement = toValue(agreementId)
    controller?.abort()
    controller = new AbortController()
    status.value = 'pending'
    error.value = null
    try {
      const response = await fetch(getClientRequestUrl(`/api/account-receivables/${toValue(accountReceivableId)}`), { signal: controller.signal })
      if (!response.ok) await throwFetchResponseError(response)
      const detail = await response.json() as AccountReceivableDetail
      if (disposed || requestGeneration !== generation || requestIdentity !== identity.value) return false
      if (detail.egcs_fc_fundingagreement !== expectedAgreement || detail.id !== toValue(accountReceivableId)) throw new Error('Accounts Receivable route containment failed')
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
