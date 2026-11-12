/* eslint-disable jsdoc/require-jsdoc */
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { useResourceRequest } from '~/composables/useResourceRequest'
import type { MaybeRefOrGetter } from 'vue'
import { toValue } from 'vue'

export const useAgreementOverview = <T>(url: MaybeRefOrGetter<string>) => {
  const request = useResourceRequest<T>({
    identity: url,
    load: async signal => {
      const response = await fetch(getClientRequestUrl(toValue(url)), { signal })
      if (!response.ok) await throwFetchResponseError(response)
      return response.json()
    }
  })

  return {
    overview: request.data,
    overviewStatus: request.status,
    refreshOverview: request.refresh
  }
}
