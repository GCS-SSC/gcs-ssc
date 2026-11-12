import { withFormRequirements } from '~~/shared/utils/form-requirements'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
/* eslint-disable jsdoc/require-jsdoc */
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
import type { TransferPaymentStreamRecommendationSetupItem } from '~~/shared/types/schemas/transfer-payment'
import {
  TransferPaymentStreamRecommendationSetupCreateSchema,
  TransferPaymentStreamRecommendationSetupPatchSchema
} from '~~/shared/types/schemas/transfer-payment'

type UseAgencyRecommendationSetModalOptions = CrudModalSessionLifecycle & {
  open: Ref<boolean>
  state: Ref<Partial<TransferPaymentStreamRecommendationSetupItem> | null>
  agencyId: MaybeRefOrGetter<string>
  actionContext: MaybeRefOrGetter<ActionContext>
  captureCommitted: CaptureCommittedSettlement
  emitSaved: () => void
}

export const useAgencyRecommendationSetModal = ({
  open,
  state,
  agencyId,
  actionContext,
  captureCommitted,
  emitSaved,
  captureSession,
  closeSession
}: UseAgencyRecommendationSetModalOptions) => {
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
  const validateCreate = createValidator(TransferPaymentStreamRecommendationSetupCreateSchema)
  const validatePatch = createValidator(TransferPaymentStreamRecommendationSetupPatchSchema)
  const validate = withFormRequirements(async (
    payload:
      | z.infer<typeof TransferPaymentStreamRecommendationSetupCreateSchema>
      | z.infer<typeof TransferPaymentStreamRecommendationSetupPatchSchema>
  ) => {
    if (isUpdate.value) {
      return await validatePatch(payload as z.infer<typeof TransferPaymentStreamRecommendationSetupPatchSchema>)
    }

    return await validateCreate(payload as z.infer<typeof TransferPaymentStreamRecommendationSetupCreateSchema>)
  }, TransferPaymentStreamRecommendationSetupCreateSchema)
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
    const committed = captureCommitted()
    const operation = toValue(actionContext).capture()
    if (!committed || !operation?.canDispatch()) return
    const session = modalSession.captureSession()
    const parentSession = captureSession?.() ?? null
    if (session === null || (captureSession && parentSession === null) || !pending.begin(session)) return
    const isCurrent = () => operation.isCurrent() && modalSession.isCurrentSession(session)
      && (!captureSession || captureSession() === parentSession)

    try {
      try {
        const currentState = state.value
        const recommendationSetupId = isUpdate.value && currentState?.id ? String(currentState.id) : null
        const url = recommendationSetupId
          ? `/api/agency/${toValue(agencyId)}/recommendation-sets/${recommendationSetupId}`
          : `/api/agency/${toValue(agencyId)}/recommendation-sets`
        const method = recommendationSetupId ? 'PATCH' : 'POST'

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
    onSubmit
  }
}
