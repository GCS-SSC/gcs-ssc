<script setup lang="ts">
import { computed } from 'vue'

const state = defineModel<Record<string, unknown>>('state', { required: true, default: () => ({}) })

const {
  streamId,
  agencyId,
  entityType,
  reviewType,
  stackedLayout = false
} = defineProps<{
  transferPaymentId: string
  streamId: string
  agencyId?: string
  entityType?: string
  reviewType?: string
  stackedLayout?: boolean
}>()

const { t } = useI18n()
const approvalTemplateQuery = computed(() => ({
  scopeType: 'transferpaymentstream',
  scopeId: streamId
}))

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

const reviewSchemaValue = computed(() => {
  const value = state.value.egcs_cn_reviewschema
  return typeof value === 'string' ? value : undefined
})
const reviewSchemaFetchUrl = computed(() => agencyId
  ? `/api/agency/${encodeURIComponent(agencyId)}/review-schemas`
  : null
)
const reviewSchemaQuery = computed(() => ({
  ...(reviewType ? { reviewType } : {}),
  ...(entityType ? { entityType } : {})
}))
</script>

<template>
  <div :class="stackedLayout ? 'space-y-4' : 'grid grid-cols-1 gap-4 md:grid-cols-2'">
    <UFormField :label="t('common.order')" name="egcs_cn_order">
      <UInput
        type="number"
        :model-value="orderValue"
        @update:model-value="value => (state.egcs_cn_order = value)" />
    </UFormField>

    <AdminCommonLookupField
      :model-value="approvalTemplateValue"
      :label="t('transfer_payment.approval_template_id')"
      name="egcs_cn_approvaltemplate"
      fetch-url="/api/approval-templates"
      value-key="id"
      label-en-key="egcs_cn_name_en"
      label-fr-key="egcs_cn_name_fr"
      :query="approvalTemplateQuery"
      @update:model-value="value => (state.egcs_cn_approvaltemplate = value)" />
  </div>

  <AdminCommonLookupField
    v-if="reviewSchemaFetchUrl"
    :model-value="reviewSchemaValue"
    :label="t('transfer_payment.review_schema')"
    name="egcs_cn_reviewschema"
    :fetch-url="reviewSchemaFetchUrl"
    value-key="id"
    label-en-key="egcs_cn_name_en"
    label-fr-key="egcs_cn_name_fr"
    :query="reviewSchemaQuery"
    @update:model-value="value => (state.egcs_cn_reviewschema = value)" />
</template>
