<script setup lang="ts">
import { computed, watch } from 'vue'

const {
  proponentId,
  streamId,
  agreementId,
  relationshipId,
  permissionAction = 'create',
  name = 'egcs_fc_agencyfinancialid',
  label
} = defineProps<{
  proponentId?: string
  streamId?: string
  agreementId?: string
  relationshipId?: string
  permissionAction?: 'create' | 'update'
  name?: string
  label?: string
}>()

const model = defineModel<string | null>()
const { t } = useI18n()
let retainedId = model.value

watch(() => [proponentId, streamId, agreementId, relationshipId], () => {
  model.value = undefined
  retainedId = undefined
}, { flush: 'sync' })

const query = computed(() => ({
  proponent_id: proponentId ?? '',
  ...(agreementId ? { agreement_id: agreementId } : { stream_id: streamId ?? '' }),
  permission_action: permissionAction,
  ...(relationshipId ? { child_id: relationshipId } : {}),
  ...(relationshipId && retainedId && model.value === retainedId ? { selected_id: retainedId } : {})
}))
</script>

<template>
  <UFormField :name="name" :label="label ?? t('agreement.applicant_recipients.financial_id')" required>
    <CommonServerLookupSelect
      v-if="proponentId && (streamId || agreementId)"
      :model-value="model ?? undefined"
      fetch-url="/api/agreements/lookups/financial-ids"
      :query="query"
      value-key="id"
      label-en-key="egcs_ar_financialsystemid"
      label-fr-key="egcs_ar_financialsystemid"
      :show-value-in-label="false"
      :include-deleted-query="false"
      :placeholder="t('agreement.applicant_recipients.financial_id_placeholder')"
      searchable
      @update:model-value="model = $event" />
    <USelectMenu v-else disabled :placeholder="t('agreement.applicant_recipients.financial_id_placeholder')" />
  </UFormField>
</template>
