import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { toValue, watch } from 'vue'
import { useModalSession } from '~/composables/useModalSession'
import { useCrudModalPending } from '~/composables/useCrudModal'
import type { ActionContext } from '~/composables/useActionContext'
import type { MaybeRefOrGetter } from 'vue'
import type { TransferPaymentStreamPolymorphicWizard } from '~~/shared/types/schemas'

type WizardRefreshHandler = () => Promise<boolean>

/**
 * Manages transfer payment stream wizard submit state and side effects.
 *
 * @param programId - Parent transfer payment profile id.
 * @param refresh - Callback that refreshes upstream data and reports whether it loaded successfully.
 * @param ownership - Write authority and independent same-page collection ownership.
 * @param ownership.context - Actor, Program and update-role authority for the opening.
 * @param ownership.collectionContext - Actor and Program ownership for committed refresh.
 * @returns Wizard open state and submit handler.
 */
export const useTransferPaymentStreamWizard = (
  programId: MaybeRefOrGetter<string>,
  refresh: WizardRefreshHandler,
  ownership: { context: ActionContext, collectionContext: ActionContext }
) => {
  const toast = useLocalizedToast()
  const { showError } = useApiErrorToast()
  const {
    isOpen: isStreamWizardOpen,
    captureSession,
    isCurrentSession,
    isDisposed
  } = useModalSession()
  let contextGeneration = 0
  const pending = useCrudModalPending(captureSession)
  const isSavingStreamWizard = pending.isPending
  watch(() => toValue(programId), () => {
    contextGeneration += 1
    isStreamWizardOpen.value = false
  }, { flush: 'sync' })
  watch(ownership.context.version, () => {
    isStreamWizardOpen.value = false
  }, { flush: 'sync' })
  const isCurrentContext = (generation: number) => (
    !isDisposed() && generation === contextGeneration
  )

  /**
   * Submits the wizard data to the server and refreshes the parent program data.
   *
   * @param data - The wizard payload containing stream details and associations.
   */
  const saveStreamWizard = async (data: TransferPaymentStreamPolymorphicWizard) => {
    const operation = ownership.context.capture()
    const collectionOperation = ownership.collectionContext.capture()
    if (!operation || !collectionOperation) return
    const requestedSession = captureSession()
    if (requestedSession === null) return
    if (!pending.begin(requestedSession)) return
    const generation = contextGeneration
    const requestedProgramId = toValue(programId)
    let closedSession = false

    try {
      const response = await fetch(getClientRequestUrl(`/api/transfer-payments/${requestedProgramId}/streams/wizard`), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data)
      })
      if (!response.ok) await throwFetchResponseError(response)
      if (!isCurrentContext(generation) || !collectionOperation.isCurrent()) return
      closedSession = isCurrentSession(requestedSession) && operation.isCurrent()
      if (closedSession) isStreamWizardOpen.value = false
    } catch (error: unknown) {
      if (isCurrentContext(generation) && operation.isCurrent() && isCurrentSession(requestedSession)) showError(error)
      return
    } finally {
      pending.end(requestedSession)
    }

    try {
      const refreshed = await refresh()
      if (!refreshed || !isCurrentContext(generation) || !operation.isCurrent() || !closedSession || captureSession() !== null) return
      toast.add({
        title: toast.localized('common.success'),
        description: toast.localized('common.added_success'),
        color: 'success'
      })
    } catch (error: unknown) {
      if (isCurrentContext(generation) && operation.isCurrent()) showError(error)
    }
  }

  return {
    isStreamWizardOpen,
    isSavingStreamWizard,
    saveStreamWizard
  }
}
