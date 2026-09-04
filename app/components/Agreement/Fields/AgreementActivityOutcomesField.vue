<script setup lang="ts">
import { computed } from 'vue'

const {
  agreementId,
  name = 'outcome_ids',
  permissionAction = 'update'
} = defineProps<{
  agreementId: string
  name?: string
  permissionAction?: 'create' | 'update'
}>()

const model = defineModel<string[]>('model', {
  default: () => []
})
const { t } = useI18n()
const lookupQuery = computed(() => ({ permission_action: permissionAction }))
</script>

<template>
  <UFormField :label="t('agreement.activities.related_outcomes')" :name="name">
    <CommonServerLookupSelect
      v-model:values="model"
      :fetch-url="`/api/agreements/${encodeURIComponent(agreementId)}/activities/lookups/outcomes`"
      value-key="id"
      label-en-key="label_en"
      label-fr-key="label_fr"
      :show-value-in-label="false"
      :query="lookupQuery"
      selected-values-query-key="ids"
      multiple
      class="w-full"
      :aria-label="t('agreement.activities.related_outcomes')"
      :search-input="{ placeholder: t('agreement.activities.search_outcomes') }" />
  </UFormField>
</template>
