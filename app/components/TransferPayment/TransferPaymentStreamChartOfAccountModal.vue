<script setup lang="ts">
import type { FormSubmitEvent } from '#ui/types'
import type { z } from 'zod'
import { TransferPaymentStreamChartOfAccountSchema } from '~~/shared/types/schemas/transfer-payment'
import type { CrudModalSessionLifecycle } from '~/composables/useCrudModal'
import { useCrudModalPending } from '~/composables/useCrudModal'

const isOpen = defineModel<boolean>({ required: true })
const { streamId, profileId, captureSession, closeSession } = defineProps<{
  streamId: string
  profileId: string
} & CrudModalSessionLifecycle>()
const emit = defineEmits<{ save: [] }>()
const { t } = useI18n()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const pending = useCrudModalPending(() => captureSession ? captureSession() : null)
const state = ref<{ egcs_tp_agencychartofaccount?: string }>({})
const submitChartLink = $fetch as unknown as (url: string, options: {
  method: 'POST'
  body: z.infer<typeof TransferPaymentStreamChartOfAccountSchema>
}) => Promise<unknown>
watch(isOpen, open => {
  if (open) state.value = {}
}, { immediate: true })

/**
 * Saves the selected Agency chart association for this Stream.
 *
 * @param event - Validated link form submission.
 */
const onSubmit = async (event: FormSubmitEvent<z.infer<typeof TransferPaymentStreamChartOfAccountSchema>>) => {
  const session = captureSession ? captureSession() : null
  if (!pending.begin(session)) return
  try {
    await submitChartLink(`/api/transfer-payments/${profileId}/streams/${streamId}/chart-of-accounts`, {
      method: 'POST', body: event.data
    })
    if (closeSession && !closeSession(session)) return
    if (!closeSession) isOpen.value = false
    emit('save')
  } catch (error) {
    showError(error)
  } finally {
    pending.end(session)
  }
}
</script>

<template>
  <UModal v-model:open="isOpen" :title="t('transfer_payment.chart_of_accounts.create')">
    <template #body>
      <UForm :state="state" :validate="createValidator(TransferPaymentStreamChartOfAccountSchema)" class="space-y-4" @submit="onSubmit">
        <UFormField :label="t('transfer_payment.chart_of_accounts.title')" name="egcs_tp_agencychartofaccount" required>
          <CommonServerLookupSelect
            v-model="state.egcs_tp_agencychartofaccount"
            :fetch-url="`/api/transfer-payments/${profileId}/streams/lookups/chart-of-accounts`"
            value-key="id"
            label-en-key="label_en"
            label-fr-key="label_fr" />
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="isOpen = false" />
          <CommonSaveButton :label="t('common.save')" :loading="pending.isPending.value" :disabled="pending.isPending.value" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
