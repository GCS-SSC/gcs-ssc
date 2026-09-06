<script setup lang="ts">
import { computed } from 'vue'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { customFieldHasValue, customFieldOptionIds } from '~~/shared/types/schemas/agreement-custom-fields'
import type { AgreementCustomFieldSection, AgreementCustomFieldDefinition, AgreementCustomFieldPatch } from '~~/shared/types/schemas/agreement-custom-fields'

const { streamId, agreementId, readonly = false, permissionAction = 'create' } = defineProps<{
  streamId: string
  agreementId?: string
  readonly?: boolean
  permissionAction?: 'create' | 'update' | 'read'
}>()
const model = defineModel<AgreementCustomFieldPatch>({ default: () => ({}) })
const { t, locale } = useI18n()
const requestKey = computed(() => `agreement-custom-fields:${streamId}:${agreementId ?? 'new'}:${permissionAction}`)
const { data, status, error, refresh } = await useAsyncData<{ items: AgreementCustomFieldDefinition[], sections: AgreementCustomFieldSection[] }>(requestKey, async () => {
  const query = new URLSearchParams({ stream_id: streamId, permission_action: permissionAction })
  if (agreementId) query.set('agreement_id', agreementId)
  const response = await fetch(getClientRequestUrl(`/api/agreements/lookups/custom-fields?${query}`))
  if (!response.ok) await throwFetchResponseError(response)
  return await response.json() as { items: AgreementCustomFieldDefinition[], sections: AgreementCustomFieldSection[] }
})
const fields = computed(() => (data.value?.items ?? []).filter(field => field.active || customFieldHasValue(model.value[field.id])))
const sections = computed(() => (data.value?.sections ?? []).map(section => ({ ...section, fields: fields.value.filter(field => field.section_id === section.id) })))
const label = (value: { name_en: string, name_fr: string }) => locale.value === 'fr' ? value.name_fr : value.name_en
const valueLabel = (field: AgreementCustomFieldDefinition) => field.kind !== 'relational'
  ? String(model.value[field.id] ?? '')
  : customFieldOptionIds(model.value[field.id]).map(optionId => label(field.options.find(option => option.id === optionId) ?? { name_en: '', name_fr: '' })).join(', ')
const options = (field: AgreementCustomFieldDefinition) => field.options.filter(option => option.active || customFieldOptionIds(model.value[field.id]).includes(option.id))
  .map(option => ({ ...option, disabled: !option.active }))
const update = (id: string, value: unknown) => {
  model.value = { ...model.value, [id]: typeof value === 'string' || typeof value === 'number' || Array.isArray(value) ? value as string | number | string[] : null }
}
</script>

<template>
  <div class="space-y-8">
    <UAlert v-if="error" color="error" :title="t('common.error')">
      <template #actions>
        <UButton :label="t('common.retry')" @click="refresh()" />
      </template>
    </UAlert>
    <CommonSection v-for="(section, index) in sections" :key="section.id" :title="label(section)" :badge="String(index + 4).padStart(2, '0')" :grid-cols="2">
      <div v-for="field in section.fields" :key="field.id" class="space-y-2">
        <CommonValueCard v-if="readonly" :label="label(field)" :value="valueLabel(field) || '-'" :sub-value="field.active ? undefined : t('custom_fields.inactive')" class="whitespace-pre-wrap" />
        <UFormField v-else :label="label(field)" :name="`egcs_fc_customfields.${field.id}`" :required="field.active && field.required" :ui="field.kind === 'relational' ? { labelWrapper: 'justify-start gap-2 mb-1.5', label: 'mb-0', hint: 'flex items-center' } : undefined">
          <template v-if="field.kind === 'relational' && customFieldHasValue(model[field.id])" #hint>
            <UButton type="button" size="xs" variant="soft" color="warning" class="bg-amber-100 text-amber-700 ring-1 ring-inset ring-amber-300 hover:bg-amber-200 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/30 dark:hover:bg-amber-400/20" icon="i-lucide-x" :disabled="status === 'pending'" :label="t('custom_fields.clear')" @click="update(field.id, null)" />
          </template>
          <div v-if="readonly || !field.active" class="flex items-start justify-between gap-4">
            <p class="whitespace-pre-wrap text-sm">
              {{ valueLabel(field) }}
            </p>
            <UBadge v-if="!field.active" color="neutral" :label="t('custom_fields.inactive')" />
          </div>
          <UTextarea v-else-if="field.kind === 'text' && field.presentation === 'multiline'" :model-value="String(model[field.id] ?? '')" class="w-full" @update:model-value="update(field.id, $event)" />
          <UInput v-else-if="field.kind === 'text'" :model-value="String(model[field.id] ?? '')" class="w-full" @update:model-value="update(field.id, $event)" />
          <UInput v-else-if="field.kind === 'number'" type="number" step="any" :model-value="typeof model[field.id] === 'number' ? model[field.id] as number : ''" class="w-full" @update:model-value="update(field.id, $event === '' ? null : Number($event))" />
          <CommonBilingualSelectMenu v-else-if="!field.multiple" :model-value="customFieldOptionIds(model[field.id])[0] ?? null" :items="options(field)" category-en-key="category_en" category-fr-key="category_fr" :aria-label="label(field)" class="w-full" @update:model-value="update(field.id, $event ? [$event] : null)" />
          <CommonBilingualMultiSelectMenu v-else :model-value="customFieldOptionIds(model[field.id])" :items="options(field)" category-en-key="category_en" category-fr-key="category_fr" :aria-label="label(field)" class="w-full" @update:model-value="update(field.id, $event)" />
        </UFormField>
        <UButton v-if="!readonly && field.kind !== 'relational' && customFieldHasValue(model[field.id])" variant="link" color="neutral" :disabled="status === 'pending'" :label="t('custom_fields.clear')" @click="update(field.id, null)" />
      </div>
    </CommonSection>
  </div>
</template>
