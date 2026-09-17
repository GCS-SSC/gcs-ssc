<script setup lang="ts">
import { computed } from 'vue'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import type { AgreementCustomFieldDefinition, WorkflowMemberCondition } from '~~/shared/types/schemas/agreement-custom-fields'

const { profileId, streamId } = defineProps<{ profileId: string, streamId: string }>()
const model = defineModel<WorkflowMemberCondition[]>({ default: () => [] })
const { t, locale } = useI18n()
const url = computed(() => `/api/transfer-payments/${profileId}/streams/${streamId}/custom-fields`)
const { data, error, refresh } = await useAsyncData<{ items: AgreementCustomFieldDefinition[] }>(url, async () => {
  const response = await fetch(getClientRequestUrl(url.value))
  if (!response.ok) await throwFetchResponseError(response)
  return await response.json() as { items: AgreementCustomFieldDefinition[] }
})
const selectedOptionIds = (fieldId: string) => model.value.find(condition => condition.fieldId === fieldId)?.optionIds ?? []
const fields = computed(() => (data.value?.items ?? []).filter(field => field.egcs_tp_discriminator && field.egcs_tp_kind === 'relational' && (field.egcs_tp_active || selectedOptionIds(field.id).length > 0)))
const options = (field: AgreementCustomFieldDefinition) => field.options
  .filter(option => (field.egcs_tp_active && option.egcs_tp_active) || selectedOptionIds(field.id).includes(option.id))
  .map(option => ({ value: option.id, label: label(option) }))
const label = (value: { egcs_tp_name_en: string, egcs_tp_name_fr: string }) => locale.value === 'fr' ? value.egcs_tp_name_fr : value.egcs_tp_name_en
const update = (fieldId: string, optionIds: string[]) => {
  model.value = [...model.value.filter(condition => condition.fieldId !== fieldId), ...(optionIds.length ? [{ fieldId, optionIds }] : [])]
}
</script>

<template>
  <CommonSection :title="t('custom_fields.conditions')" :grid-cols="1">
    <UButton v-if="error" :label="t('common.retry')" @click="refresh()" />
    <p class="text-sm text-muted">
      {{ t('custom_fields.conditions_help') }}
    </p>
    <UFormField v-for="field in fields" :key="field.id" :label="label(field)">
      <USelectMenu :model-value="selectedOptionIds(field.id)" :items="options(field)" value-key="value" multiple class="w-full" @update:model-value="update(field.id, $event)" />
    </UFormField>
  </CommonSection>
</template>
