import { withFormRequirements } from '~~/shared/utils/form-requirements'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import type { FormSubmitEvent } from '#ui/types'
import type { z } from 'zod'
import { computed, toValue, watch } from 'vue'
import type { MaybeRefOrGetter, Ref } from 'vue'
import type { CrudModalSessionLifecycle } from '~/composables/useCrudModal'
import { useCrudModalPending } from '~/composables/useCrudModal'
import { useModalSession } from '~/composables/useModalSession'
import type { ActionContext } from '~/composables/useActionContext'
import type { CaptureCommittedSettlement } from '~/composables/useCommittedSettlement'
import { useFormSession } from '~/composables/useFormSession'
import type {
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
  agencyId: MaybeRefOrGetter<string>
  actionContext: MaybeRefOrGetter<ActionContext>
  captureCommitted: CaptureCommittedSettlement
  emitSaved: () => void
}

/**
 * Manages create/update state and submission for the transfer payment review setup modal.
 *
 * @param root0 - Modal configuration and parent-owned state bindings.
 * @param root0.open - Two-way bound modal visibility state.
 * @param root0.state - Current review setup form state.
 * @param root0.agencyId - Owning Agency identifier.
 * @param root0.actionContext - Reactive remote-action authority supplied by the resource owner.
 * @param root0.captureCommitted - Captures parent collection readback before request admission.
 * @param root0.emitSaved - Callback invoked after a successful save.
 * @param root0.captureSession - Captures the parent CRUD modal session before saving.
 * @param root0.closeSession - Closes the parent CRUD modal only for the captured session.
 * @returns Modal state, validation helpers, and submit handler.
 */
export const useTransferPaymentReviewSetupModal = ({
  open,
  state,
  agencyId,
  actionContext,
  captureCommitted,
  emitSaved,
  captureSession,
  closeSession
}: UseTransferPaymentReviewSetupModalOptions) => {
  const { t } = useI18n()
  const { createValidator } = useZodI18n()
  const { showError } = useApiErrorToast()

  const modalSession = useModalSession()
  watch([open, state, () => toValue(agencyId), () => captureSession?.()], () => {
    modalSession.isOpen.value = false
    modalSession.isOpen.value = open.value && state.value !== null
  }, { immediate: true, flush: 'sync' })
  const pending = useCrudModalPending(modalSession.captureSession)
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
  const validate = withFormRequirements(async (
    payload:
      | z.infer<typeof TransferPaymentStreamReviewSetupCreateSchema>
      | z.infer<typeof TransferPaymentStreamReviewSetupPatchSchema>
  ) => {
    if (isUpdate.value) {
      return await validatePatch(payload)
    }

    return await validateCreate(payload)
  }, TransferPaymentStreamReviewSetupCreateSchema)
  const modalTitle = computed(() => (
    isUpdate.value ? t('transfer_payment.review_setup_update') : t('transfer_payment.review_setup_create')
  ))
  const submitLabel = computed(() => (isUpdate.value ? t('common.update') : t('common.save')))
  /**
   * Builds the localized entity-type options used by the review setup form.
   */
  const transferPaymentEntityTypeItems = computed(() => TRANSFER_PAYMENT_REVIEW_SETUP_ENTITY_TYPE_ENUM.map(value => ({
    label: t(`enums.entity_type.${value}`),
    value
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
    const committed = captureCommitted()
    const operation = toValue(actionContext).capture()
    const session = modalSession.captureSession()
    const parentSession = captureSession?.() ?? null
    if (!committed || !operation || session === null || (captureSession && parentSession === null) || !pending.begin(session)) return
    const isCurrent = () => operation.isCurrent() && modalSession.isCurrentSession(session)
      && (!captureSession || captureSession() === parentSession)

    try {
      try {
        const currentState = state.value
        const reviewSetupId = isUpdate.value && currentState?.id ? String(currentState.id) : null
        const url = reviewSetupId
          ? `/api/agency/${toValue(agencyId)}/review-sets/${reviewSetupId}`
          : `/api/agency/${toValue(agencyId)}/review-sets`
        const method = reviewSetupId ? 'PATCH' : 'POST'

        if (!operation.canDispatch()) return
        if (!committed.canDispatch() || !operation.canDispatch()) return
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
      } catch (error) {
        if (isCurrent()) showError(error)
        return
      }
      const readback = await committed.settle()
      if (readback.kind === 'retired' || !isCurrent()) return
      if (closeSession) {
        if (!closeSession(parentSession)) return
      } else open.value = false
      emitSaved()
    } finally {
      pending.end(session)
    }
  }

  const formSession = useFormSession({ owner: modalSession, action: { kind: 'remote', context: actionContext }, submit: onSubmit })

  return {
    formSession,
    validate,
    isSubmitting,
    isUpdate,
    modalTitle,
    submitLabel,
    transferPaymentEntityTypeItems,
    onSubmit
  }
}
