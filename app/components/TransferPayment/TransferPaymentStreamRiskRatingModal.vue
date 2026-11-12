<script setup lang="ts">
import type { ActionContext } from '~/composables/useActionContext'
import { watch } from 'vue'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import type { z } from 'zod'
import type { FormSubmitEvent } from '#ui/types'
import type { TransferPaymentStreamRiskRatingItem } from '~~/shared/types/schemas/transfer-payment'
import { TransferPaymentStreamRiskRatingSchema } from '~~/shared/types/schemas/transfer-payment'
import type { CrudModalSessionLifecycle } from '~/composables/useCrudModal'
import { useCrudModalPending } from '~/composables/useCrudModal'
import { useModalSession } from '~/composables/useModalSession'
import { useFormSession } from '~/composables/useFormSession'

const { t } = useI18n()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const emit = defineEmits<{ saved: [] }>()

const open = defineModel<boolean>('open', { default: false })
const state = defineModel<Partial<TransferPaymentStreamRiskRatingItem>>('state', { required: true })

const { transferPaymentId, streamId, captureSession, closeSession, actionContext, refreshCollection } = defineProps<{
  actionContext: ActionContext
  refreshCollection?: () => Promise<void>
  transferPaymentId: string
  streamId: string
} & CrudModalSessionLifecycle>()

if (Boolean(captureSession) !== Boolean(closeSession)) {
  throw new Error('TransferPaymentStreamRiskRatingModal requires captureSession and closeSession together')
}

const isUpdate = computed(() => !!state.value.id)
let editStartScore: number | undefined
watch([
  () => open.value,
  () => transferPaymentId,
  () => streamId,
  () => state.value,
  () => state.value.id,
  () => captureSession ? captureSession() : null
], () => {
  editStartScore = open.value ? state.value.egcs_tp_riskscore : undefined
}, { immediate: true, flush: 'sync' })

const schema = TransferPaymentStreamRiskRatingSchema.omit({ egcs_tp_transferpaymentstream: true })
const validate = createValidator(schema)
const modalSession = useModalSession()
watch([
  () => open.value,
  () => transferPaymentId,
  () => streamId,
  () => state.value,
  () => captureSession ? captureSession() : null
], () => {
  modalSession.isOpen.value = false
  modalSession.isOpen.value = open.value
}, { immediate: true, flush: 'sync' })
const pending = useCrudModalPending(() => captureSession ? captureSession() : modalSession.captureSession())
const isSaving = pending.isPending

/**
 * Saves the current risk rating form as a create or update request.
 *
 * @param event - Validated risk rating form submission.
 */
const onSubmit = async (event: FormSubmitEvent<z.infer<typeof schema>>) => {
  const body: Partial<z.infer<typeof schema>> = { ...event.data }
  if (isUpdate.value && body.egcs_tp_riskscore === editStartScore) {
    delete body.egcs_tp_riskscore
  }
  const operation = actionContext.capture()
  const refreshCommittedCollection = refreshCollection
  if (!operation) return
  const session = captureSession ? captureSession() : modalSession.captureSession()
  const localSession = modalSession.captureSession()
  const ownsSession = () => operation.isCurrent() && modalSession.isCurrentSession(localSession)
    && (!captureSession || captureSession() === session)
  if (modalSession.isDisposed() || !pending.begin(session)) return
  try {
    const url = isUpdate.value
      ? `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/risk-ratings/${state.value.id}`
      : `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/risk-ratings`

    if (!operation.canDispatch()) return
    const response = await fetch(getClientRequestUrl(url), {
      method: isUpdate.value ? 'PATCH' : 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    })
    if (!response.ok) {
      await throwFetchResponseError(response)
    }

    if (!operation.isCurrent()) return
    if (ownsSession() && (!closeSession || closeSession(session))) {
      if (!closeSession) open.value = false
      emit('saved')
    }
    if (operation.isCurrent()) await refreshCommittedCollection?.()
  } catch (error) {
    if (ownsSession()) showError(error)
  } finally {
    pending.end(session)
  }
}
const formSession = useFormSession({ owner: modalSession, action: { kind: 'remote', context: () => actionContext }, submit: onSubmit })
</script>

<template>
  <UModal v-model:open="open" :title="isUpdate ? t('transfer_payment.risk_rating_update') : t('transfer_payment.risk_rating_create')">
    <template #body>
      <UForm v-bind="formSession" :state="state" :validate="validate" class="space-y-4">
        <TransferPaymentFieldsTransferPaymentStreamRiskRatingFields :model="state" />

        <div class="flex justify-end gap-2">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="open = false" />
          <CommonSaveButton :label="t('common.save')" :loading="isSaving" :disabled="isSaving" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
