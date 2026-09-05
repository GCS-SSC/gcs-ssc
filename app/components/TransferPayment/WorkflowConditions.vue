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
const fields = computed(() => (data.value?.items ?? []).filter(field => field.active && field.discriminator && field.kind === 'relational'))
const label = (value: { name_en: string, name_fr: string }) => locale.value === 'fr' ? value.name_fr : value.name_en
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
      <USelectMenu :model-value="model.find(condition => condition.fieldId === field.id)?.optionIds ?? []" :items="field.options.filter(option => option.active).map(option => ({ value: option.id, label: label(option) }))" value-key="value" multiple class="w-full" @update:model-value="update(field.id, $event)" />
    </UFormField>
  </CommonSection>
</template>
