<script setup lang="ts">
import { computed } from 'vue'
import type { TransferPaymentReviewSetupEntityType } from '~~/shared/types/schemas/transfer-payment'

const state = defineModel<Record<string, unknown>>('state', { required: true, default: () => ({}) })

const { streamId, approvalTemplateLabelKey = 'transfer_payment.approval_template_id', entityTypeDisabled = false } = defineProps<{
  transferPaymentId: string
  streamId: string
  approvalTemplateLabelKey?: string
  entityTypeDisabled?: boolean
  entityTypeItems: Array<{ label: string; value: TransferPaymentReviewSetupEntityType }>
}>()

const { t } = useI18n()
const approvalTemplateQuery = computed(() => ({
  scopeType: 'transferpaymentstream',
  scopeId: streamId
}))

const entityTypeValue = computed(() => {
  const value = state.value.egcs_cn_entitytype
  return typeof value === 'string' ? value : undefined
})

const orderValue = computed(() => {
  const value = state.value.egcs_cn_order

  if (typeof value === 'number' || typeof value === 'string') {
    return value
  }

  return undefined
})

const approvalTemplateValue = computed(() => {
  const value = state.value.egcs_cn_approvaltemplate
  return typeof value === 'string' ? value : undefined
})
</script>

<template>
  <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
    <UFormField :label="t('transfer_payment.entity_type')" name="egcs_cn_entitytype">
      <CommonEnumSelect
        :model-value="entityTypeValue"
        name="entity_type"
        :items="entityTypeItems"
        :disabled="entityTypeDisabled"
        @update:model-value="value => (state.egcs_cn_entitytype = value)" />
    </UFormField>

    <UFormField :label="t('common.order')" name="egcs_cn_order">
      <UInput
        type="number"
        :model-value="orderValue"
        @update:model-value="value => (state.egcs_cn_order = value)" />
    </UFormField>
  </div>

  <UFormField :label="t('transfer_payment.name_en')" name="egcs_cn_name_en">
    <UInput
      :model-value="String(state.egcs_cn_name_en ?? '')"
      @update:model-value="value => (state.egcs_cn_name_en = value)" />
  </UFormField>

  <UFormField :label="t('transfer_payment.name_fr')" name="egcs_cn_name_fr">
    <UInput
      :model-value="String(state.egcs_cn_name_fr ?? '')"
      @update:model-value="value => (state.egcs_cn_name_fr = value)" />
  </UFormField>

  <UFormField :label="t('transfer_payment.description_en')" name="egcs_cn_description_en">
    <UTextarea
      :model-value="String(state.egcs_cn_description_en ?? '')"
      :rows="3"
      @update:model-value="value => (state.egcs_cn_description_en = value)" />
  </UFormField>

  <UFormField :label="t('transfer_payment.description_fr')" name="egcs_cn_description_fr">
    <UTextarea
      :model-value="String(state.egcs_cn_description_fr ?? '')"
      :rows="3"
      @update:model-value="value => (state.egcs_cn_description_fr = value)" />
  </UFormField>

  <AdminCommonLookupField
    :model-value="approvalTemplateValue"
    :label="t(approvalTemplateLabelKey)"
    name="egcs_cn_approvaltemplate"
    fetch-url="/api/approval-templates"
    value-key="id"
    label-en-key="egcs_cn_name_en"
    label-fr-key="egcs_cn_name_fr"
    :query="approvalTemplateQuery"
    @update:model-value="value => (state.egcs_cn_approvaltemplate = value)" />

  <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
    <UFormField :label="t('transfer_payment.sequential')" name="egcs_cn_sequential">
      <USwitch
        :model-value="Boolean(state.egcs_cn_sequential)"
        @update:model-value="value => (state.egcs_cn_sequential = value)" />
    </UFormField>
  </div>
</template>
