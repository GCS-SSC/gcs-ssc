import { computed, watch } from 'vue'
import { createStatusCatalogClient } from '~/composables/useStatusCatalog'
import { authClient } from '~~/app/utils/auth-client'

export default defineNuxtPlugin(() => {
  const session = authClient.useSession()
  const userId = computed(() => session.value.data?.user?.id ?? 'anon')
  const catalog = createStatusCatalogClient({
    initialUserId: userId.value,
    fetcher: async (input, init) => await globalThis.fetch(input, init)
  })
  watch(userId, catalog.setUser, { flush: 'sync' })
  return { provide: { statusCatalog: catalog } }
})
