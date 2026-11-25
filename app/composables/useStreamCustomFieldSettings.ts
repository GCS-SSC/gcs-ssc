import { computed, toValue, watch } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { useActionContext } from '~/composables/useActionContext'
import { useCommittedSettlement } from '~/composables/useCommittedSettlement'
import { useConfirmDeleteRequest } from '~/composables/useConfirmDeleteRequest'
import type { DeleteTarget } from '~/composables/useConfirmDeleteRequest'
import { useOperationLane } from '~/composables/useOperationLane'
import { useResourceRequest } from '~/composables/useResourceRequest'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import type { AgreementCustomFieldSection, AssignedAgencyCustomFieldDefinition } from '~~/shared/types/schemas/agreement-custom-fields'
import type { StreamFieldAssignmentTarget } from '~~/shared/types/database'
import { StreamSubmissionPolicySchema } from '~~/shared/types/schemas/stream-submission-policy'

type StreamFieldCatalog = { items: AssignedAgencyCustomFieldDefinition[]; sections: AgreementCustomFieldSection[] }

/**
 * Owns Stream configuration reads, acknowledged readback, and transport locks across section changes.
 * @param options - Stream settings scope.
 * @param options.baseUrl - Fixed Stream endpoint.
 * @param options.canUpdate - Capability for catalog writes.
 * @param options.canConfigurePolicy - Capability for policy writes.
 * @param options.selected - Currently selected Stream configuration section.
 * @returns Independent catalogs and the policy resource for the Stream detail tabs.
 */
export const useStreamCustomFieldSettings = (options: {
  baseUrl: string
  canUpdate: MaybeRefOrGetter<boolean>
  canConfigurePolicy: MaybeRefOrGetter<boolean>
  selected: () => StreamFieldAssignmentTarget | 'policy' | null
}) => {
  const { user, permissionRevision } = useAuth()
  const { confirmDeleteRequest } = useConfirmDeleteRequest()

  /**
   * Creates a lazy parent resource whose actor-specific reads outlive the section.
   * @param endpoint - Fixed Stream setting endpoint.
   * @param section - Section that activates the initial read.
   * @param authority - Role capability for writes.
   * @param decode - Decoder for the successful response.
   * @returns The request, scope identity, transport locks, and committed readback.
   */
  const openResource = <T>(
    endpoint: string,
    section: StreamFieldAssignmentTarget | 'policy',
    authority: MaybeRefOrGetter<boolean>,
    decode: (response: Response) => Promise<T>
  ) => {
    const identity = computed(() => JSON.stringify([endpoint, user.value?.id, permissionRevision.value, toValue(authority)]))
    const request = useResourceRequest({
      identity,
      enabled: () => Boolean(user.value?.id),
      trigger: 'refresh',
      /**
       * @param signal - Cancellation for this authorized read.
       * @returns The decoded Stream setting.
       */
      load: async signal => {
        const response = await fetch(getClientRequestUrl(endpoint), { signal })
        if (!response.ok) await throwFetchResponseError(response)
        return await decode(response)
      }
    })
    const writes = useOperationLane<string>()
    watch([options.selected, request.status, writes.hasPending], ([selected, status, pending]) => {
      if (selected === section && status === 'idle' && !pending) void request.refresh()
    }, { immediate: true })

    const context = useActionContext({
      identity: [() => endpoint],
      authority,
      eligible: () => request.status.value === 'success'
    })
    const captureCommitted = useCommittedSettlement({
      context,
      settle: async () => await request.refresh()
        ? { kind: 'available' }
        : { kind: 'unavailable', error: request.error.value }
    })
    return { request, identity, captureCommitted, context, writes }
  }

  /**
   * Creates a catalog with a parent-owned delete command.
   * @param target - Product entity receiving the assigned fields.
   * @returns Catalog evidence, write locks, and committed settlement.
   */
  const fieldCatalog = (target: StreamFieldAssignmentTarget) => {
    const endpoint = `${options.baseUrl}/${target === 'agreement' ? 'custom-fields' : `${target}-custom-fields`}`
    const { request, identity, captureCommitted, context, writes } = openResource<StreamFieldCatalog>(
      endpoint, target, options.canUpdate, response => response.json()
    )
    /**
     * Confirms against the current opening and finishes readback in the Stream detail scope.
     * @param path - Fixed deletion endpoint.
     * @param target - Accepted row resolver with its captured identity.
     * @param shouldProceed - Admission for the initiating child or action.
     */
    const remove = async <Row>(path: string, target: DeleteTarget<Row>, shouldProceed: () => boolean) => {
      const operation = context.capture()
      const committed = captureCommitted()
      if (!operation || !committed) return
      const release = writes.acquire(path)
      if (!release) return
      try {
        if (await confirmDeleteRequest(path, {
          operation,
          target: { id: target.id, resolve: target.resolve, eligible: target.eligible },
          shouldProceed
        })) await committed.settle()
      } finally {
        release()
      }
    }
    return { request, identity, captureCommitted, writes, remove }
  }

  const policyEndpoint = `${options.baseUrl}/submission-policy`
  return {
    agreement: fieldCatalog('agreement'),
    activity: fieldCatalog('activity'),
    claim: fieldCatalog('claim'),
    forecast: fieldCatalog('forecast'),
    policy: {
      ...openResource(policyEndpoint, 'policy', options.canConfigurePolicy,
        async response => StreamSubmissionPolicySchema.parse(await response.json())),
      endpoint: policyEndpoint
    }
  }
}

export type StreamCustomFieldCatalog = ReturnType<typeof useStreamCustomFieldSettings>[StreamFieldAssignmentTarget]
export type StreamSubmissionPolicySettings = ReturnType<typeof useStreamCustomFieldSettings>['policy']
