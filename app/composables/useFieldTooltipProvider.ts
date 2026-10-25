import { computed, onScopeDispose, provide, shallowRef, toValue, watch } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { fieldTooltipKey, fieldTooltipRefreshKey } from '~/utils/field-tooltip-context'
import { getClientRequestUrl } from '~/utils/client-request-url'
import type { FieldTooltipResource, FieldTooltipRuntime } from '~/utils/field-tooltip-context'

/**
 * Loads optional help once for an explicitly authorized business context.
 * @param resource - Authorized business resource owning this screen.
 * @returns The current resource’s optional field help.
 */
export const useFieldTooltipProvider = (resource: MaybeRefOrGetter<FieldTooltipResource | null | undefined>) => {
  const items = shallowRef<FieldTooltipRuntime['items']>([])
  let revision = 0
  let controller: AbortController | null = null
  /** Reloads optional help after configuration changes while rejecting stale owners. */
  const refresh = async () => {
    const current = ++revision
    controller?.abort()
    items.value = []
    const value = toValue(resource)
    if (!value?.entityId) return
    controller = new AbortController()
    try {
      const query = new URLSearchParams({ entityType: value.entityType, entityId: value.entityId })
      const response = await fetch(getClientRequestUrl(`/api/field-tooltips/runtime?${query}`), { signal: controller.signal })
      if (!response.ok) return
      const result: FieldTooltipRuntime = await response.json()
      if (revision === current) items.value = result.items
    } catch {
      // Optional help must not interrupt the business screen when unavailable.
    }
  }
  watch(() => {
    const value = toValue(resource)
    return value ? `${value.entityType}:${value.entityId}` : null
  }, refresh, { immediate: true, flush: 'sync' })
  onScopeDispose(() => {
    revision += 1
    controller?.abort()
  })
  provide(fieldTooltipKey, computed(() => items.value))
  provide(fieldTooltipRefreshKey, refresh)
  return { items: computed(() => items.value), refresh }
}
