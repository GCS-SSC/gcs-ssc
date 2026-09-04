import { computed, toValue, watch } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { AssignableEntityType } from '~~/shared/types/schemas'

export type EntityAssignment = {
  user_id: string
  name: string
  email: string
  is_primary: boolean
  is_inactive: boolean
  is_eligible: boolean
  is_current_user: boolean
}

export type EntityAssignmentRoster = {
  assignments: EntityAssignment[]
  can_manage_assignments: boolean
  is_assigned: boolean
  is_primary: boolean
}

/**
 * Loads presentation state for an exact-entity assignment roster.
 *
 * Authorization remains enforced by the server. Consumers use this state only to present the
 * appropriate working or read-only controls without duplicating assignment policy in the UI.
 * @param entityType Exact entity type whose roster is displayed.
 * @param entityId Exact entity identifier whose roster is displayed.
 * @param options Optional request controls.
 * @param options.enabled Whether the roster request may run.
 * @returns Reactive roster presentation state and refresh controls.
 */
export const useEntityAssignmentRoster = (
  entityType: MaybeRefOrGetter<AssignableEntityType>,
  entityId: MaybeRefOrGetter<string>,
  options: { enabled?: MaybeRefOrGetter<boolean> } = {}
) => {
  const endpoint = computed(() =>
    `/api/entity-assignments/${toValue(entityType)}/${toValue(entityId)}`
  )
  const enabled = computed(() => options.enabled === undefined || toValue(options.enabled))
  const { data, error, status, refresh } = useFetch<EntityAssignmentRoster, Error, string>(endpoint, {
    immediate: false,
    watch: false
  })
  watch([endpoint, enabled], ([, canLoad]) => {
    if (canLoad) void refresh()
  }, { immediate: true })

  return {
    roster: data,
    error,
    status,
    refresh,
    isAssigned: computed(() => data.value?.is_assigned === true),
    isPrimary: computed(() => data.value?.is_primary === true),
    canManageAssignments: computed(() => data.value?.can_manage_assignments === true)
  }
}
