<script setup lang="ts">
import { computed, ref } from 'vue'
import { isWorkflowResultCondition, JV_WORKFLOW_BOOLEAN_SOURCES, WORKFLOW_SCORE_OPERATORS } from '~~/shared/types/schemas/agreement-custom-fields'
import type { AgencyCustomFieldDefinition, AgreementProfileCondition, WorkflowMemberCondition, WorkflowResultCondition } from '~~/shared/types/schemas/agreement-custom-fields'

import { CHECKLIST_RESULTS } from '~~/shared/types/schemas/checklist/checklist'
import {
  workflowResultPredicateLabel, workflowResultSourceLabel, workflowScoreOperators
} from '~/utils/workflow-result-conditions'
import type { WorkflowResultMember } from '~/utils/workflow-result-conditions'

const { entityType, readonly = false, customFields, choices, loadError = false, workflowMembers = [], sequence = 0 } = defineProps<{
  entityType: string
  readonly?: boolean
  customFields: AgencyCustomFieldDefinition[]
  choices: Partial<Record<Exclude<AgreementProfileCondition['source'], 'further_distribution' | typeof JV_WORKFLOW_BOOLEAN_SOURCES[number]>, { id: string, name_en: string, name_fr: string, category_en?: string, category_fr?: string }[]>>
  loadError?: boolean
  workflowMembers?: WorkflowResultMember[]
  sequence?: number
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
const sources = computed<Source[]>(() => ['agreement_subtype', 'amendment_type', 'amendment_subtype', 'further_distribution', 'recipient_subtype', ...(entityType === 'fundingcasejournalvoucher' ? JV_WORKFLOW_BOOLEAN_SOURCES : [])])
const sourceItems = computed(() => sources.value.filter(source => !model.value.some(condition => 'source' in condition && condition.source === source))
  .map(id => ({ id, name_en: t(`workflow.conditions.${id}`, {}, { locale: 'en' }), name_fr: t(`workflow.conditions.${id}`, {}, { locale: 'fr' }) })))
const profileRows = computed(() => model.value.flatMap((condition, index) => 'source' in condition && !isWorkflowResultCondition(condition) ? [{ condition, index }] : []))
/**
 * Start an explicit predicate with a valid boolean or an unselected required reference.
 * @param source - Selected Agreement field.
 */
const addCondition = (source: Source | null) => {
  if (!source) return
  const condition: AgreementProfileCondition = source === 'further_distribution' || JV_WORKFLOW_BOOLEAN_SOURCES.includes(source as typeof JV_WORKFLOW_BOOLEAN_SOURCES[number])
    ? { source: source as 'further_distribution' | typeof JV_WORKFLOW_BOOLEAN_SOURCES[number], value: false }
    : source === 'recipient_subtype' ? { source, quantifier: 'any', optionIds: [] } : { source: source as 'agreement_subtype' | 'amendment_type' | 'amendment_subtype', optionIds: [] }
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
const pendingResult: Ref<string | null> = ref(null)
/**
 * @param ids - Option identifiers.
 * @param key - Localization key for each option.
 * @returns Options with English and French labels.
 */
const bilingualItems = (ids: readonly string[], key: (id: string) => string) => ids.map(id => ({
  id,
  name_en: t(key(id), {}, { locale: 'en' }),
  name_fr: t(key(id), {}, { locale: 'fr' })
}))
const resultOptions = computed(() => workflowMembers.filter(member => member.egcs_cn_sequence < sequence)
  .flatMap(member => (member.resultSources ?? []).map(source => ({
    ...source,
    workflowMemberId: member.id,
    id: `${member.id}:${source.nestedMemberId}:${source.source}`,
    name_en: `${t('workflow.conditions.step', { number: member.egcs_cn_sequence }, { locale: 'en' })} · ${source.nameEn} (${t(`workflow.conditions.${source.source}`, {}, { locale: 'en' })})`,
    name_fr: `${t('workflow.conditions.step', { number: member.egcs_cn_sequence }, { locale: 'fr' })} · ${source.nameFr} (${t(`workflow.conditions.${source.source}`, {}, { locale: 'fr' })})`,
    category_en: `${t('workflow.conditions.step', { number: member.egcs_cn_sequence }, { locale: 'en' })}${member.referenceNameEn ? `: ${member.referenceNameEn}` : ''}`,
    category_fr: `${t('workflow.conditions.step', { number: member.egcs_cn_sequence }, { locale: 'fr' })}${member.referenceNameFr ? `: ${member.referenceNameFr}` : ''}`
  }))).filter(option => {
    const predicates = model.value.filter(condition => isWorkflowResultCondition(condition) && condition.source === option.source
      && condition.workflowMemberId === option.workflowMemberId && condition.nestedMemberId === option.nestedMemberId)
    return option.source === 'assessment_score' ? predicates.length < WORKFLOW_SCORE_OPERATORS.length : predicates.length === 0
  }))
const resultRows = computed(() => model.value.flatMap((condition, index) => {
  if (!isWorkflowResultCondition(condition)) return []
  return [{ condition, index, ...workflowResultSourceLabel(condition, sequence, workflowMembers, locale.value, t) }]
}))
const checklistItems = computed(() => bilingualItems(CHECKLIST_RESULTS, id => `checklist.result.${id}`))
const recommendationItems = computed(() => bilingualItems(['true', 'false'], id => id === 'true'
  ? 'recommendation.outcomes.recommended'
  : 'recommendation.outcomes.not_recommended'))
const operatorItems = WORKFLOW_SCORE_OPERATORS.map(id => ({ id, name_en: workflowScoreOperators[id], name_fr: workflowScoreOperators[id] }))
/**
 * @param condition - The assessment predicate being edited.
 * @returns Operators not used by another predicate for this source.
 */
const scoreOperators = (condition: Extract<WorkflowResultCondition, { source: 'assessment_score' }>) => operatorItems.filter(item =>
  !model.value.some(other => other !== condition && 'source' in other && other.source === 'assessment_score'
    && other.workflowMemberId === condition.workflowMemberId && other.nestedMemberId === condition.nestedMemberId
    && other.operator === item.id
  )
)

/** Add a predicate for the selected source. */
const addResultCondition = () => {
  const result = resultOptions.value.find(option => option.id === pendingResult.value)
  if (!result) return
  const { workflowMemberId, nestedMemberId, source } = result
  const reference = { workflowMemberId, nestedMemberId }
  let condition: WorkflowResultCondition
  if (source === 'assessment_score') {
    const draft = { ...reference, source, operator: 'gte' as const, value: Number.NaN }
    const options = scoreOperators(draft)
    const operator = (options.find(item => item.id === draft.operator) ?? options[0])?.id
    if (!operator) return
    condition = { ...draft, operator }
  } else {
    condition = source === 'checklist_result' ? { ...reference, source, values: [] } : { ...reference, source, value: true }
  }
  model.value = [...model.value, condition]
  pendingResult.value = null
}
const badges = computed(() => model.value.map((condition, index) => {
  if (isWorkflowResultCondition(condition)) {
    const source = workflowResultSourceLabel(condition, sequence, workflowMembers, locale.value, t)
    return {
      key: `result:${index}`,
      text: t('workflow.conditions.badge', { field: source.label, value: workflowResultPredicateLabel(condition, locale.value, t) }),
      option: null,
      error: source.error
    }
  }
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
  const value = 'value' in condition
    ? t(condition.value ? 'common.yes' : 'common.no')
    : condition.optionIds.map(id => {
        const choice = choices[condition.source as Exclude<Source, 'further_distribution' | typeof JV_WORKFLOW_BOOLEAN_SOURCES[number]>]?.find(item => item.id === id)
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
  <div v-if="readonly" class="flex flex-wrap gap-2" role="group" :aria-label="t('custom_fields.conditions')" data-field-scope="transfer-payment.workflow-conditions">
    <UBadge v-for="badge in badges" :key="badge.key" :color="badge.error ? 'warning' : 'neutral'" variant="subtle" class="whitespace-normal">
      <span>{{ badge.text }}</span>
      <span v-if="badge.error" class="ms-1">({{ badge.error }})</span>
      <template v-if="badge.option">
        <span aria-hidden="true" data-testid="condition-separator" class="mx-1 size-1 shrink-0 rounded-full bg-current" />
        <span class="sr-only">{{ t('workflow.conditions.badge_rule_separator') }}</span>
        <span>{{ badge.option }}</span>
      </template>
    </UBadge>
    <span v-if="!badges.length" class="text-sm text-muted">{{ t('workflow.conditions.unconditional') }}</span>
    <UButton v-if="loadError" :label="t('common.retry')" color="neutral" variant="ghost" @click="emit('retry')" />
  </div>
  <CommonSection v-else :title="t('custom_fields.conditions')" :grid-cols="1" data-field-scope="transfer-payment.workflow-conditions">
    <UButton v-if="loadError" :label="t('common.retry')" @click="emit('retry')" />
    <p class="text-sm text-muted">
      {{ t(resultOptions.length || resultRows.length ? 'workflow.conditions.results_help' : 'custom_fields.conditions_help') }}
    </p>
    <template v-if="entityType !== 'applicantrecipient'">
      <div v-if="sourceItems.length" class="flex items-end gap-2">
        <UFormField :label="t('workflow.conditions.field')" :required="false" class="min-w-0 flex-1" data-ui-target="transfer-payment.workflow-conditions.workflow.conditions.field">
          <CommonBilingualSelectMenu :model-value="pendingSource ?? undefined" :items="sourceItems" class="w-full" @update:model-value="pendingSource = ($event as Source) ?? null" />
        </UFormField>
        <UButton icon="i-lucide-plus" :label="t('workflow.conditions.add')" :disabled="!pendingSource" @click="addCondition(pendingSource)" />
      </div>
      <div v-for="{ condition, index } in profileRows" :key="condition.source" class="space-y-3">
        <UFormField v-if="'value' in condition" data-field-label-en="Condition value" data-field-label-fr="Valeur de la condition" :name="`conditions.${index}.value`" :label="t(`workflow.conditions.${condition.source}`)" required data-ui-target="transfer-payment.workflow-conditions.conditions.value">
          <CommonBilingualSelectMenu :model-value="String(condition.value)" :items="booleanItems" class="w-full" @update:model-value="condition.value = $event === 'true'" />
        </UFormField>
        <template v-else>
          <UFormField data-field-label-en="Condition choices" data-field-label-fr="Choix de la condition" :name="`conditions.${index}.optionIds`" :label="t(`workflow.conditions.${condition.source}`)" required data-ui-target="transfer-payment.workflow-conditions.conditions.optionIds">
            <CommonBilingualMultiSelectMenu
              v-model="condition.optionIds"
              :items="choices?.[condition.source] ?? []"
              :category-en-key="(condition.source === 'amendment_type' || condition.source === 'amendment_subtype') ? 'category_en' : undefined"
              :category-fr-key="(condition.source === 'amendment_type' || condition.source === 'amendment_subtype') ? 'category_fr' : undefined"
              class="w-full" />
          </UFormField>
          <UFormField v-if="condition.source === 'recipient_subtype'" :name="`conditions.${index}.quantifier`" :label="t('workflow.conditions.quantifier')" required data-ui-target="transfer-payment.workflow-conditions.conditions.quantifier">
            <CommonBilingualSelectMenu v-model="condition.quantifier" :items="quantifierItems" class="w-full" />
          </UFormField>
        </template>
        <UButton :label="t('common.remove')" color="neutral" variant="ghost" @click="removeCondition(index)" />
      </div>
    </template>
    <div v-if="resultOptions.length" class="flex flex-wrap items-end gap-2">
      <UFormField
        :label="t('workflow.conditions.earlier_result')" :required="false" class="min-w-0 flex-1"
        data-ui-target="transfer-payment.workflow-conditions.result-source">
        <CommonBilingualSelectMenu
          v-model="pendingResult" :items="resultOptions" category-en-key="category_en" category-fr-key="category_fr"
          class="w-full" />
      </UFormField>
      <UButton icon="i-lucide-plus" :label="t('workflow.conditions.add_result')" :disabled="!pendingResult" @click="addResultCondition" />
    </div>
    <div v-for="{ condition, index, label: sourceLabel, error } in resultRows" :key="`result:${index}`" role="group" :aria-label="sourceLabel" class="space-y-3">
      <p class="font-medium">
        {{ sourceLabel }}
      </p>
      <p v-if="error" class="text-sm text-warning">
        {{ error }}
      </p>
      <template v-if="condition.source === 'assessment_score'">
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField
            :name="`conditions.${index}.operator`" :label="t('workflow.conditions.score_operator')" required
            data-ui-target="transfer-payment.workflow-conditions.score-operator">
            <CommonBilingualSelectMenu
              :model-value="condition.operator" :items="scoreOperators(condition)" class="w-full"
              @update:model-value="value => { const operator = scoreOperators(condition).find(item => item.id === value)?.id; if (operator) condition.operator = operator }" />
          </UFormField>
          <UFormField
            :name="`conditions.${index}.value`" :label="t('workflow.conditions.score_value')" required
            data-ui-target="transfer-payment.workflow-conditions.score-value">
            <UInput
              type="number" step="any" inputmode="decimal" class="w-full"
              :model-value="Number.isFinite(condition.value) ? String(condition.value) : ''"
              @update:model-value="condition.value = $event === '' ? Number.NaN : Number($event)" />
          </UFormField>
        </div>
      </template>
      <UFormField
        v-else-if="condition.source === 'checklist_result'" :name="`conditions.${index}.values`" :label="t('workflow.conditions.checklist_value')" required
        data-ui-target="transfer-payment.workflow-conditions.checklist-value">
        <CommonBilingualMultiSelectMenu
          :model-value="condition.values" :items="checklistItems" class="w-full"
          @update:model-value="values => { condition.values = CHECKLIST_RESULTS.filter(result => values.includes(result)) }" />
      </UFormField>
      <UFormField
        v-else :name="`conditions.${index}.value`" :label="t('workflow.conditions.recommendation_value')" required
        data-ui-target="transfer-payment.workflow-conditions.recommendation-value">
        <CommonBilingualSelectMenu
          :model-value="String(condition.value)" :items="recommendationItems" class="w-full"
          @update:model-value="condition.value = $event === 'true'" />
      </UFormField>
      <UButton :label="t('common.remove')" color="neutral" variant="ghost" @click="removeCondition(index)" />
    </div>
    <UFormField v-for="field in fields" :key="field.id" data-field-label-en="Custom field choices" data-field-label-fr="Choix du champ personnalisé" :label="label(field)" :required="false" data-ui-target="transfer-payment.workflow-conditions.field-options">
      <USelectMenu :model-value="selectedOptionIds(field.id)" :items="options(field)" value-key="value" multiple class="w-full" @update:model-value="update(field.id, $event)" />
    </UFormField>
  </CommonSection>
</template>
