<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- Local typed assessment scenario controls. */
import { computed, ref, watch } from 'vue'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { isCanonicalMoney, type MoneyInput } from '~~/shared/utils/money'
import type { WorkflowSimulationInput, WorkflowSimulationScenario } from '~~/shared/types/schemas/workflow-simulation'

type AssessmentInput = NonNullable<WorkflowSimulationInput['assessment']>
type Outcome = NonNullable<WorkflowSimulationScenario['outcomes']>[string]
type AssessmentScenario = NonNullable<Outcome['assessments']>[string]
type HelperValue = NonNullable<AssessmentScenario['helpers']>[string]
type Answer = NonNullable<AssessmentScenario['answers']>[number]

const { definition } = defineProps<{ definition: AssessmentInput }>()
const model = defineModel<AssessmentScenario>({ default: () => ({}) })
const emit = defineEmits<{ invalid: [boolean] }>()
const { t, locale } = useI18n()
const moneyDrafts = ref<Record<string, MoneyInput>>({})
const currencies = ref<Record<string, string>>({})
const booleanItems = computed(() => [
  { id: 'true', name_en: t('common.yes', {}, { locale: 'en' }), name_fr: t('common.yes', {}, { locale: 'fr' }) },
  { id: 'false', name_en: t('common.no', {}, { locale: 'en' }), name_fr: t('common.no', {}, { locale: 'fr' }) },
  { id: 'unavailable', name_en: t('workflow.simulator.unavailable', {}, { locale: 'en' }), name_fr: t('workflow.simulator.unavailable', {}, { locale: 'fr' }) }
])
const helperValue = (field: string) => model.value.helpers?.[field]
const helperText = (field: string) => {
  const value = helperValue(field)
  return Array.isArray(value) ? value.join(', ') : typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}
const setHelper = (field: string, value: HelperValue) => {
  model.value = { ...model.value, helpers: { ...model.value.helpers, [field]: value } }
}
const setText = (helper: AssessmentInput['helpers'][number], value: string | number | undefined) => {
  const text = String(value ?? '').trim()
  if (!text) return setHelper(helper.field, null)
  if (helper.dataType === 'number') {
    const amount = Number(text)
    return setHelper(helper.field, Number.isFinite(amount) ? amount : null)
  }
  setHelper(helper.field, helper.dataType === 'id_list' ? text.split(',').map(item => item.trim()).filter(Boolean) : text)
}
const setMoney = (field: string, value: MoneyInput) => {
  moneyDrafts.value[field] = value
  setHelper(field, isCanonicalMoney(value) ? value : null)
}
const helperError = (helper: AssessmentInput['helpers'][number]) => {
  const value = helperValue(helper.field)
  const draft = moneyDrafts.value[helper.field]
  if (draft && 'draft' in draft) return t('workflow.simulator.invalid_helper_amount')
  if ((helper.dataType === 'id' && typeof value === 'string' && !isPositivePostgresBigintText(value))
    || (helper.dataType === 'id_list' && Array.isArray(value) && value.some(id => !isPositivePostgresBigintText(id)))) {
    return t('apiErrors.request.invalid_id')
  }
}
watch(() => definition.helpers.some(helper => Boolean(helperError(helper))), invalid => emit('invalid', invalid))
const sameQuestion = (answer: Answer, question: AssessmentInput['questions'][number]) =>
  answer.section === question.section && answer.subsection === question.subsection && answer.question === question.question
const selectedAnswer = (question: AssessmentInput['questions'][number]) => {
  const value = model.value.answers?.find(answer => sameQuestion(answer, question))?.value
  return value === undefined ? undefined : String(value)
}
const setAnswer = (question: AssessmentInput['questions'][number], value: string | null | undefined) => {
  const answers = (model.value.answers ?? []).filter(answer => !sameQuestion(answer, question))
  const option = question.options.find(candidate => String(candidate.value) === value)
  if (option) answers.push({ section: question.section, subsection: question.subsection, question: question.question, value: option.value })
  model.value = { ...model.value, answers }
}
</script>

<template>
  <div class="grid gap-3 sm:grid-cols-2" data-field-scope="agency.workflow-simulation-assessment">
    <UFormField
      v-for="helper in definition.helpers" :key="helper.field" :label="t(helper.labelKey)"
      :required="false" :error="helperError(helper)" data-ui-target="agency.workflow-simulation-assessment.helper" data-field-label-en="Assessment helper" data-field-label-fr="Variable auxiliaire de l’évaluation">
      <CommonBilingualSelectMenu
        v-if="helper.dataType === 'boolean'"
        :model-value="helperValue(helper.field) == null ? 'unavailable' : String(helperValue(helper.field))"
        :items="booleanItems" class="w-full"
        @update:model-value="setHelper(helper.field, $event === 'true' ? true : $event === 'false' ? false : null)" />
      <div v-else-if="helper.dataType === 'money'" class="flex gap-2">
        <CommonEnumSelect v-model="currencies[helper.field]" name="currency_codes" :aria-label="t('common.currency')" />
        <CommonCurrencyInput
          :aria-label="t(helper.labelKey)" :model-value="moneyDrafts[helper.field]" :currency="currencies[helper.field]" :disabled="!currencies[helper.field]"
          class="min-w-0 flex-1" @update:model-value="setMoney(helper.field, $event)" />
      </div>
      <UInput
        v-else :model-value="helperText(helper.field)" :type="helper.dataType === 'number' ? 'number' : 'text'"
        :step="helper.dataType === 'number' ? 'any' : undefined" class="w-full"
        :placeholder="helper.dataType === 'id_list' ? t('workflow.simulator.comma_separated_ids') : undefined"
        @update:model-value="setText(helper, $event)" />
    </UFormField>
    <UFormField
      v-for="question in definition.questions" :key="JSON.stringify([question.section, question.subsection, question.question])"
      :label="locale === 'fr' ? question.nameFr : question.nameEn"
      :required="false" data-ui-target="agency.workflow-simulation-assessment.answer" data-field-label-en="Assessment answer" data-field-label-fr="Réponse à l’évaluation">
      <CommonBilingualSelectMenu
        :model-value="selectedAnswer(question)"
        :items="question.options.map(option => ({ ...option, id: String(option.value), name_en: option.nameEn, name_fr: option.nameFr }))"
        class="w-full" @update:model-value="setAnswer(question, $event)" />
    </UFormField>
  </div>
</template>
