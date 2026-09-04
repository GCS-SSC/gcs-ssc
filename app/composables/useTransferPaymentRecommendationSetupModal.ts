import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
/* eslint-disable jsdoc/require-jsdoc */
import type { FormSubmitEvent } from '#ui/types'
import type { z } from 'zod'
import { computed } from 'vue'
import type { Ref } from 'vue'
import type { CrudModalSessionLifecycle } from '~/composables/useCrudModal'
import { useCrudModalPending } from '~/composables/useCrudModal'
import type { TransferPaymentStreamRecommendationSetupItem } from '~~/shared/types/schemas/transfer-payment'
import {
  TransferPaymentStreamRecommendationSetupCreateSchema,
  TransferPaymentStreamRecommendationSetupPatchSchema
} from '~~/shared/types/schemas/transfer-payment'

type UseTransferPaymentRecommendationSetupModalOptions = CrudModalSessionLifecycle & {
  open: Ref<boolean>
  state: Ref<Partial<TransferPaymentStreamRecommendationSetupItem> | null>
  transferPaymentId: string
  streamId: string
  agencyId?: string
  emitSaved: () => void
}

export const useTransferPaymentRecommendationSetupModal = ({
  open,
  state,
  transferPaymentId,
  streamId,
  emitSaved,
  captureSession,
  closeSession
}: UseTransferPaymentRecommendationSetupModalOptions) => {
  const { t } = useI18n()
  const { createValidator } = useZodI18n()
  const { showError } = useApiErrorToast()
  const pending = useCrudModalPending(() => captureSession ? captureSession() : null)
  const isSubmitting = pending.isPending

  const isUpdate = computed(() => Boolean(state.value?.id))
  const validateCreate = createValidator(TransferPaymentStreamRecommendationSetupCreateSchema)
  const validatePatch = createValidator(TransferPaymentStreamRecommendationSetupPatchSchema)
  const validate = async (
    payload:
      | z.infer<typeof TransferPaymentStreamRecommendationSetupCreateSchema>
      | z.infer<typeof TransferPaymentStreamRecommendationSetupPatchSchema>
  ) => {
    if (isUpdate.value) {
      return await validatePatch(payload as z.infer<typeof TransferPaymentStreamRecommendationSetupPatchSchema>)
    }

    return await validateCreate(payload as z.infer<typeof TransferPaymentStreamRecommendationSetupCreateSchema>)
  }
  const modalTitle = computed(() => (
    isUpdate.value ? t('transfer_payment.recommendation_setup_update') : t('transfer_payment.recommendation_setup_create')
  ))
  const submitLabel = computed(() => (isUpdate.value ? t('common.update') : t('common.save')))
  const onSubmit = async (
    event: FormSubmitEvent<
      z.infer<typeof TransferPaymentStreamRecommendationSetupCreateSchema> |
      z.infer<typeof TransferPaymentStreamRecommendationSetupPatchSchema>
    >
  ) => {
    const session = captureSession ? captureSession() : null
    if (!pending.begin(session)) return

    try {
      const currentState = state.value
      const recommendationSetupId = isUpdate.value && currentState?.id ? String(currentState.id) : null
      const url = recommendationSetupId
        ? `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/recommendation-setups/${recommendationSetupId}`
        : `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/recommendation-setups`
      const method = recommendationSetupId ? 'PATCH' : 'POST'

      const response = await fetch(getClientRequestUrl(url), {
        method,
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify(event.data)
      })
      if (!response.ok) {
        await throwFetchResponseError(response)
      }

      if (closeSession) closeSession(session)
      else open.value = false
      emitSaved()
    } catch (error) {
      showError(error)
    } finally {
      pending.end(session)
    }
  }

  return {
    validate,
    isSubmitting,
    isUpdate,
    modalTitle,
    submitLabel,
    onSubmit
  }
}
