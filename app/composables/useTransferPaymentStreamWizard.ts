import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { TransferPaymentStreamPolymorphicWizard } from '~~/shared/types/schemas'

type WizardRefreshHandler = () => Promise<unknown>

/**
 * Manages transfer payment stream wizard submit state and side effects.
 *
 * @param programId - Parent transfer payment profile id.
 * @param refresh - Callback to refresh upstream data after successful save.
 * @returns Wizard open state and submit handler.
 */
export const useTransferPaymentStreamWizard = (programId: MaybeRefOrGetter<string>, refresh: WizardRefreshHandler) => {
  const { t } = useI18n()
  const toast = useToast()
  const { showError } = useApiErrorToast()
  const isStreamWizardOpen: Ref<boolean> = ref(false)
  const isSavingStreamWizard: Ref<boolean> = ref(false)

  /**
   * Submits the wizard data to the server and refreshes the parent program data.
   *
   * @param data - The wizard payload containing stream details and associations.
   */
  const saveStreamWizard = async (data: TransferPaymentStreamPolymorphicWizard) => {
    if (isSavingStreamWizard.value) {
      return
    }

    isSavingStreamWizard.value = true

    try {
      const response = await fetch(getClientRequestUrl(`/api/transfer-payments/${toValue(programId)}/streams/wizard`), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data)
      })
      if (!response.ok) await throwFetchResponseError(response)
      isStreamWizardOpen.value = false
      toast.add({
        title: t('common.success'),
        description: t('common.added_success'),
        color: 'success'
      })
    } catch (error: unknown) {
      showError(error)
      return
    } finally {
      isSavingStreamWizard.value = false
    }

    try {
      await refresh()
    } catch (error: unknown) {
      showError(error)
    }
  }

  return {
    isStreamWizardOpen,
    isSavingStreamWizard,
    saveStreamWizard
  }
}
