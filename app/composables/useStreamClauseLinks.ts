/* eslint-disable jsdoc/require-jsdoc -- Stream section adapter uses the shared resource and action owners. */
import type { ComputedRef } from 'vue'
import { computed, ref, watch } from 'vue'
import type { StreamClauseLink } from '~~/shared/types/schemas/stream-clause'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { useActionContext } from '~/composables/useActionContext'
import { useCommittedSettlement } from '~/composables/useCommittedSettlement'
import { useResourceRequest } from '~/composables/useResourceRequest'

export const useStreamClauseLinks = (
  programId: string,
  streamId: string,
  agencyId: ComputedRef<string | null>,
  canUpdate: ComputedRef<boolean>,
  selected: () => boolean
) => {
  const endpoint = `/api/transfer-payments/${programId}/streams/${streamId}/clauses`
  const lookupUrl = `/api/transfer-payments/${programId}/streams/${streamId}/lookups/clauses`
  const { t } = useI18n()
  const { user, permissionRevision } = useAuth()
  const { showError } = useApiErrorToast()
  const { confirmDeleteRequest } = useConfirmDeleteRequest()
  const busy = ref(false)
  const request = useResourceRequest<{ items: StreamClauseLink[] }>({
    identity: () => JSON.stringify([endpoint, agencyId.value, user.value?.id, permissionRevision.value]),
    enabled: () => Boolean(agencyId.value),
    trigger: 'refresh',
    load: async signal => {
      const response = await fetch(getClientRequestUrl(endpoint), { signal })
      if (!response.ok) await throwFetchResponseError(response)
      return await response.json()
    }
  })
  const context = useActionContext({
    identity: [() => programId, () => streamId, agencyId],
    authority: canUpdate
  })
  const formContext = useActionContext({
    identity: [() => programId, () => streamId, agencyId],
    authority: canUpdate,
    eligible: selected
  })
  watch([selected, request.status, agencyId], ([isSelected, status, currentAgencyId]) => {
    if (isSelected && status === 'idle' && currentAgencyId) void request.refresh()
  }, { immediate: true })

  const captureCommitted = useCommittedSettlement({
    context,
    settle: async () => await request.refresh()
      ? { kind: 'available' }
      : { kind: 'unavailable', error: request.error.value }
  })

  const add = async (clauseId: string) => {
    const operation = formContext.capture()
    const committed = captureCommitted()
    if (busy.value || !operation?.canDispatch() || !committed?.canDispatch()) return false
    busy.value = true
    try {
      const response = await fetch(getClientRequestUrl(endpoint), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ egcs_tp_clause: clauseId })
      })
      if (!response.ok) await throwFetchResponseError(response)
      await committed.settle()
      return true
    } finally {
      busy.value = false
    }
  }

  const remove = async (link: StreamClauseLink) => {
    const operation = formContext.capture()
    const committed = captureCommitted()
    if (busy.value || !operation?.canDispatch() || !committed?.canDispatch()) return
    busy.value = true
    try {
      const removed = await confirmDeleteRequest(`${endpoint}/${link.id}`, {
        title: t('transfer_payment.stream_clause_unlink'),
        confirmLabel: t('transfer_payment.stream_clause_unlink'),
        description: t('transfer_payment.stream_clause_unlink_confirm'),
        operation,
        target: {
          id: link.id,
          resolve: () => request.data.value?.items.find(item => item.id === link.id),
          eligible: item => item.egcs_tp_clause === link.egcs_tp_clause
        },
        shouldProceed: committed.canDispatch
      })
      if (removed) await committed.settle()
    } catch (error: unknown) {
      if (operation.canDispatch()) showError(error)
    } finally {
      busy.value = false
    }
  }

  return {
    props: computed(() => ({
      items: request.data.value?.items ?? [],
      status: request.status.value,
      refresh: request.refresh,
      canUpdate: canUpdate.value,
      lookupUrl,
      busy: busy.value,
      actionContext: formContext,
      add,
      remove
    }))
  }
}
