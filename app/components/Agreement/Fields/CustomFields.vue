<script setup lang="ts">
import { computed } from 'vue'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { customFieldHasValue, customFieldOptionIds } from '~~/shared/types/schemas/agreement-custom-fields'
import type { AgreementCustomFieldSection, AssignedAgencyCustomFieldDefinition, AgreementCustomFieldPatch } from '~~/shared/types/schemas/agreement-custom-fields'

const { streamId, agreementId, readonly = false, permissionAction = 'create' } = defineProps<{
  streamId: string
  agreementId?: string
  readonly?: boolean
  permissionAction?: 'create' | 'update' | 'read'
}>()
const model = defineModel<AgreementCustomFieldPatch>({ default: () => ({}) })
const { t, locale, n } = useI18n()
const requestKey = computed(() => `agreement-custom-fields:${streamId}:${agreementId ?? 'new'}:${permissionAction}`)
const { data, status, error, refresh } = await useAsyncData<{ items: AssignedAgencyCustomFieldDefinition[], sections: AgreementCustomFieldSection[] }>(requestKey, async () => {
  const query = new URLSearchParams({ stream_id: streamId, permission_action: permissionAction })
  if (agreementId) query.set('agreement_id', agreementId)
  const response = await fetch(getClientRequestUrl(`/api/agreements/lookups/custom-fields?${query}`))
  if (!response.ok) await throwFetchResponseError(response)
  return await response.json() as { items: AssignedAgencyCustomFieldDefinition[], sections: AgreementCustomFieldSection[] }
})
const fields = computed(() => (data.value?.items ?? []).filter(field => field.egcs_tp_active || customFieldHasValue(model.value[field.id])))
const sections = computed(() => {
  const grouped = (data.value?.sections ?? []).map(section => ({ ...section, fields: fields.value.filter(field => field.egcs_tp_section === section.id) }))
  const unsectioned = fields.value.filter(field => field.egcs_tp_section === null)
  if (unsectioned.length) grouped.push({ id: 'unsectioned', egcs_tp_name_en: t('custom_fields.title'), egcs_tp_name_fr: t('custom_fields.title'), egcs_tp_displayorder: 0, fields: unsectioned })
  return grouped.filter(section => section.fields.length)
})
const sectionLabel = (value: { egcs_tp_name_en: string, egcs_tp_name_fr: string }) => locale.value === 'fr' ? value.egcs_tp_name_fr : value.egcs_tp_name_en
const label = (value: { egcs_ay_name_en: string, egcs_ay_name_fr: string }) => locale.value === 'fr' ? value.egcs_ay_name_fr : value.egcs_ay_name_en
/**
 * Formats a custom-field value for read-only display.
 * @param field - The definition of the field to format.
 * @returns The localized display value.
 */
const valueLabel = (field: AssignedAgencyCustomFieldDefinition) => {
  const value = model.value[field.id]
  if (field.egcs_ay_kind === 'number') return typeof value === 'number' ? n(value, { maximumSignificantDigits: 21 }) : ''
  return field.egcs_ay_kind !== 'relational'
    ? String(value ?? '')
    : customFieldOptionIds(value).map(optionId => label(field.options.find(option => option.id === optionId) ?? { egcs_ay_name_en: '', egcs_ay_name_fr: '' })).join(', ')
}
// Retired selections can be removed; once removed, the filter prevents adding them again.
const options = (field: AssignedAgencyCustomFieldDefinition) => field.options.filter(option => option.egcs_ay_active || customFieldOptionIds(model.value[field.id]).includes(option.id))
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
    <CommonSection v-for="(section, index) in sections" :key="section.id" :title="sectionLabel(section)" :badge="String(index + 4).padStart(2, '0')" :grid-cols="2">
      <div v-for="field in section.fields" :key="field.id" class="space-y-2">
        <CommonValueCard v-if="readonly" :label="label(field)" :value="valueLabel(field) || t('common.not_available')" :sub-value="field.egcs_tp_active ? undefined : t('custom_fields.inactive')" class="whitespace-pre-wrap" />
        <UFormField v-else :label="label(field)" :name="`egcs_fc_customfields.${field.id}`" :required="field.egcs_tp_active && field.egcs_tp_required" :ui="field.egcs_ay_kind === 'relational' ? { labelWrapper: 'justify-start gap-2 mb-1.5', label: 'mb-0', hint: 'flex items-center' } : undefined">
          <template v-if="field.egcs_ay_kind === 'relational' && customFieldHasValue(model[field.id])" #hint>
            <UButton type="button" size="xs" variant="soft" color="warning" class="bg-amber-100 text-amber-700 ring-1 ring-inset ring-amber-300 hover:bg-amber-200 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/30 dark:hover:bg-amber-400/20" icon="i-lucide-x" :disabled="status === 'pending'" :label="t('custom_fields.clear')" @click="update(field.id, null)" />
          </template>
          <div v-if="readonly || !field.egcs_tp_active" class="flex items-start justify-between gap-4">
            <p class="whitespace-pre-wrap text-sm">
              {{ valueLabel(field) }}
            </p>
            <UBadge v-if="!field.egcs_tp_active" color="neutral" :label="t('custom_fields.inactive')" />
          </div>
          <UTextarea v-else-if="field.egcs_ay_kind === 'text' && field.egcs_ay_presentation === 'multiline'" :model-value="String(model[field.id] ?? '')" class="w-full" @update:model-value="update(field.id, $event)" />
          <UInput v-else-if="field.egcs_ay_kind === 'text'" :model-value="String(model[field.id] ?? '')" class="w-full" @update:model-value="update(field.id, $event)" />
          <UInput v-else-if="field.egcs_ay_kind === 'number'" type="number" step="any" :model-value="typeof model[field.id] === 'number' ? model[field.id] as number : ''" class="w-full" @update:model-value="update(field.id, $event === '' ? null : Number($event))" />
          <CommonBilingualSelectMenu v-else-if="!field.egcs_ay_multiple" label-en-key="egcs_ay_name_en" label-fr-key="egcs_ay_name_fr" :model-value="customFieldOptionIds(model[field.id])[0] ?? null" :items="options(field)" category-en-key="egcs_ay_category_en" category-fr-key="egcs_ay_category_fr" :aria-label="label(field)" class="w-full" @update:model-value="update(field.id, $event ? [$event] : null)" />
          <CommonBilingualMultiSelectMenu v-else label-en-key="egcs_ay_name_en" label-fr-key="egcs_ay_name_fr" :model-value="customFieldOptionIds(model[field.id])" :items="options(field)" category-en-key="egcs_ay_category_en" category-fr-key="egcs_ay_category_fr" :aria-label="label(field)" class="w-full" @update:model-value="update(field.id, $event)" />
        </UFormField>
        <UButton v-if="!readonly && field.egcs_ay_kind !== 'relational' && customFieldHasValue(model[field.id])" variant="link" color="neutral" :disabled="status === 'pending'" :label="t('custom_fields.clear')" @click="update(field.id, null)" />
      </div>
    </CommonSection>
  </div>
</template>
