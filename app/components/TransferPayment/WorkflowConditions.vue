<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AgencyCustomFieldDefinition, AgreementProfileCondition, WorkflowMemberCondition } from '~~/shared/types/schemas/agreement-custom-fields'

const { entityType, readonly = false, customFields, choices, loadError = false } = defineProps<{
  entityType: string
  readonly?: boolean
  customFields: AgencyCustomFieldDefinition[]
  choices: Partial<Record<Exclude<AgreementProfileCondition['source'], 'further_distribution'>, { id: string, name_en: string, name_fr: string }[]>>
  loadError?: boolean
}>()
const emit = defineEmits<{ retry: [] }>()
const model = defineModel<WorkflowMemberCondition[]>({ default: () => [] })
const { t, locale } = useI18n()
const selectedOptionIds = (fieldId: string) => model.value.filter(condition => 'fieldId' in condition).find(condition => condition.fieldId === fieldId)?.optionIds ?? []
const fields = computed(() => customFields.filter(field => field.egcs_ay_discriminator && field.egcs_ay_kind === 'relational'))
const options = (field: AgencyCustomFieldDefinition) => field.options
  .filter(option => option.egcs_ay_active || selectedOptionIds(field.id).includes(option.id))
  .map(option => ({ value: option.id, label: label(option) }))
const label = (value: { egcs_ay_name_en: string, egcs_ay_name_fr: string }) => locale.value === 'fr' ? value.egcs_ay_name_fr : value.egcs_ay_name_en
const update = (fieldId: string, optionIds: string[]) => {
  model.value = [...model.value.filter(condition => !('fieldId' in condition) || condition.fieldId !== fieldId), ...(optionIds.length ? [{ fieldId, optionIds }] : [])]
}
type Source = AgreementProfileCondition['source']
const pendingSource: Ref<Source | null> = ref(null)
const sources: Source[] = ['agreement_subtype', 'further_distribution', 'recipient_subtype']
const sourceItems = computed(() => sources.filter(source => !model.value.some(condition => 'source' in condition && condition.source === source))
  .map(id => ({ id, name_en: t(`workflow.conditions.${id}`, {}, { locale: 'en' }), name_fr: t(`workflow.conditions.${id}`, {}, { locale: 'fr' }) })))
const profileRows = computed(() => model.value.flatMap((condition, index) => 'source' in condition ? [{ condition, index }] : []))
/**
 * Start an explicit predicate with a valid boolean or an unselected required reference.
 * @param source - Selected Agreement field.
 */
const addCondition = (source: Source | null) => {
  if (!source) return
  const condition: AgreementProfileCondition = source === 'further_distribution'
    ? { source, value: false }
    : source === 'recipient_subtype' ? { source, quantifier: 'any', optionIds: [] } : { source, optionIds: [] }
  model.value = [...model.value, condition]
  pendingSource.value = null
}
const removeCondition = (index: number) => {
  model.value = model.value.filter((_, position) => position !== index)
}
const booleanItems = computed(() => ['true', 'false'].map(id => ({ id,
  name_en: t(id === 'true' ? 'common.yes' : 'common.no', {}, { locale: 'en' }),
  name_fr: t(id === 'true' ? 'common.yes' : 'common.no', {}, { locale: 'fr' })
})))
const quantifierItems = computed(() => ['any', 'all'].map(id => ({ id,
  name_en: t(`workflow.conditions.${id}`, {}, { locale: 'en' }),
  name_fr: t(`workflow.conditions.${id}`, {}, { locale: 'fr' })
})))
const badges = computed(() => model.value.map(condition => {
  if ('fieldId' in condition) {
    const field = customFields.find(item => item.id === condition.fieldId)
    return {
      key: condition.fieldId,
      option: null,
      text: t('workflow.conditions.badge', {
        field: field ? label(field) : t('workflow.conditions.unavailable'),
        value: condition.optionIds.map(id => {
          const option = field?.options.find(item => item.id === id)
          return option ? label(option) : t('workflow.conditions.unavailable')
        }).join(', ')
      })
    }
  }
  const value = condition.source === 'further_distribution'
    ? t(condition.value ? 'common.yes' : 'common.no')
    : condition.optionIds.map(id => {
        const choice = choices[condition.source as Exclude<Source, 'further_distribution'>]?.find(item => item.id === id)
        return choice ? (locale.value === 'fr' ? choice.name_fr : choice.name_en) : t('workflow.conditions.unavailable')
      }).join(', ')
  return {
    key: condition.source,
    text: t('workflow.conditions.badge', { field: t(`workflow.conditions.${condition.source}`), value }),
    option: condition.source === 'recipient_subtype' ? t(`workflow.conditions.${condition.quantifier}`) : null
  }
}))
</script>

