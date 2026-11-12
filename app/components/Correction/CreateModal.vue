<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- Modal session behavior is covered by component regressions. */
import { onScopeDispose, watch } from 'vue'
import { useCrudModal, useCrudModalPending } from '~/composables/useCrudModal'
import { useFormSession } from '~/composables/useFormSession'
import type { ActionContext } from '~/composables/useActionContext'
import { CorrectionCreateSchema } from '~~/shared/types/schemas/correction'

const { agreementId, linkedCorrectionId, initialCommitmentId, actionContext } = defineProps<{
  agreementId: string
  actionContext: ActionContext
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
const modal = useCrudModal<CreateState, CreateState>({
  createState: () => ({
    egcs_fc_commitment: initialCommitmentId,
    egcs_fc_payments: [],
    egcs_fc_requesteddate: new Date().toISOString().slice(0, 10),
    egcs_fc_narrative_en: '', egcs_fc_narrative_fr: '',
    ...(linkedCorrectionId ? { egcs_fc_linkedcorrection: linkedCorrectionId } : {})
  }),
  updateState: draft => ({ ...draft })
})
const state = modal.selected
const pendingRequest = useCrudModalPending(modal.captureSession)
const pending = pendingRequest.isPending
onScopeDispose(modal.close)
watch([open, () => agreementId, () => linkedCorrectionId], ([isOpen]) => {
  if (isOpen) modal.openCreate()
  else modal.close()
}, { immediate: true, flush: 'sync' })
watch(() => state.value?.egcs_fc_commitment, (commitment, previousCommitment) => {
  if (state.value && commitment !== previousCommitment) state.value.egcs_fc_payments = []
}, { flush: 'sync' })
const save = async () => {
  const operation = actionContext.capture()
  if (!operation?.canDispatch()) return
  const currentSession = modal.captureSession()
  if (!state.value || currentSession === null || !pendingRequest.begin(currentSession)) return
  const ownerAgreement = agreementId
  try {
    const result = await sendJson<{ id: string }>(`/api/agreements/${ownerAgreement}/corrections`, 'POST', CorrectionCreateSchema.parse(state.value))
    if (!operation.isCurrent() || !modal.isCurrentSession(currentSession) || ownerAgreement !== agreementId) return
    open.value = false
    emit('created', result.id)
  } catch (error) {
    if (operation.isCurrent() && modal.isCurrentSession(currentSession)) showError(error)
  } finally {
    pendingRequest.end(currentSession)
  }
}
const formSession = useFormSession({ owner: modal, action: { kind: 'remote', context: () => actionContext }, submit: save })
</script>

<template>
  <UModal v-model:open="open" data-help-view="casework.correction.create-modal.open" :title="t(linkedCorrectionId ? 'correction.create_linked' : 'correction.create')" :description="t('correction.description')" :ui="{ content: 'sm:max-w-4xl' }" data-field-tooltip-context="agreement" data-field-scope="correction.create-modal" data-scope-label-en="Agreements > Corrections > Create" data-scope-label-fr="Ententes > Corrections > Créer">
    <template #body>
      <UForm v-if="state" v-bind="formSession" :state="state" :validate="createValidator(CorrectionCreateSchema)" class="space-y-4">
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
          <UButton data-help-target="casework.correction.create-modal.open.common-cancel" type="button" :label="t('common.cancel')" color="neutral" variant="ghost" :disabled="pending" @click="open = false" />
          <CommonSaveButton data-help-target="casework.correction.create-modal.open.correction-create" :label="t('correction.create')" :loading="pending" :disabled="pending" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
