<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- Modal sessions have focused regression coverage. */
import { ref, watch } from 'vue'
import type { Ref } from 'vue'
import { AccountReceivableCancelSchema } from '~~/shared/types/schemas/account-receivable'

const { recordId, creditMemo = false } = defineProps<{ recordId: string, creditMemo?: boolean }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ cancelled: [] }>()
const { t } = useI18n()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const { sendJson } = useJsonRequest()
const state: Ref<{ egcs_fc_reason: string } | null> = ref(null)
const pending: Ref<boolean> = ref(false)
let session = 0
watch([open, () => recordId], ([value]) => {
  session += 1
  pending.value = false
  state.value = value ? { egcs_fc_reason: '' } : null
}, { immediate: true, flush: 'sync' })
const cancel = async () => {
  if (!state.value || pending.value) return
  const currentSession = session
  pending.value = true
  try {
    await sendJson(`/api/${creditMemo ? 'account-receivable-credit-memos' : 'account-receivables'}/${recordId}/cancel`, 'POST', state.value)
    if (currentSession !== session) return
    open.value = false
    emit('cancelled')
  } catch (failure) {
    if (currentSession === session) showError(failure)
  } finally {
    if (currentSession === session) pending.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="t('account_receivable.cancel')" :description="t('account_receivable.cancel_description')" :ui="{ content: 'sm:max-w-2xl' }">
    <template #body>
      <UForm v-if="state" :state="state" :validate="createValidator(AccountReceivableCancelSchema)" class="space-y-4" @submit="cancel">
        <UFormField name="egcs_fc_reason" :label="t('account_receivable.cancellation_reason')">
          <UTextarea v-model="state.egcs_fc_reason" class="w-full" :rows="4" />
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton type="button" color="neutral" variant="ghost" :label="t('account_receivable.dismiss_cancellation')" :disabled="pending" @click="open = false" />
          <CommonSaveButton :label="t('account_receivable.cancel')" :loading="pending" :disabled="pending" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
