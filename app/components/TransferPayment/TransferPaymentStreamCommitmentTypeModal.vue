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
const isUpdate = computed(() => Boolean(state.value?.id))
const submitCommitmentType = $fetch as unknown as (
  url: string,
  options: { method: 'PATCH' | 'POST', body: z.infer<typeof TransferPaymentStreamCommitmentTypeSchema> }
) => Promise<unknown>

/**
 * Persists the validated commitment type for the active modal session.
 *
 * @param event - Validated form submission.
 */
const onSubmit = async (event: FormSubmitEvent<z.infer<typeof TransferPaymentStreamCommitmentTypeSchema>>) => {
  const session = captureSession ? captureSession() : null
  if (!pending.begin(session)) return
  const commitmentTypeId = state.value?.id
  try {
    await submitCommitmentType(
      commitmentTypeId
        ? `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/commitment-types/${commitmentTypeId}`
        : `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/commitment-types`,
      { method: commitmentTypeId ? 'PATCH' : 'POST', body: event.data }
    )
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
  <UModal v-model:open="open" :title="isUpdate ? t('transfer_payment.commitment_types.update') : t('transfer_payment.commitment_types.create')">
    <template #body>
      <UForm v-if="state" :state="state" :validate="createValidator(TransferPaymentStreamCommitmentTypeSchema)" class="space-y-4" @submit="onSubmit">
        <UFormField :label="t('transfer_payment.name_en')" name="egcs_tp_name_en">
          <UInput v-model="state.egcs_tp_name_en" class="w-full" />
        </UFormField>
        <UFormField :label="t('transfer_payment.name_fr')" name="egcs_tp_name_fr">
          <UInput v-model="state.egcs_tp_name_fr" class="w-full" />
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="open = false" />
          <CommonSaveButton :label="t('common.save')" :loading="pending.isPending.value" :disabled="pending.isPending.value" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
