<script setup lang="ts">
import type { ActionContext } from '~/composables/useActionContext'
import { watch } from 'vue'
import type { FormSubmitEvent } from '#ui/types'
import type { z } from 'zod'
import type { TransferPaymentStreamCommitmentTypeItem } from '~~/shared/types/schemas/transfer-payment'
import { TransferPaymentStreamCommitmentTypeSchema } from '~~/shared/types/schemas/transfer-payment'
import type { CrudModalSessionLifecycle } from '~/composables/useCrudModal'
import { useCrudModalPending } from '~/composables/useCrudModal'
import { useModalSession } from '~/composables/useModalSession'
import { useFormSession } from '~/composables/useFormSession'

const open = defineModel<boolean>('open', { required: true })
const state = defineModel<Partial<TransferPaymentStreamCommitmentTypeItem> | null>('state', { default: null })
const { transferPaymentId, streamId, captureSession, closeSession, actionContext, refreshCollection } = defineProps<{
  actionContext: ActionContext
  refreshCollection?: () => Promise<void>
  transferPaymentId: string
  streamId: string
} & CrudModalSessionLifecycle>()
const emit = defineEmits<{ saved: [] }>()
const { t } = useI18n()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
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
const submitCommitmentType: (url: string, options: {
  method: 'POST'
  body: z.infer<typeof TransferPaymentStreamCommitmentTypeSchema>
}) => Promise<unknown> = $fetch
/**
 * Persists the validated commitment type for the active modal session.
 *
 * @param event - Validated form submission.
 */
const onSubmit = async (event: FormSubmitEvent<z.infer<typeof TransferPaymentStreamCommitmentTypeSchema>>) => {
  const operation = actionContext.capture()
  const refreshCommittedCollection = refreshCollection
  if (!operation) return
  const session = captureSession ? captureSession() : modalSession.captureSession()
  const localSession = modalSession.captureSession()
  const ownsSession = () => operation.isCurrent() && modalSession.isCurrentSession(localSession)
    && (!captureSession || captureSession() === session)
  if (modalSession.isDisposed() || !pending.begin(session)) return
  try {
    if (!operation.canDispatch()) return
    await submitCommitmentType(`/api/transfer-payments/${transferPaymentId}/streams/${streamId}/commitment-types`, {
      method: 'POST', body: event.data
    })
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
  <UModal v-model:open="open" :title="t('transfer_payment.commitment_types.create')" data-field-scope="transfer-payment.stream-commitment-type-modal">
    <template #body>
      <UForm v-if="state" v-bind="formSession" :state="state" :validate="createValidator(TransferPaymentStreamCommitmentTypeSchema)" class="space-y-4">
        <UFormField :label="t('transfer_payment.commitment_types.title')" name="egcs_tp_agencycommitmenttype" required>
          <CommonServerLookupSelect
            v-model="state.egcs_tp_agencycommitmenttype"
            :fetch-url="`/api/transfer-payments/${transferPaymentId}/streams/lookups/commitment-types`"
            value-key="id"
            label-en-key="egcs_ay_name_en"
            label-fr-key="egcs_ay_name_fr" />
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="open = false" />
          <CommonSaveButton :label="t('common.save')" :loading="pending.isPending.value" :disabled="pending.isPending.value" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
