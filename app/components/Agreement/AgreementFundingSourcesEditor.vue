<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- Form-local callbacks have descriptive names and narrow types. */
import { ref, watch } from 'vue'
import type { Money } from '~~/shared/utils/money'
import { nanoid } from 'nanoid'

type FundingSource = {
  egcs_fc_fundingsubtype: string
  egcs_fc_amount: Money
  egcs_fc_description_en?: string | null
  egcs_fc_description_fr?: string | null
  funding_type_name_en?: string | null
  funding_type_name_fr?: string | null
  funding_subtype_name_en?: string | null
  funding_subtype_name_fr?: string | null
}
const { modelValue, agreementId, currency, identity, allowDescription = false, disabled = false } = defineProps<{
  modelValue: FundingSource[]
  agreementId: string
  currency: string
  identity?: string
  allowDescription?: boolean
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: FundingSource[]] }>()
const { t, locale } = useI18n()
const draftSources = ref<FundingSource[]>(modelValue.map(source => ({ ...source })))
const rowKeys = ref(draftSources.value.map(() => nanoid()))
watch(() => identity, () => {
  draftSources.value = modelValue.map(source => ({ ...source }))
  rowKeys.value = draftSources.value.map(() => nanoid())
})
watch(() => draftSources.value.length, length => {
  while (rowKeys.value.length < length) rowKeys.value.push(nanoid())
  if (rowKeys.value.length > length) rowKeys.value.splice(length)
})
const updateSource = (index: number, patch: Partial<FundingSource>) => {
  draftSources.value = draftSources.value.map((source, position) => position === index ? { ...source, ...patch } : source)
  emit('update:modelValue', draftSources.value.map(source => ({ ...source })))
}
const addSource = () => {
  rowKeys.value.push(nanoid())
  draftSources.value = [
    ...draftSources.value,
    { egcs_fc_fundingsubtype: '', egcs_fc_amount: '0.00' as Money }
  ]
  emit('update:modelValue', draftSources.value.map(source => ({ ...source })))
}
const removeSource = (index: number) => {
  rowKeys.value.splice(index, 1)
  draftSources.value = draftSources.value.filter((_source, position) => position !== index)
  emit('update:modelValue', draftSources.value.map(source => ({ ...source })))
}
const retainedOption = (source: FundingSource) => {
  if (!source.egcs_fc_fundingsubtype || !source.funding_subtype_name_en || !source.funding_subtype_name_fr) return []
  const typeName = locale.value === 'fr' ? source.funding_type_name_fr : source.funding_type_name_en
  const subtypeName = locale.value === 'fr' ? source.funding_subtype_name_fr : source.funding_subtype_name_en
  return [{ value: source.egcs_fc_fundingsubtype, label: typeName ? `${typeName} / ${subtypeName}` : subtypeName }]
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between gap-3">
      <h3 class="font-semibold">
        {{ t('agreement.funding_sources.title') }}
      </h3>
      <UButton v-if="!disabled" type="button" icon="i-lucide-plus" variant="outline" :label="t('agreement.funding_sources.add')" @click="addSource" />
    </div>
    <p v-if="draftSources.length === 0" class="text-sm text-muted">
      {{ t('agreement.funding_sources.none') }}
    </p>
    <div v-for="(source, index) in draftSources" :key="rowKeys[index]" class="grid gap-3 rounded-lg border border-default p-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
      <UFormField :label="t('agreement.funding_sources.subtype')" :name="`egcs_fc_fundingsources.${index}.egcs_fc_fundingsubtype`" :required="!disabled">
        <CommonServerLookupSelect
          :model-value="source.egcs_fc_fundingsubtype"
          :fetch-url="`/api/agreements/${agreementId}/funding-subtypes`"
          selected-values-query-key="selected_ids"
          :prepend-items="retainedOption(source)"
          value-key="id"
          label-en-key="label_en"
          label-fr-key="label_fr"
          :show-value-in-label="false"
          close-on-select
          :disabled="disabled"
          :aria-label="t('agreement.funding_sources.subtype')"
          :aria-required="!disabled"
          :required="!disabled"
          class="w-full"
          @update:model-value="value => updateSource(index, { egcs_fc_fundingsubtype: String(value ?? '') })"
        />
      </UFormField>
      <UFormField :label="t('agreement.funding_sources.amount')" :name="`egcs_fc_fundingsources.${index}.egcs_fc_amount`" :required="!disabled">
        <CommonCurrencyInput
          :model-value="source.egcs_fc_amount"
          :currency="currency"
          :disabled="disabled"
          :aria-label="t('agreement.funding_sources.amount')"
          :aria-required="!disabled"
          :required="!disabled"
          class="w-full"
          @update:model-value="value => updateSource(index, { egcs_fc_amount: String(value ?? '') as Money })"
        />
      </UFormField>
      <UButton v-if="!disabled" type="button" icon="i-lucide-trash" color="error" variant="ghost" :aria-label="t('agreement.funding_sources.remove')" @click="removeSource(index)" />
      <div v-if="allowDescription" class="grid gap-3 md:col-span-3 md:grid-cols-2">
        <UFormField :label="t('agreement.funding_sources.description_en')" :name="`egcs_fc_fundingsources.${index}.egcs_fc_description_en`">
          <CommonTextarea
            :model-value="source.egcs_fc_description_en ?? ''"
            :disabled="disabled"
            :aria-label="t('agreement.funding_sources.description_en')"
            :rows="2"
            class="w-full"
            @update:model-value="value => updateSource(index, { egcs_fc_description_en: value })" />
        </UFormField>
        <UFormField :label="t('agreement.funding_sources.description_fr')" :name="`egcs_fc_fundingsources.${index}.egcs_fc_description_fr`">
          <CommonTextarea
            :model-value="source.egcs_fc_description_fr ?? ''"
            :disabled="disabled"
            :aria-label="t('agreement.funding_sources.description_fr')"
            :rows="2"
            class="w-full"
            @update:model-value="value => updateSource(index, { egcs_fc_description_fr: value })" />
        </UFormField>
      </div>
    </div>
  </div>
</template>
