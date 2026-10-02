<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- Modal session behavior is covered by component regressions. */
import { ref, watch } from 'vue'
import type { Ref } from 'vue'
import { CorrectionCreateSchema } from '~~/shared/types/schemas/correction'

const { agreementId, linkedCorrectionId, initialCommitmentId } = defineProps<{
  agreementId: string
  linkedCorrectionId?: string
  initialCommitmentId?: string
}>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ created: [id: string] }>()
const { t } = useI18n()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const { sendJson } = useJsonRequest()
type CreateState = {
  egcs_fc_commitment: string | undefined
  egcs_fc_payments: string[]
  egcs_fc_requesteddate: string | Date | null
  egcs_fc_narrative_en: string
  egcs_fc_narrative_fr: string
  egcs_fc_linkedcorrection?: string
}
const state: Ref<CreateState | null> = ref(null)
const pending: Ref<boolean> = ref(false)
let session = 0
watch([open, () => agreementId, () => linkedCorrectionId], ([isOpen]) => {
  session += 1
  pending.value = false
  state.value = isOpen
    ? {
        egcs_fc_commitment: initialCommitmentId,
        egcs_fc_payments: [],
        egcs_fc_requesteddate: new Date().toISOString().slice(0, 10),
        egcs_fc_narrative_en: '', egcs_fc_narrative_fr: '',
        ...(linkedCorrectionId ? { egcs_fc_linkedcorrection: linkedCorrectionId } : {})
      }
    : null
}, { immediate: true, flush: 'sync' })
watch(() => state.value?.egcs_fc_commitment, (commitment, previousCommitment) => {
  if (state.value && commitment !== previousCommitment) state.value.egcs_fc_payments = []
}, { flush: 'sync' })
const save = async () => {
  if (!state.value || pending.value) return
  const currentSession = session
  const ownerAgreement = agreementId
  pending.value = true
  try {
    const result = await sendJson<{ id: string }>(`/api/agreements/${ownerAgreement}/corrections`, 'POST', CorrectionCreateSchema.parse(state.value))
    if (currentSession !== session || ownerAgreement !== agreementId) return
    open.value = false
    emit('created', result.id)
  } catch (error) {
    if (currentSession === session) showError(error)
  } finally {
    if (currentSession === session) pending.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="t(linkedCorrectionId ? 'correction.create_linked' : 'correction.create')" :description="t('correction.description')" :ui="{ content: 'sm:max-w-4xl' }">
    <template #body>
      <UForm v-if="state" :state="state" :validate="createValidator(CorrectionCreateSchema)" class="space-y-4" @submit="save">
        <UFormField name="egcs_fc_commitment" :label="t('correction.commitment')">
          <CommonServerLookupSelect v-model="state.egcs_fc_commitment" :fetch-url="`/api/agreements/${agreementId}/corrections/lookups/commitments`" value-key="id" label-en-key="label_en" label-fr-key="label_fr" :show-value-in-label="false" close-on-select />
        </UFormField>
        <UFormField name="egcs_fc_payments" :label="t('correction.source_payments')" :description="t('correction.source_payments_description')">
          <CommonServerLookupSelect v-model:values="state.egcs_fc_payments" :fetch-url="`/api/agreements/${agreementId}/corrections/lookups/payments`" :query="state.egcs_fc_commitment ? { commitmentId: state.egcs_fc_commitment } : {}" :disabled="!state.egcs_fc_commitment" value-key="id" label-en-key="label_en" label-fr-key="label_fr" :show-value-in-label="false" multiple close-on-select />
        </UFormField>
        <UFormField name="egcs_fc_requesteddate" :label="t('correction.requested_date')">
          <CommonDatePicker v-model="state.egcs_fc_requesteddate" />
        </UFormField>
        <p id="correction-create-rationale" class="text-sm text-muted">
          {{ t('correction.rationale_instruction') }}
        </p>
        <div class="grid gap-4 md:grid-cols-2">
          <UFormField name="egcs_fc_narrative_en" :label="t('correction.narrative_en')">
            <UTextarea v-model="state.egcs_fc_narrative_en" aria-describedby="correction-create-rationale" class="w-full" :rows="4" />
          </UFormField>
          <UFormField name="egcs_fc_narrative_fr" :label="t('correction.narrative_fr')">
            <UTextarea v-model="state.egcs_fc_narrative_fr" aria-describedby="correction-create-rationale" class="w-full" :rows="4" />
          </UFormField>
        </div>
        <div class="flex justify-end gap-2">
          <UButton type="button" :label="t('common.cancel')" color="neutral" variant="ghost" :disabled="pending" @click="open = false" />
          <CommonSaveButton :label="t('correction.create')" :loading="pending" :disabled="pending" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
