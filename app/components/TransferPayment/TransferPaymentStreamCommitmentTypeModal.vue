<script setup lang="ts">
import type { FormSubmitEvent } from '#ui/types'
import type { z } from 'zod'
import type { TransferPaymentStreamCommitmentTypeItem } from '~~/shared/types/schemas/transfer-payment'
import { TransferPaymentStreamCommitmentTypeSchema } from '~~/shared/types/schemas/transfer-payment'
import type { CrudModalSessionLifecycle } from '~/composables/useCrudModal'
import { useCrudModalPending } from '~/composables/useCrudModal'

const open = defineModel<boolean>('open', { required: true })
const state = defineModel<Partial<TransferPaymentStreamCommitmentTypeItem> | null>('state', { default: null })
const { transferPaymentId, streamId, captureSession, closeSession } = defineProps<{
  transferPaymentId: string
  streamId: string
} & CrudModalSessionLifecycle>()
const emit = defineEmits<{ saved: [] }>()
const { t } = useI18n()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const pending = useCrudModalPending(() => captureSession ? captureSession() : null)
const submitCommitmentType = $fetch as unknown as (
  url: string,
  options: { method: 'POST', body: z.infer<typeof TransferPaymentStreamCommitmentTypeSchema> }
) => Promise<unknown>

/**
 * Persists the validated commitment type for the active modal session.
 *
 * @param event - Validated form submission.
 */
const onSubmit = async (event: FormSubmitEvent<z.infer<typeof TransferPaymentStreamCommitmentTypeSchema>>) => {
  const session = captureSession ? captureSession() : null
  if (!pending.begin(session)) return
  try {
    await submitCommitmentType(`/api/transfer-payments/${transferPaymentId}/streams/${streamId}/commitment-types`, {
      method: 'POST', body: event.data
    })
    if (closeSession && !closeSession(session)) return
    if (!closeSession) open.value = false
    emit('saved')
  } catch (error) {
    showError(error)
  } finally {
    pending.end(session)
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="t('transfer_payment.commitment_types.create')">
    <template #body>
      <UForm v-if="state" :state="state" :validate="createValidator(TransferPaymentStreamCommitmentTypeSchema)" class="space-y-4" @submit="onSubmit">
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