<template>
  <div v-if="readonly" class="flex flex-wrap gap-2" role="group" :aria-label="t('custom_fields.conditions')">
    <UBadge v-for="badge in badges" :key="badge.key" color="neutral" variant="subtle" class="whitespace-normal">
      <span>{{ badge.text }}</span>
      <template v-if="badge.option">
        <span aria-hidden="true" data-testid="condition-separator" class="mx-1 size-1 shrink-0 rounded-full bg-current" />
        <span class="sr-only">{{ t('workflow.conditions.badge_rule_separator') }}</span>
        <span>{{ badge.option }}</span>
      </template>
    </UBadge>
    <span v-if="!badges.length" class="text-sm text-muted">{{ t('workflow.conditions.unconditional') }}</span>
    <UButton v-if="loadError" :label="t('common.retry')" color="neutral" variant="ghost" @click="emit('retry')" />
  </div>
  <CommonSection v-else :title="t('custom_fields.conditions')" :grid-cols="1">
    <UButton v-if="loadError" :label="t('common.retry')" @click="emit('retry')" />
    <p class="text-sm text-muted">
      {{ t('custom_fields.conditions_help') }}
    </p>
    <template v-if="entityType !== 'applicantrecipient'">
      <div v-if="sourceItems.length" class="flex items-end gap-2">
        <UFormField :label="t('workflow.conditions.field')" :required="false" class="min-w-0 flex-1">
          <CommonBilingualSelectMenu :model-value="pendingSource ?? undefined" :items="sourceItems" class="w-full" @update:model-value="pendingSource = ($event as Source) ?? null" />
        </UFormField>
        <UButton icon="i-lucide-plus" :label="t('workflow.conditions.add')" :disabled="!pendingSource" @click="addCondition(pendingSource)" />
      </div>
      <div v-for="{ condition, index } in profileRows" :key="condition.source" class="space-y-3">
        <UFormField v-if="condition.source === 'further_distribution'" :name="`conditions.${index}.value`" :label="t(`workflow.conditions.${condition.source}`)" required>
          <CommonBilingualSelectMenu :model-value="String(condition.value)" :items="booleanItems" class="w-full" @update:model-value="condition.value = $event === 'true'" />
        </UFormField>
        <template v-else>
          <UFormField :name="`conditions.${index}.optionIds`" :label="t(`workflow.conditions.${condition.source}`)" required>
            <CommonBilingualMultiSelectMenu v-model="condition.optionIds" :items="choices?.[condition.source] ?? []" class="w-full" />
          </UFormField>
          <UFormField v-if="condition.source === 'recipient_subtype'" :name="`conditions.${index}.quantifier`" :label="t('workflow.conditions.quantifier')" required>
            <CommonBilingualSelectMenu v-model="condition.quantifier" :items="quantifierItems" class="w-full" />
          </UFormField>
        </template>
        <UButton :label="t('common.remove')" color="neutral" variant="ghost" @click="removeCondition(index)" />
      </div>
    </template>
    <UFormField v-for="field in fields" :key="field.id" :label="label(field)" :required="false">
      <USelectMenu :model-value="selectedOptionIds(field.id)" :items="options(field)" value-key="value" multiple class="w-full" @update:model-value="update(field.id, $event)" />
    </UFormField>
  </CommonSection>
</template>
