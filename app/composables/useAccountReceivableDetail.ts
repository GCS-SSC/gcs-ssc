import { computed, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { AccountReceivableDetail } from '~~/shared/types/account-receivable'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { useResourceRequest } from '~/composables/useResourceRequest'

/**
 * Loads retained Accounts Receivable evidence without requesting its parent or live sources.
 *
 * @param agreementId - Owning Agreement from the nested route.
 * @param accountReceivableId - Independent Accounts Receivable identity.
 * @returns Retained detail, durable request state and an isolated reload.
 */
export const useAccountReceivableDetail = (agreementId: MaybeRefOrGetter<string>, accountReceivableId: MaybeRefOrGetter<string>) => {
  const identity = computed(() => `${toValue(agreementId)}:${toValue(accountReceivableId)}`)
  return useResourceRequest<AccountReceivableDetail>({
    identity,
    /**
     * Loads retained evidence and validates route containment.
     * @param signal - Cancellation for this exact request.
     * @returns Independently authorized retained detail.
     */
    load: async signal => {
      const expectedParent = toValue(agreementId)
      const expectedId = toValue(accountReceivableId)
      const response = await fetch(getClientRequestUrl(`/api/account-receivables/${expectedId}`), { signal })
      if (!response.ok) await throwFetchResponseError(response)
      const detail = await response.json() as AccountReceivableDetail
      if (detail.egcs_fc_fundingagreement !== expectedParent || detail.id !== expectedId) throw new Error('Accounts Receivable route containment failed')
      return detail
    }
  })
}
