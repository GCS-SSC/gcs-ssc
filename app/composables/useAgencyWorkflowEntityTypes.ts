import { computed, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { FetchError } from 'ofetch'
import type { WorkflowEntityTypesResponse } from '~~/shared/types/workflow-catalog'

/**
 * Loads Agency workflow targets and the selected target's supported purposes.
 * @param agencyId Agency that owns the workflow catalog.
 * @param entityType Selected workflow target identity.
 * @returns Bilingual target metadata, supported purposes and request recovery.
 */
export const useAgencyWorkflowEntityTypes = (
  agencyId: MaybeRefOrGetter<string>,
  entityType: MaybeRefOrGetter<string | undefined>
) => {
  const { t } = useI18n()
  const { data, error, status, refresh } = useFetch<WorkflowEntityTypesResponse, FetchError, string>(
    () => `/api/agency/${toValue(agencyId)}/workflows/entity-types`
  )
  const entityTypes = computed(() => data.value?.items ?? [])
  const purposeOptions = computed(() => {
    const target = entityTypes.value.find(item => item.entityType === toValue(entityType))
    return (target?.workflowPurposes ?? []).map(value => ({ value, label: t(`workflow.purposes.${value}`) }))
  })
  return { entityTypes, purposeOptions, error, status, refresh }
}
