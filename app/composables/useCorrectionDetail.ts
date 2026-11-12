import { computed, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { CorrectionDetail } from '~~/shared/types/correction'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { useResourceRequest } from '~/composables/useResourceRequest'

/**
 * Loads retained Correction evidence without requesting its parent or live sources.
 *
 * @param agreementId - Owning Agreement from the nested route.
 * @param correctionId - Independent Correction identity.
 * @returns Retained detail, durable request state and an isolated reload.
 */
export const useCorrectionDetail = (agreementId: MaybeRefOrGetter<string>, correctionId: MaybeRefOrGetter<string>) => {
  const identity = computed(() => `${toValue(agreementId)}:${toValue(correctionId)}`)
  return useResourceRequest<CorrectionDetail>({
    identity,
    /**
     * Loads retained evidence and validates route containment.
     * @param signal - Cancellation for this exact request.
     * @returns Independently authorized retained detail.
     */
    load: async signal => {
      const expectedParent = toValue(agreementId)
      const expectedId = toValue(correctionId)
      const response = await fetch(getClientRequestUrl(`/api/corrections/${expectedId}`), { signal })
      if (!response.ok) await throwFetchResponseError(response)
      const detail = await response.json() as CorrectionDetail
      if (detail.egcs_fc_fundingagreement !== expectedParent || detail.id !== expectedId) throw new Error('Correction route containment failed')
      return detail
    }
  })
}
