<script setup lang="ts">
import { nanoid } from 'nanoid'
import type { RecommendationDefinition, RecommendationQuestion } from '~~/shared/types/schemas/recommendation/recommendation'

const definition = defineModel<RecommendationDefinition>({ required: true })
const { t } = useI18n()
/**
 * Creates a Recommendation question with its decision metadata.
 * @returns Newly authored Recommendation radio question.
 */
const questionFactory = (): RecommendationQuestion => ({
  key: `question-${nanoid(6)}`, type: 'radio', required: true, isResult: false, commentPolicy: 'none',
  question: { en: t('recommendation_schema.new_question_en'), fr: t('recommendation_schema.new_question_fr') },
  options: [0, 1].map(() => ({ key: `option-${nanoid(6)}`, label: { en: t('recommendation_schema.new_option_en'), fr: t('recommendation_schema.new_option_fr') } }))
})
/**
 * Keeps Recommendation's single deciding-question rule outside the shared questionnaire.
 * @param questionKey Stable key of the selected deciding question.
 */
const selectDecidingQuestion = (questionKey: string) => {
  for (const section of definition.value.sections) for (const subSection of section.subSections) for (const question of subSection.questions) {
    if (question.key === questionKey || question.type !== 'radio') continue
    question.isResult = false
    for (const option of question.options) delete option.outcome
  }
}
</script>

<template>
  <CommonQuestionnaireDefinitionEditor :model-value="definition" persistence-key="recommendation" :question-factory="questionFactory" @update:model-value="value => { definition = value as RecommendationDefinition }">
    <template #question-fields="{ question, updateQuestion }">
      <RecommendationSchemaRecommendationQuestionFields :model-value="question as RecommendationQuestion" @update:model-value="updateQuestion" @deciding-selected="selectDecidingQuestion" />
    </template>
  </CommonQuestionnaireDefinitionEditor>
</template>
