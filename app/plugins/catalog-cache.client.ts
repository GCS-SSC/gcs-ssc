import { computed, watch } from 'vue'
import { authClient } from '~/utils/auth-client'
import { createCatalogCacheClient } from '~/utils/catalog-cache-client'
import { setCatalogCacheClient } from '~/utils/catalog-cache'

export default defineNuxtPlugin({
  name: 'catalog-cache',
  enforce: 'pre',
  dependsOn: ['nuxt:router'],
  /**
   * Installs the browser boundary before page and control requests start.
   * @param nuxtApp - Application router and plugin lifecycle.
   */
  setup: nuxtApp => {
    let storage: Storage | undefined
    try {
      storage = window.localStorage
    } catch { /* Restricted storage still permits an in-memory check. */ }
    const session = authClient.useSession()
    const client = createCatalogCacheClient({
      storage,
      /** Waits for Better Auth's existing session query before identifying a catalog request. */
      waitForIdentity: async () => {
        if (!session.value.isPending) return
        await new Promise<void>(resolve => {
          const stop = watch(() => session.value.isPending, pending => {
            if (pending) return
            stop()
            resolve()
          }, { flush: 'sync' })
        })
      }
    })
    const nativeFetch = globalThis.fetch
    globalThis.fetch = client.fetch
    setCatalogCacheClient(client)
    const identity = computed(() => {
      const data = session.value.data
      return data?.user.id && data.session.id ? { accountId: data.user.id, sessionId: data.session.id } : null
    })
    const stopSessionWatch = watch(identity, next => {
      client.setIdentity(next)
      if (next) void client.checkVersions().catch(() => undefined)
    }, { immediate: true, flush: 'sync' })
    const removeNavigationHook = nuxtApp.$router.beforeEach(async () => {
      await client.checkVersions().catch(() => undefined)
    })
    if (import.meta.hot) {
      import.meta.hot.dispose(() => {
        stopSessionWatch()
        removeNavigationHook()
        globalThis.fetch = nativeFetch
        setCatalogCacheClient(null)
      })
    }
  }
})
