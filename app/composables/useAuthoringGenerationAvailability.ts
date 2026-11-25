import { ofetch } from 'ofetch'
import { computed, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { useResourceRequest } from '~/composables/useResourceRequest'

/**
 * Reads the enabled Agency capability under the current actor and permission revision.
 * @param agencyId - Current Agency ID.
 * @returns Whether generation is enabled.
 */
export const useAuthoringGenerationAvailability = (agencyId: MaybeRefOrGetter<string>) => {
  const { user, permissionRevision } = useAuth()
  const { data } = useResourceRequest({
    identity: () => JSON.stringify([toValue(agencyId), user.value?.id, permissionRevision.value]),
    enabled: () => Boolean(toValue(agencyId) && user.value?.id),
    load: signal => ofetch<{ enabled: boolean }>(
      getClientRequestUrl(`/api/agency/${encodeURIComponent(toValue(agencyId))}/authoring-generation`).toString(), { signal }
    )
  })
  return computed(() => data.value?.enabled === true)
}
