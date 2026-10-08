<script setup lang="ts">
import { computed } from 'vue'
import type { RecommendationQuestion } from '~~/shared/types/schemas/recommendation/recommendation'
import type { QuestionnaireQuestion } from '~~/shared/types/schemas/questionnaire'

const question = defineModel<RecommendationQuestion>({ required: true })
const emit = defineEmits<{ decidingSelected: [questionKey: string] }>()
const { t } = useI18n()
const outcomeOptions = computed(() => [
  { value: 'recommended', label: t('recommendation.outcomes.recommended') },
  { value: 'not_recommended', label: t('recommendation.outcomes.not_recommended') }
])
/**
 * Preserves Recommendation metadata when the shared editor changes a question type.
 * @param value Updated question or decision selection.
 */
const updateQuestion = (value: QuestionnaireQuestion | RecommendationQuestion) => {
  question.value = { ...value, isResult: 'isResult' in value ? value.isResult : false } as RecommendationQuestion
}
/**
 * Selects the sole deciding question and configures its canonical outcomes.
 * @param value Updated question or decision selection.
 */
const setDecidingQuestion = (value: boolean) => {
  if (question.value.type !== 'radio') return
  question.value.isResult = value
  question.value.options.forEach((option, index) => {
    if (value) option.outcome = option.outcome ?? (index === 0 ? 'recommended' : 'not_recommended')
    else delete option.outcome
  })
  if (value) emit('decidingSelected', question.value.key)
}
/** Supplies the default Recommendation outcome for a newly authored deciding option. */
const configureAddedOption = () => {
  if (question.value.type === 'radio' && question.value.isResult) {
    const option = question.value.options[question.value.options.length - 1]
    if (option) option.outcome = 'recommended'
  }
}
/**
 * Resolves Recommendation's canonical outcome for one shared radio option.
 * @param key Stable option key.
 * @returns Canonical Recommendation outcome, when configured.
 */
const getOptionOutcome = (key: string) => question.value.type === 'radio' ? question.value.options.find(option => option.key === key)?.outcome : undefined
/**
 * Updates Recommendation metadata without exposing it to shared questionnaire controls.
 * @param key Stable option key.
 * @param value Updated question or decision selection.
 */
const setOptionOutcome = (key: string, value: string | undefined) => {
  if (question.value.type !== 'radio') return
  const option = question.value.options.find(candidate => candidate.key === key)
  if (option) option.outcome = value as 'recommended' | 'not_recommended' | undefined
}
</script>

<template>
  <CommonQuestionnaireQuestionFields :model-value="question" :option-extension-active="question.type === 'radio' && question.isResult" @update:model-value="updateQuestion" @option-added="configureAddedOption">
    <template #question-extension>
      <UFormField v-if="question.type === 'radio'" :label="t('recommendation_schema.result_question')" :description="t('recommendation_schema.result_question_help')" name="isResult">
        <USwitch :model-value="question.isResult" @update:model-value="setDecidingQuestion(Boolean($event))" />
      </UFormField>
    </template>
    <template #option-extension="{ option }">
      <UFormField v-if="question.type === 'radio' && question.isResult" :label="t('recommendation_schema.canonical_outcome')" required>
        <CommonEnumSelect :model-value="getOptionOutcome(option.key)" name="recommendation_outcome" :items="outcomeOptions" class="w-full" @update:model-value="value => setOptionOutcome(option.key, value)" />
      </UFormField>
    </template>
  </CommonQuestionnaireQuestionFields>
</template>
