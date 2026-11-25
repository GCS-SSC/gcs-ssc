import { computed, shallowRef, toValue, watch } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { $Fetch } from 'ofetch'
import type { AgreementSubmissionCommand, AgreementSubmissionDetail, AgreementSubmissionList } from '~~/shared/types/agreement-submission'
import { useActionContext } from './useActionContext'
import { useCommittedSettlement } from './useCommittedSettlement'
import { useOperationLane } from './useOperationLane'
import { useResourceRequest } from './useResourceRequest'

type CollectionActivation = { kind: 'inactive' } | { kind: 'activated' }
type StandaloneDecisionResult =
  | { kind: 'unavailable' }
  | { kind: 'committed'; detail: AgreementSubmissionDetail }

/**
 * Keeps standalone decisions and their collection readback alive across section changes.
 * @param options - The Agreement page's collection context.
 * @param options.agreementId - The current owning Agreement.
 * @param options.active - Whether the Submissions section is selected.
 * @returns Collection evidence, the security identity, and standalone decision transport.
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
  const lane = useOperationLane<string>()
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

  const captureSettlement = useCommittedSettlement({
    context: useActionContext({ identity: [agreementId], authority: () => Boolean(user.value) }),
    settle: async () => await collection.refresh()
      ? { kind: 'available' }
      : { kind: 'unavailable', error: collection.error.value }
  })
  const operationKey = (submissionId: string) => `${agreementId()}:${submissionId}`

  /**
   * Captures the Agreement and target before issuing the standalone command.
   * @param submissionId - Record to transition.
   * @param command - Validated decision.
   * @returns The acknowledged record for the initiating editor, independently of collection readback.
   */
  const sendCommand = async (submissionId: string, command: AgreementSubmissionCommand): Promise<StandaloneDecisionResult> => {
    const key = operationKey(submissionId)
    const settlement = captureSettlement()
    if (!settlement?.canDispatch()) return { kind: 'unavailable' }
    const release = lane.acquire(key)
    if (!release) return { kind: 'unavailable' }
    const url = `${apiPath.value}/${submissionId}`
    let committed: AgreementSubmissionDetail
    try {
      committed = await fetchJson<AgreementSubmissionDetail>(url, { method: 'POST', body: command })
    } catch (error) {
      release()
      throw error
    }
    void settlement.settle().finally(release)
    return { kind: 'committed', detail: committed }
  }

  /**
   * @param submissionId - The record whose lane must be checked.
   * @returns Whether transport or committed readback still owns the lane.
   */
  const isPending = (submissionId: string) => lane.isPending(operationKey(submissionId))
  return { collection, identity, apiPath, sendCommand, isPending }
}
