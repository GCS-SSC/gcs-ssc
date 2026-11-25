import { computed, shallowRef, toValue, watch } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { $Fetch } from 'ofetch'
import type { AgreementSubmissionList } from '~~/shared/types/agreement-submission'
import { useResourceRequest } from './useResourceRequest'

type CollectionActivation = { kind: 'inactive' } | { kind: 'activated' }
/**
 * Keeps Submission collection evidence alive across section changes.
 * @param options - The Agreement page's collection context.
 * @param options.agreementId - The current owning Agreement.
 * @param options.active - Whether the Submissions section is selected.
 * @returns Collection evidence, the security identity, and the API path.
 */
export const useAgreementSubmissionCollection = (options: {
  agreementId: MaybeRefOrGetter<string>
  active: MaybeRefOrGetter<boolean>
}) => {
  const { user, permissionRevision } = useAuth()
  const agreementId = () => toValue(options.agreementId)
  const identity = computed(() => JSON.stringify([agreementId(), user.value?.id, permissionRevision.value]))
  const apiPath = computed(() => `/api/agreements/${agreementId()}/submissions`)
  const fetchJson: $Fetch = $fetch as $Fetch
  const activation = shallowRef<CollectionActivation>({ kind: 'inactive' })
  const collection = useResourceRequest<AgreementSubmissionList>({
    identity,
    enabled: () => activation.value.kind === 'activated' && Boolean(user.value),
    failureData: error => error && typeof error === 'object' && 'statusCode' in error
      && [401, 403, 404, 410].some(code => code === error.statusCode)
      ? 'clear'
      : 'retain',
    load: signal => fetchJson<AgreementSubmissionList>(apiPath.value, { signal })
  })
  watch(() => toValue(options.active), active => {
    if (!active) return
    if (activation.value.kind === 'inactive') activation.value = { kind: 'activated' }
    else if (collection.status.value !== 'pending') void collection.refresh()
  }, { immediate: true })

  return { collection, identity, apiPath }
}
