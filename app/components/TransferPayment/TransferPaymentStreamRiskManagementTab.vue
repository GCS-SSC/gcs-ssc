<script setup lang="ts">
import { useFormSession } from '~/composables/useFormSession'
import type { ActionContext } from '~/composables/useActionContext'
import { resolveApiErrorDescription } from '~/composables/useApiErrorToast'
import {
  TransferPaymentStreamRiskManagementSchema,
  type TransferPaymentStreamRiskManagement,
  type TransferPaymentStreamItem
} from '~~/shared/types/schemas'

type LinkedWorkflow = {
  egcs_tp_workflow: string
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  egcs_cn_entitytype: string
  egcs_cn_purpose: string
  publicationState: string
}

const { stream, transferPaymentId, actionContext, canUpdateChild, pending, saveRiskManagement } = defineProps<{
  stream: TransferPaymentStreamItem & TransferPaymentStreamRiskManagement
  transferPaymentId: string
  actionContext: ActionContext
  canUpdateChild: boolean
  pending: boolean
  saveRiskManagement: (draft: TransferPaymentStreamRiskManagement) => Promise<boolean>
}>()

const { t } = useI18n()
const toast = useLocalizedToast()
const { createValidator } = useZodI18n()
const validate = createValidator(TransferPaymentStreamRiskManagementSchema)
const formOwner = useModalSession()
formOwner.isOpen.value = true
/** @returns The persisted controls from the Stream detail record. */
const readSettings = (): TransferPaymentStreamRiskManagement => ({
  egcs_tp_agreementriskenabled: stream.egcs_tp_agreementriskenabled,
  egcs_tp_agreementriskworkflow: stream.egcs_tp_agreementriskworkflow,
  egcs_tp_amendmentriskenabled: stream.egcs_tp_amendmentriskenabled,
  egcs_tp_applyamendmentrisktotheagreement: stream.egcs_tp_applyamendmentrisktotheagreement,
  egcs_tp_amendmentriskworkflow: stream.egcs_tp_amendmentriskworkflow
})
const draft = ref(readSettings())
const errorText = ref('')
const endpoint = computed(() => `/api/transfer-payments/${transferPaymentId}/streams/${stream.id}/workflows`)
const { data, error, status, refresh } = useFetch<{ items: LinkedWorkflow[] }>(endpoint, { dedupe: 'cancel' })
const publishedRiskWorkflows = computed(() => (data.value?.items ?? []).filter(item =>
  item.publicationState === 'published' && item.egcs_cn_purpose === 'risk_rating'))
const agreementWorkflows = computed(() => publishedRiskWorkflows.value.filter(item => item.egcs_cn_entitytype === 'fundingcaseagreement'))
const amendmentWorkflows = computed(() => publishedRiskWorkflows.value.filter(item => item.egcs_cn_entitytype === 'fundingcaseamendment'))

watch(actionContext.version, () => {
  draft.value = readSettings()
  errorText.value = ''
}, { flush: 'sync' })
watch(() => [
  stream.egcs_tp_agreementriskenabled,
  stream.egcs_tp_agreementriskworkflow,
  stream.egcs_tp_amendmentriskenabled,
  stream.egcs_tp_applyamendmentrisktotheagreement,
  stream.egcs_tp_amendmentriskworkflow
], () => {
  draft.value = readSettings()
})

/** Saves the selected workflows and keeps the current draft available after a rejected request. */
const save = async () => {
  const operation = actionContext.capture()
  const session = formOwner.captureSession()
  if (!operation?.canDispatch() || pending || status.value !== 'success' || session === null) return
  const ownsEffects = () => operation.isCurrent() && formOwner.isCurrentSession(session)
  errorText.value = ''
  const payload = { ...draft.value }
  try {
    if (await saveRiskManagement(payload) && ownsEffects()) {
      toast.add({ title: toast.localized('common.success'), description: toast.localized('common.updated_success'), color: 'success' })
    }
  } catch (error: unknown) {
    if (ownsEffects()) errorText.value = resolveApiErrorDescription(error, t('common.unknown_error'))
  }
}
const formSession = useFormSession({ owner: formOwner, action: { kind: 'remote', context: () => actionContext }, submit: save })
</script>

