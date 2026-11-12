<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- Modal sessions have focused regression coverage. */
import { onScopeDispose, watch } from 'vue'
import { useCrudModal, useCrudModalPending } from '~/composables/useCrudModal'
import { useFormSession } from '~/composables/useFormSession'
import type { CaptureCommittedSettlement } from '~/composables/useCommittedSettlement'
import type { ActionContext } from '~/composables/useActionContext'
import { CorrectionCancelSchema } from '~~/shared/types/schemas/correction'

const { correctionId, actionContext, captureCommitted } = defineProps<{ correctionId: string, actionContext: ActionContext, captureCommitted: CaptureCommittedSettlement }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ cancelled: [] }>()
const { t } = useI18n()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const { sendJson } = useJsonRequest()
type CancelState = { egcs_fc_reason: string }
const modal = useCrudModal<CancelState, CancelState>({
  createState: () => ({ egcs_fc_reason: '' }),
  updateState: draft => ({ ...draft })
})
const state = modal.selected
const pendingRequest = useCrudModalPending(modal.captureSession)
const pending = pendingRequest.isPending
onScopeDispose(modal.close)
watch([open, () => correctionId], ([value]) => {
  if (value) modal.openCreate()
  else modal.close()
}, { immediate: true, flush: 'sync' })
const cancel = async () => {
  const operation = actionContext.capture()
  const committed = captureCommitted()
  if (!operation?.canDispatch() || !committed?.canDispatch()) return
  const currentSession = modal.captureSession()
  if (!state.value || currentSession === null || !pendingRequest.begin(currentSession)) return
  try {
    try {
      await sendJson(`/api/corrections/${correctionId}/cancel`, 'POST', state.value)
    } catch (failure) {
      if (operation.isCurrent() && modal.isCurrentSession(currentSession)) showError(failure)
      return
    }
    const closesInitiatingSession = operation.isCurrent() && modal.isCurrentSession(currentSession)
    if (closesInitiatingSession) open.value = false
    const settlement = await committed.settle()
    if (settlement.kind === 'refreshed' && closesInitiatingSession && modal.isLatestSession(currentSession)) emit('cancelled')
  } finally {
    pendingRequest.end(currentSession)
  }
}
const formSession = useFormSession({ owner: modal, action: { kind: 'remote', context: () => actionContext }, submit: cancel })
</script>

<template>
  <UModal v-model:open="open" data-help-view="casework.correction.cancel-modal.open" :title="t('correction.cancel')" :description="t('correction.cancel_description')" :ui="{ content: 'sm:max-w-2xl' }" data-field-tooltip-context="agreement" data-field-scope="correction.cancel-modal" data-scope-label-en="Agreements > Corrections > Cancel" data-scope-label-fr="Ententes > Corrections > Annuler">
    <template #body>
      <UForm v-if="state" v-bind="formSession" :state="state" :validate="createValidator(CorrectionCancelSchema)" class="space-y-4">
        <UFormField name="egcs_fc_reason" :label="t('correction.cancellation_reason')">
          <UTextarea v-model="state.egcs_fc_reason" class="w-full" :rows="4" />
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton data-help-target="casework.correction.cancel-modal.open.correction-dismiss-cancellation" type="button" color="neutral" variant="ghost" :label="t('correction.dismiss_cancellation')" :disabled="pending" @click="open = false" />
          <CommonSaveButton data-help-target="casework.correction.cancel-modal.open.correction-cancel" :label="t('correction.cancel')" :loading="pending" :disabled="pending" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
