<script setup lang="ts">
import { useFieldTooltipProvider } from '~/composables/useFieldTooltipProvider'
import { onScopeDispose, watch } from 'vue'
import { useCrudModal, useCrudModalPending } from '~/composables/useCrudModal'
import { useFormSession } from '~/composables/useFormSession'
import type { ActionContext } from '~/composables/useActionContext'
import { JournalVoucherCreateSchema } from '~~/shared/types/schemas/journal-voucher'

const { actionContext } = defineProps<{ actionContext: ActionContext }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ created: [id: string] }>()
const { t } = useI18n()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const { sendJson } = useJsonRequest()
type CreateState = {
  egcs_fc_payment: string
  egcs_fc_requesteddate: string
  egcs_fc_narrative_en: string
  egcs_fc_narrative_fr: string
}
const modal = useCrudModal<CreateState, CreateState>({
  createState: () => ({ egcs_fc_payment: '', egcs_fc_requesteddate: new Date().toISOString().slice(0, 10), egcs_fc_narrative_en: '', egcs_fc_narrative_fr: '' }),
  updateState: draft => ({ ...draft })
})
const state = modal.selected
const pendingRequest = useCrudModalPending(modal.captureSession)
const pending = pendingRequest.isPending
onScopeDispose(modal.close)
useFieldTooltipProvider(() => open.value && state.value?.egcs_fc_payment
  ? { entityType: 'fundingcasepayment', entityId: state.value.egcs_fc_payment }
  : null)

watch(open, value => {
  if (value) modal.openCreate()
  else modal.close()
}, { immediate: true, flush: 'sync' })
/**
 *
 */
const save = async () => {
  const operation = actionContext.capture()
  if (!operation?.canDispatch()) return
  const currentSession = modal.captureSession()
  if (!state.value || currentSession === null || !pendingRequest.begin(currentSession)) return
  try {
    const result = await sendJson<{ id: string }>('/api/journal-vouchers', 'POST', state.value)
    if (!operation.isCurrent() || !modal.isCurrentSession(currentSession)) return
    open.value = false
    emit('created', result.id)
  } catch (error) {
    if (operation.isCurrent() && modal.isCurrentSession(currentSession)) showError(error)
  } finally { pendingRequest.end(currentSession) }
}
const formSession = useFormSession({ owner: modal, action: { kind: 'remote', context: () => actionContext }, submit: save })
</script>

<template>
  <UModal v-model:open="open" data-help-view="casework.journal-voucher.create-modal.open" :title="t('journal_voucher.create')" :description="t('journal_voucher.description')" :ui="{ content: 'sm:max-w-2xl' }" data-field-tooltip-context="agreement" data-field-scope="journal-voucher.create-modal" data-scope-label-en="Agreements > Journal Vouchers > Create" data-scope-label-fr="Ententes > Pièces de journal > Créer">
    <template #body>
      <UForm v-if="state" v-bind="formSession" :state="state" :validate="createValidator(JournalVoucherCreateSchema)" class="space-y-4">
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
          <UButton data-help-target="casework.journal-voucher.create-modal.open.common-cancel" type="button" :label="t('common.cancel')" color="neutral" variant="ghost" :disabled="pending" @click="open = false" />
          <CommonSaveButton data-help-target="casework.journal-voucher.create-modal.open.common-save" :label="t('common.save')" :loading="pending" :disabled="pending" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
