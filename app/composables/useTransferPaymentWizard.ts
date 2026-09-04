import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import type { TransferPaymentWizard } from '~~/shared/types/schemas'

type WizardRefreshHandler = () => Promise<unknown>

/**
 * Manages transfer payment profile wizard submit state and side effects.
 *
 * @param refresh - Callback to refresh upstream data after successful save.
 * @returns Wizard open state and submit handler.
 */
export const useTransferPaymentWizard = (refresh: WizardRefreshHandler) => {
  const { t } = useI18n()
  const toast = useToast()
  const { showError } = useApiErrorToast()
  const isWizardOpen: Ref<boolean> = ref(false)
  const isSavingWizard: Ref<boolean> = ref(false)

  /**
   * Submits the transfer payment wizard data to the server.
   *
   * @param data - The wizard payload containing profile and association data.
   */
  const saveWizard = async (data: TransferPaymentWizard) => {
    if (isSavingWizard.value) {
      return
    }

    isSavingWizard.value = true

    try {
      const response = await fetch(getClientRequestUrl('/api/transfer-payments/wizard'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data)
      })
      if (!response.ok) await throwFetchResponseError(response)
      isWizardOpen.value = false
      toast.add({
        title: t('common.success'),
        description: t('common.added_success'),
        color: 'success'
      })
    } catch (error: unknown) {
      showError(error)
      return
    } finally {
      isSavingWizard.value = false
    }

    try {
      await refresh()
    } catch (error: unknown) {
      showError(error)
    }
  }

  return {
    isWizardOpen,
    isSavingWizard,
    saveWizard
  }
}
