/* eslint-disable jsdoc/require-jsdoc */
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import type { MaybeRefOrGetter, Ref } from 'vue'
import { ref, shallowRef, toValue, watch } from 'vue'

type AgreementOverviewStatus = 'idle' | 'pending' | 'success' | 'error'

export const useAgreementOverview = <T>(url: MaybeRefOrGetter<string>) => {
  const overview: Ref<T | null> = ref(null)
  const overviewStatus = shallowRef<AgreementOverviewStatus>('idle')
  let requestGeneration = 0

  const refreshOverview = async () => {
    const generation = ++requestGeneration
    const requestUrl = toValue(url)
    try {
      overviewStatus.value = 'pending'
      const response = await fetch(getClientRequestUrl(requestUrl))
      if (!response.ok) {
        await throwFetchResponseError(response)
      }
      const responseBody = await response.json() as T
      if (generation !== requestGeneration || requestUrl !== toValue(url)) return false
      overview.value = responseBody
      overviewStatus.value = 'success'
      return true
    } catch {
      if (generation !== requestGeneration || requestUrl !== toValue(url)) return false
      overviewStatus.value = 'error'
      return false
    }
  }

  watch(
    () => toValue(url),
    () => {
      overview.value = null
      void refreshOverview()
    },
    { immediate: true }
  )

  return {
    overview,
    overviewStatus,
    refreshOverview
  }
}
