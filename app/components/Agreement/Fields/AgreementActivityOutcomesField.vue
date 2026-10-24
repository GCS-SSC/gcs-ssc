<script setup lang="ts">
import { computed } from 'vue'

const {
  agreementId,
  amendmentId,
  name = 'outcome_ids',
  permissionAction = 'update'
} = defineProps<{
  agreementId: string
  amendmentId?: string
  name?: string
  permissionAction?: 'create' | 'update'
}>()

const model = defineModel<string[]>('model', {
  default: () => []
})
const { t } = useI18n()
const lookupQuery = computed(() => ({
  permission_action: permissionAction,
  ...(amendmentId ? { amendment_id: amendmentId } : {})
}))
</script>

<template>
  <UFormField :label="t('agreement.activities.related_outcomes')" :name="name" data-ui-target="agreement.fields.activity-outcomes-field.name" data-field-tooltip-context="agreement" data-field-scope="agreement.fields.activity-outcomes-field" data-scope-label-en="Agreements > Activities" data-scope-label-fr="Ententes > Activités">
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
