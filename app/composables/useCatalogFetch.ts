import { createUseFetch } from '#imports'
import { defineUseFetchAddon } from 'nuxt/app'
import { toRaw } from 'vue'
import { getCatalogRequestUrl } from '~/utils/catalog-request-url'
import { useCatalogCacheRefresh } from './useCatalogCacheRefresh'

const catalogResponseRequests = new WeakMap<object, URL>()

const catalogMemory = defineUseFetchAddon({
  /**
   * Registers only the request belonging to this asynchronous data instance.
   * @param options - Nuxt's merged fetch options for this instance.
   * @returns The subscription setup for the resulting asynchronous data instance.
   */
  setup: options => {
    let requestUrl: URL | null = null
    options.onRequest.push(({ request, options: requestOptions }) => {
      const path = request instanceof Request ? request.url : String(request)
      requestUrl = getCatalogRequestUrl(path, requestOptions.query, requestOptions.baseURL)
    })
    options.onResponse.push(({ response }) => {
      const body: unknown = response._data
      if (requestUrl && body !== null && typeof body === 'object') catalogResponseRequests.set(toRaw(body), requestUrl)
    })
    return result => {
      useCatalogCacheRefresh(() => {
        const body = result.data.value
        // Nuxt can reuse shared data without executing this consumer's request hooks.
        requestUrl = (body !== null && typeof body === 'object' ? catalogResponseRequests.get(toRaw(body)) : undefined) ?? requestUrl
        return requestUrl
      }, change => {
        if (change.securityContextChanged) {
          result.clear()
          return
        }
        return result.refresh({ dedupe: 'cancel' }).then(() => !result.error.value)
      })
    }
  }
})

export const useCatalogFetch = createUseFetch({ addons: [catalogMemory] })
