import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { onBeforeUnmount, toValue, watch } from 'vue'
import { useCrudModalPending } from '~/composables/useCrudModal'
import type { MaybeRefOrGetter, Ref } from 'vue'
import type { TransferPaymentStreamPolymorphicWizard } from '~~/shared/types/schemas'

type WizardRefreshHandler = () => Promise<boolean>

/**
 * Manages transfer payment stream wizard submit state and side effects.
 *
 * @param programId - Parent transfer payment profile id.
 * @param refresh - Callback that refreshes upstream data and reports whether it loaded successfully.
 * @returns Wizard open state and submit handler.
 */
export const useTransferPaymentStreamWizard = (programId: MaybeRefOrGetter<string>, refresh: WizardRefreshHandler) => {
  const { t } = useI18n()
  const toast = useToast()
  const { showError } = useApiErrorToast()
  const isStreamWizardOpen: Ref<boolean> = ref(false)
  let contextGeneration = 0
  let nextSession = 0
  let disposed = false
  const session: Ref<number | null> = ref(null)
  const pending = useCrudModalPending(() => session.value)
  const isSavingStreamWizard = pending.isPending
  watch(isStreamWizardOpen, open => {
    session.value = open ? ++nextSession : null
  }, { flush: 'sync' })
  watch(() => toValue(programId), () => {
    contextGeneration += 1
    isStreamWizardOpen.value = false
  }, { flush: 'sync' })
  onBeforeUnmount(() => {
    disposed = true
    contextGeneration += 1
  })
  const isCurrentContext = (generation: number) => !disposed && generation === contextGeneration

  /**
   * Submits the wizard data to the server and refreshes the parent program data.
   *
   * @param data - The wizard payload containing stream details and associations.
   */
  const saveStreamWizard = async (data: TransferPaymentStreamPolymorphicWizard) => {
    if (disposed || !isStreamWizardOpen.value || session.value === null) return
    const requestedSession = session.value
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
      if (!isCurrentContext(generation)) return
      closedSession = session.value === requestedSession
      if (closedSession) isStreamWizardOpen.value = false
    } catch (error: unknown) {
      if (isCurrentContext(generation) && session.value === requestedSession) showError(error)
      return
    } finally {
      pending.end(requestedSession)
    }

    try {
      const refreshed = await refresh()
      if (!refreshed || !isCurrentContext(generation) || !closedSession || session.value !== null) return
      toast.add({
        title: t('common.success'),
        description: t('common.added_success'),
        color: 'success'
      })
    } catch (error: unknown) {
      if (isCurrentContext(generation)) showError(error)
    }
  }

  return {
    isStreamWizardOpen,
    isSavingStreamWizard,
    saveStreamWizard
  }
}
