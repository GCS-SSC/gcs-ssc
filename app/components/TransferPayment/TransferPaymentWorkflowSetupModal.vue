<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc */
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { CommonWorkflowSetupCreateSchema } from '~~/shared/types/schemas'

type WorkflowSetupItem = {
  id?: string
  egcs_cn_scopetype?: 'transferpaymentstream'
  egcs_cn_scopeid?: string
  egcs_cn_entitytype?: string
  egcs_cn_name_en?: string
  egcs_cn_name_fr?: string
  egcs_cn_description_en?: string
  egcs_cn_description_fr?: string
  egcs_cn_purpose?: 'standard' | 'approval_submission' | 'risk_rating'
  egcs_cn_allowedstartstatuses?: string[]
  egcs_cn_cancellationstatus?: string
  egcs_cn_executionfailurestatus?: string
  egcs_cn_allowretry?: boolean
}

const emit = defineEmits<{ saved: [] }>()
const open = defineModel<boolean>('open', { default: false })
const state: Ref<WorkflowSetupItem | null> = defineModel<WorkflowSetupItem | null>('state', { default: null })
const { transferPaymentId, streamId, agencyId } = defineProps<{ transferPaymentId: string, streamId: string, agencyId: string }>()
const { t } = useI18n()
const { showError } = useApiErrorToast()
const { createValidator } = useZodI18n()
const validate = createValidator(CommonWorkflowSetupCreateSchema)
const isSubmitting: Ref<boolean> = ref(false)
const approvalSubmissionEntityTypes = new Set([
  'fundingcaseagreement', 'fundingcaseamendment', 'fundingcaseagreementcloseout',
  'fundingcaseagreementclaim', 'fundingclaimreconcile', 'fundingcaseagreementcommitment',
  'fundingcasepayment', 'fundingcaseforecast', 'fundingcasemonitor'
])
const purposeOptions = computed(() => [
  { value: 'standard', label: t('workflow.purposes.standard') },
  ...(approvalSubmissionEntityTypes.has(state.value?.egcs_cn_entitytype ?? '')
    ? [{ value: 'approval_submission', label: t('workflow.purposes.approval_submission') }]
    : []),
  ...(state.value?.egcs_cn_entitytype === 'fundingcaseagreement'
    ? [{ value: 'risk_rating', label: t('workflow.purposes.risk_rating') }]
    : [])
])
watch(() => state.value?.egcs_cn_entitytype, entityType => {
  if (state.value?.egcs_cn_purpose === 'approval_submission' && !approvalSubmissionEntityTypes.has(entityType ?? '')) {
    state.value.egcs_cn_purpose = 'standard'
  }
  if (state.value?.egcs_cn_purpose === 'risk_rating' && entityType !== 'fundingcaseagreement') {
    state.value.egcs_cn_purpose = 'standard'
  }
})

const save = async () => {
  if (!state.value || isSubmitting.value) return
  const requestState = state.value
  const requestTransferPaymentId = transferPaymentId
  const requestStreamId = streamId
  const isCurrentRequest = () => open.value
    && state.value === requestState
    && transferPaymentId === requestTransferPaymentId
    && streamId === requestStreamId
  try {
    isSubmitting.value = true
    const isUpdate = Boolean(state.value.id)
    const url = `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/workflow-setups${isUpdate ? `/${state.value.id}` : ''}`
    const body = isUpdate
      ? state.value
      : {
          ...state.value,
          egcs_cn_scopetype: 'transferpaymentstream',
          egcs_cn_scopeid: streamId
        }
    const response = await fetch(getClientRequestUrl(url), {
      method: isUpdate ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    })
    if (!response.ok) await throwFetchResponseError(response)
    if (isCurrentRequest()) {
      open.value = false
      state.value = null
      emit('saved')
    }
  } catch (error) {
    if (isCurrentRequest()) showError(error)
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="state?.id ? t('workflow.edit_setup') : t('workflow.add_setup')">
    <template #body>
      <UForm v-if="state" :state="state" :validate="validate" :validate-on="[]" class="space-y-5" @submit="save">
        <UFormField :label="t('transfer_payment.entity_type')" name="egcs_cn_entitytype">
          <CommonEnumSelect v-model="state.egcs_cn_entitytype" name="transfer_payment_review_setup_entity_type" class="w-full" />
        </UFormField>
        <div class="grid gap-4 md:grid-cols-2">
          <UFormField :label="t('transfer_payment.name_en')" name="egcs_cn_name_en">
            <UInput v-model="state.egcs_cn_name_en" class="w-full" />
          </UFormField>
          <UFormField :label="t('transfer_payment.name_fr')" name="egcs_cn_name_fr">
            <UInput v-model="state.egcs_cn_name_fr" class="w-full" />
          </UFormField>
          <UFormField :label="t('transfer_payment.description_en')" name="egcs_cn_description_en">
            <CommonTextarea v-model="state.egcs_cn_description_en" />
          </UFormField>
          <UFormField :label="t('transfer_payment.description_fr')" name="egcs_cn_description_fr">
            <CommonTextarea v-model="state.egcs_cn_description_fr" />
          </UFormField>
        </div>
        <UFormField :label="t('workflow.purpose')" name="egcs_cn_purpose" :description="t('workflow.purpose_help')">
          <CommonEnumSelect v-model="state.egcs_cn_purpose" name="workflow_purpose" :items="purposeOptions" class="w-full" />
        </UFormField>
        <UFormField :label="t('workflow.allowed_start_statuses')" name="egcs_cn_allowedstartstatuses" :description="t('workflow.allowed_start_statuses_help')">
          <CommonStatusSelect v-model="state.egcs_cn_allowedstartstatuses" :agency-id="agencyId" multiple class="w-full" />
        </UFormField>
        <div class="grid gap-4 md:grid-cols-2">
          <UFormField :label="t('workflow.cancellation_status')" name="egcs_cn_cancellationstatus">
            <CommonStatusSelect v-model="state.egcs_cn_cancellationstatus" :agency-id="agencyId" class="w-full" />
          </UFormField>
          <UFormField :label="t('workflow.execution_failure_status')" name="egcs_cn_executionfailurestatus">
            <CommonStatusSelect v-model="state.egcs_cn_executionfailurestatus" :agency-id="agencyId" class="w-full" />
          </UFormField>
        </div>
        <UFormField :label="t('workflow.allow_retry')" name="egcs_cn_allowretry" :description="t('workflow.allow_retry_help')">
          <USwitch v-model="state.egcs_cn_allowretry" />
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" class="cursor-default" @click="open = false" />
          <CommonSaveButton :label="t('common.save')" :loading="isSubmitting" :disabled="isSubmitting" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
