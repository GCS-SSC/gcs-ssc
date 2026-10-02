<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- Modal sessions have focused regression coverage. */
import { ref, watch } from 'vue'
import type { Ref } from 'vue'
import { CorrectionCancelSchema } from '~~/shared/types/schemas/correction'

const { correctionId } = defineProps<{ correctionId: string }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ cancelled: [] }>()
const { t } = useI18n()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const { sendJson } = useJsonRequest()
const state: Ref<{ egcs_fc_reason: string } | null> = ref(null)
const pending: Ref<boolean> = ref(false)
let session = 0
watch([open, () => correctionId], ([value]) => {
  session += 1
  pending.value = false
  state.value = value ? { egcs_fc_reason: '' } : null
}, { immediate: true, flush: 'sync' })
const cancel = async () => {
  if (!state.value || pending.value) return
  const currentSession = session
  pending.value = true
  try {
    await sendJson(`/api/corrections/${correctionId}/cancel`, 'POST', state.value)
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
  <UModal v-model:open="open" :title="t('correction.cancel')" :description="t('correction.cancel_description')" :ui="{ content: 'sm:max-w-2xl' }">
    <template #body>
      <UForm v-if="state" :state="state" :validate="createValidator(CorrectionCancelSchema)" class="space-y-4" @submit="cancel">
        <UFormField name="egcs_fc_reason" :label="t('correction.cancellation_reason')">
          <UTextarea v-model="state.egcs_fc_reason" class="w-full" :rows="4" />
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton type="button" color="neutral" variant="ghost" :label="t('correction.dismiss_cancellation')" :disabled="pending" @click="open = false" />
          <CommonSaveButton :label="t('correction.cancel')" :loading="pending" :disabled="pending" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
