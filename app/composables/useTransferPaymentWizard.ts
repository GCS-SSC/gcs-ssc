import { watch } from 'vue'
import type { ActionContext } from '~/composables/useActionContext'
import { useModalSession } from '~/composables/useModalSession'
import { useCrudModalPending } from '~/composables/useCrudModal'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import type { TransferPaymentWizard } from '~~/shared/types/schemas'

type WizardRefreshHandler = () => Promise<unknown>

/**
 * Manages transfer payment profile wizard submit state and side effects.
 *
 * @param refresh - Callback to refresh upstream data after successful save.
 * @param ownership - Captured write authority and independent collection settlement.
 * @param ownership.context - Actor and create-role ownership for the wizard.
 * @param ownership.collectionContext - Actor and collection identity for committed refresh.
 * @returns Wizard open state and submit handler.
 */
export const useTransferPaymentWizard = (
  refresh: WizardRefreshHandler,
  ownership: { context: ActionContext, collectionContext: ActionContext }
) => {
  const toast = useLocalizedToast()
  const { showError } = useApiErrorToast()
  const {
    isOpen: isWizardOpen,
    captureSession,
    isCurrentSession,
    isLatestSession,
    isDisposed
  } = useModalSession()
  const pending = useCrudModalPending(captureSession)
  const isSavingWizard = pending.isPending
  watch(ownership.context.version, () => {
    isWizardOpen.value = false
  }, { flush: 'sync' })

  /**
   * Submits the transfer payment wizard data to the server.
   *
   * @param data - The wizard payload containing profile and association data.
   */
  const saveWizard = async (data: TransferPaymentWizard) => {
    const operation = ownership.context.capture()
    const collectionOperation = ownership.collectionContext.capture()
    const requestedSession = captureSession()
    if (isDisposed() || !operation?.canDispatch() || !collectionOperation || requestedSession === null) return
    if (!pending.begin(requestedSession)) return

    try {
      const response = await fetch(getClientRequestUrl('/api/transfer-payments/wizard'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data)
      })
      if (!response.ok) await throwFetchResponseError(response)
      if (!collectionOperation.isCurrent()) return
      if (operation.isCurrent() && isCurrentSession(requestedSession)) {
        isWizardOpen.value = false
        toast.add({
          title: toast.localized('common.success'),
          description: toast.localized('common.added_success'),
          color: 'success'
        })
      }
    } catch (error: unknown) {
      if (operation.isCurrent() && isCurrentSession(requestedSession)) showError(error)
      return
    } finally {
      pending.end(requestedSession)
    }

    if (isDisposed() || !collectionOperation.isCurrent()) return
    try {
      await refresh()
    } catch (error: unknown) {
      if (!isDisposed() && collectionOperation.isCurrent() && operation.isCurrent() && isLatestSession(requestedSession)) showError(error)
    }
  }

  return {
    isWizardOpen,
    isSavingWizard,
    saveWizard
  }
}
