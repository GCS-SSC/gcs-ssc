import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import type { FormSubmitEvent } from '#ui/types'
import type { z } from 'zod'
import { computed } from 'vue'
import type { Ref } from 'vue'
import type { CrudModalSessionLifecycle } from '~/composables/useCrudModal'
import { useCrudModalPending } from '~/composables/useCrudModal'
import type {
  TransferPaymentReviewSetupEntityType,
  TransferPaymentStreamReviewSetupItem
} from '~~/shared/types/schemas/transfer-payment'
import {
  TRANSFER_PAYMENT_REVIEW_SETUP_ENTITY_TYPE_ENUM,
  TransferPaymentStreamReviewSetupCreateSchema,
  TransferPaymentStreamReviewSetupPatchSchema
} from '~~/shared/types/schemas/transfer-payment'

export type ReviewSetupFormState = Partial<TransferPaymentStreamReviewSetupItem> & {
  members?: TransferPaymentStreamReviewSetupItem['members']
}

type UseTransferPaymentReviewSetupModalOptions = CrudModalSessionLifecycle & {
  open: Ref<boolean>
  state: Ref<ReviewSetupFormState | null>
  transferPaymentId: string
  streamId: string
  emitSaved: () => void
}

/**
 * Manages create/update state and submission for the transfer payment review setup modal.
 *
 * @param root0 - Modal configuration and parent-owned state bindings.
 * @param root0.open - Two-way bound modal visibility state.
 * @param root0.state - Current review setup form state.
 * @param root0.transferPaymentId - Parent transfer payment identifier.
 * @param root0.streamId - Parent transfer payment stream identifier.
 * @param root0.emitSaved - Callback invoked after a successful save.
 * @param root0.captureSession - Captures the parent CRUD modal session before saving.
 * @param root0.closeSession - Closes the parent CRUD modal only for the captured session.
 * @returns Modal state, validation helpers, and submit handler.
 */
export const useTransferPaymentReviewSetupModal = ({
  open,
  state,
  transferPaymentId,
  streamId,
  emitSaved,
  captureSession,
  closeSession
}: UseTransferPaymentReviewSetupModalOptions) => {
  const { t } = useI18n()
  const { createValidator } = useZodI18n()
  const { showError } = useApiErrorToast()

  const pending = useCrudModalPending(() => captureSession ? captureSession() : null)
  const isSubmitting = pending.isPending
  const isUpdate = computed(() => Boolean(state.value?.id))
  const validateCreate = createValidator(TransferPaymentStreamReviewSetupCreateSchema)
  const validatePatch = createValidator(TransferPaymentStreamReviewSetupPatchSchema)
  /**
   * Chooses the correct schema validator for create versus update requests.
   *
   * @param payload - Form payload emitted by the review setup modal.
   * @returns Validation issues from the active Zod validator.
   */
  const validate = async (
    payload:
      | z.infer<typeof TransferPaymentStreamReviewSetupCreateSchema>
      | z.infer<typeof TransferPaymentStreamReviewSetupPatchSchema>
  ) => {
    if (isUpdate.value) {
      return await validatePatch(payload as z.infer<typeof TransferPaymentStreamReviewSetupPatchSchema>)
    }

    return await validateCreate(payload as z.infer<typeof TransferPaymentStreamReviewSetupCreateSchema>)
  }
  const modalTitle = computed(() => (
    isUpdate.value ? t('transfer_payment.review_setup_update') : t('transfer_payment.review_setup_create')
  ))
  const submitLabel = computed(() => (isUpdate.value ? t('common.update') : t('common.save')))
  /**
   * Builds the localized entity-type options used by the review setup form.
   */
  const transferPaymentEntityTypeItems = computed(() => TRANSFER_PAYMENT_REVIEW_SETUP_ENTITY_TYPE_ENUM.map(value => ({
    label: t(`enums.entity_type.${value}`),
    value: value as TransferPaymentReviewSetupEntityType
  })))

  /**
   * Persists the review setup and closes the modal on success.
   *
   * @param event - UI form submission event carrying the validated payload.
   */
  const onSubmit = async (
    event: FormSubmitEvent<
      z.infer<typeof TransferPaymentStreamReviewSetupCreateSchema> |
      z.infer<typeof TransferPaymentStreamReviewSetupPatchSchema>
    >
  ) => {
    const session = captureSession ? captureSession() : null
    if (!pending.begin(session)) return

    try {
      const currentState = state.value
      const reviewSetupId = isUpdate.value && currentState?.id ? String(currentState.id) : null
      const url = reviewSetupId
        ? `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/review-setups/${reviewSetupId}`
        : `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/review-setups`
      const method = reviewSetupId ? 'PATCH' : 'POST'

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
    transferPaymentEntityTypeItems,
    onSubmit
  }
}