<template>
  <UAlert
    v-if="error"
    color="error"
    icon="i-lucide-circle-alert"
    :title="t('common.resource_table_load_failed')"
    :description="t('common.resource_table_load_failed_description')"
    class="mb-4">
    <template #actions>
      <UButton color="error" variant="soft" icon="i-lucide-refresh-cw" :label="t('common.retry')" :loading="status === 'pending'" @click="refresh()" />
    </template>
  </UAlert>
  <UForm
    data-field-scope="transfer-payment.stream-risk-management"
    v-bind="formSession"
    :state="draft"
    :validate="validate"
    :disabled="pending || !canUpdateChild || status !== 'success'"
    class="max-w-3xl space-y-6">
    <div class="space-y-4">
      <UFormField name="egcs_tp_agreementriskenabled" :label="t('transfer_payment.risk_management.agreement_enabled')">
        <USwitch
          v-model="draft.egcs_tp_agreementriskenabled"
          @update:model-value="enabled => { if (!enabled) draft.egcs_tp_agreementriskworkflow = null }" />
      </UFormField>
      <UFormField
        v-if="draft.egcs_tp_agreementriskenabled"
        name="egcs_tp_agreementriskworkflow"
        :label="t('transfer_payment.risk_management.agreement_workflow')"
        :description="!agreementWorkflows.length && status === 'success' ? t('transfer_payment.risk_management.link_workflow') : undefined"
        required>
        <CommonBilingualSelectMenu
          :model-value="draft.egcs_tp_agreementriskworkflow"
          :items="agreementWorkflows"
          value-key="egcs_tp_workflow"
          label-en-key="egcs_cn_name_en"
          label-fr-key="egcs_cn_name_fr"
          aria-required="true"
          class="w-full"
          @update:model-value="value => { draft.egcs_tp_agreementriskworkflow = value ?? null }" />
      </UFormField>
    </div>
    <div class="space-y-4 border-t border-default pt-5">
      <UFormField name="egcs_tp_amendmentriskenabled" :label="t('transfer_payment.risk_management.amendment_enabled')">
        <USwitch
          v-model="draft.egcs_tp_amendmentriskenabled"
          @update:model-value="enabled => { if (!enabled) draft.egcs_tp_amendmentriskworkflow = null }" />
      </UFormField>
      <UFormField
        v-if="draft.egcs_tp_amendmentriskenabled"
        name="egcs_tp_amendmentriskworkflow"
        :label="t('transfer_payment.risk_management.amendment_workflow')"
        :description="!amendmentWorkflows.length && status === 'success' ? t('transfer_payment.risk_management.link_workflow') : undefined"
        required>
        <CommonBilingualSelectMenu
          :model-value="draft.egcs_tp_amendmentriskworkflow"
          :items="amendmentWorkflows"
          value-key="egcs_tp_workflow"
          label-en-key="egcs_cn_name_en"
          label-fr-key="egcs_cn_name_fr"
          aria-required="true"
          class="w-full"
          @update:model-value="value => { draft.egcs_tp_amendmentriskworkflow = value ?? null }" />
      </UFormField>
    </div>
    <div class="border-t border-default pt-5">
      <UFormField
        name="egcs_tp_applyamendmentrisktotheagreement"
        :label="t('transfer_payment.risk_management.apply_amendment_rating')"
        :description="t('transfer_payment.risk_management.apply_amendment_rating_help')">
        <USwitch v-model="draft.egcs_tp_applyamendmentrisktotheagreement" />
      </UFormField>
    </div>
    <UAlert v-if="errorText" role="alert" color="error" icon="i-lucide-circle-alert" :title="t('transfer_payment.risk_management.save_failed')" :description="errorText" />
    <CommonSaveButton v-if="canUpdateChild" :label="t('common.save')" :loading="pending" :disabled="pending || status !== 'success'" />
  </UForm>
</template>
