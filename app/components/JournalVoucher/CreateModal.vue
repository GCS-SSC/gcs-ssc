<script setup lang="ts">
import { ref } from 'vue'
import type { Ref } from 'vue'
import { JournalVoucherCreateSchema } from '~~/shared/types/schemas/journal-voucher'

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ created: [id: string] }>()
const { t } = useI18n()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const { sendJson } = useJsonRequest()
const state: Ref<{ egcs_fc_payment: string; egcs_fc_requesteddate: string; egcs_fc_narrative_en: string; egcs_fc_narrative_fr: string } | null> = ref(null)
const pending: Ref<boolean> = ref(false)
watch(open, value => {
  state.value = value ? { egcs_fc_payment: '', egcs_fc_requesteddate: new Date().toISOString().slice(0, 10), egcs_fc_narrative_en: '', egcs_fc_narrative_fr: '' } : null
})
/**
 *
 */
const save = async () => {
  if (!state.value || pending.value) return
  pending.value = true
  try {
    const result = await sendJson<{ id: string }>('/api/journal-vouchers', 'POST', state.value)
    open.value = false
    emit('created', result.id)
  } catch (error) {
    showError(error)
  } finally { pending.value = false }
}
</script>

<template>
  <UModal v-model:open="open" :title="t('journal_voucher.create')" :description="t('journal_voucher.description')" :ui="{ content: 'sm:max-w-2xl' }">
    <template #body>
      <UForm v-if="state" :state="state" :validate="createValidator(JournalVoucherCreateSchema)" class="space-y-4" @submit="save">
        <UFormField name="egcs_fc_payment" :label="t('journal_voucher.source_payment')">
          <CommonServerLookupSelect v-model="state.egcs_fc_payment" fetch-url="/api/journal-vouchers/lookups/payments" value-key="id" label-en-key="label_en" label-fr-key="label_fr" close-on-select :show-value-in-label="false" />
        </UFormField>
        <UFormField name="egcs_fc_requesteddate" :label="t('journal_voucher.requested_date')">
          <CommonDatePicker v-model="state.egcs_fc_requesteddate" />
        </UFormField>
        <div class="grid gap-4 md:grid-cols-2">
          <UFormField name="egcs_fc_narrative_en" :label="t('journal_voucher.narrative_en')">
            <CommonTextarea v-model="state.egcs_fc_narrative_en" class="w-full" :rows="3" />
          </UFormField>
          <UFormField name="egcs_fc_narrative_fr" :label="t('journal_voucher.narrative_fr')">
            <CommonTextarea v-model="state.egcs_fc_narrative_fr" class="w-full" :rows="3" />
          </UFormField>
        </div>
        <div class="flex justify-end gap-2">
          <UButton type="button" :label="t('common.cancel')" color="neutral" variant="ghost" :disabled="pending" @click="open = false" />
          <CommonSaveButton :label="t('common.save')" :loading="pending" :disabled="pending" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
