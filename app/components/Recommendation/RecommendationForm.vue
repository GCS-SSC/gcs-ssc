<script setup lang="ts">
import { computed } from 'vue'
import type { RecommendationDefinition, RecommendationResponse } from '~~/shared/types/schemas/recommendation/recommendation'
import AssessmentSchemaPageSection from '~/components/AssessmentSchema/AssessmentSchemaPageSection.vue'
import ReviewRuntimeQuestionCard from '~/components/Review/ReviewRuntimeQuestionCard.vue'

const { definition, readonly = false, issues = [] } = defineProps<{
  definition: RecommendationDefinition
  readonly?: boolean
  issues?: Array<{ questionKey: string, message: string }>
}>()
const responses = defineModel<RecommendationResponse[]>('responses', { required: true })
const { locale, t } = useI18n()

const responseValues = computed<Record<string, string>>(() => Object.fromEntries(
  responses.value.map(response => [response.questionKey, response.value])
))
const localized = (value: { en: string, fr: string }) => locale.value === 'fr' ? value.fr : value.en
const getQuestionIssue = (questionKey: string) => issues.find(issue => issue.questionKey === questionKey)
/**
 * Maps stored bilingual guidance to the shared question-card help contract.
 * @param question Recommendation question with optional guidance.
 * @returns Localized help items for the shared runtime card.
 */
const getQuestionHelp = (question: RecommendationDefinition['sections'][number]['subSections'][number]['questions'][number]) =>
  (question.help ?? []).map(helpItem => ({
    label: localized(helpItem.title),
    content: localized(helpItem.description),
    value: helpItem.key
  }))
/**
 * Adds or updates a response without replacing the reactive response array.
 * @param questionKey Stable question key.
 * @param value New answer value.
 */
const updateResponse = (questionKey: string, value: string) => {
  const existing = responses.value.find(response => response.questionKey === questionKey)
  if (existing) {
    existing.value = value
    return
  }
  responses.value.push({ questionKey, value })
}
</script>

<template>
  <div v-if="definition" class="space-y-12">
    <section v-for="(section, sectionIndex) in definition.sections" :key="section.key" class="space-y-8">
      <AssessmentSchemaPageSection
        :section-id="`recommendation-${section.key}`"
        :title="`${sectionIndex + 1}. ${localized(section.label)}`">
        <section
          v-for="(subSection, subSectionIndex) in section.subSections"
          :key="subSection.key"
          class="space-y-3"
          :class="subSectionIndex > 0 ? 'border-t border-primary-500 pt-8 dark:border-primary-600' : ''">
          <h3 class="text-base font-semibold text-highlighted">
            {{ localized(subSection.label) }}
          </h3>

          <div class="divide-y divide-zinc-200 dark:divide-zinc-800">
            <ReviewRuntimeQuestionCard
              v-for="(question, questionIndex) in subSection.questions"
              :key="question.key"
              :question-number="`${subSectionIndex + 1}.${questionIndex + 1}`"
              :question-label="localized(question.question)"
              :question-required="question.required"
              :question-description="question.type === 'text' && question.description ? localized(question.description) : undefined"
              :options="question.type === 'radio' ? question.options.map(option => ({
                label: localized(option.label),
                description: option.description ? localized(option.description) : '',
                value: option.key
              })) : []"
              :help-items="getQuestionHelp(question)"
              :model-value="responseValues[question.key]"
              :disabled="readonly"
              :comment-label="t('admin_common.fields.egcs_cn_comments')"
              :show-comment="false"
              :show-options="question.type === 'radio'"
              :error-message="getQuestionIssue(question.key) ? t(getQuestionIssue(question.key)!.message) : undefined"
              @update:model-value="value => updateResponse(question.key, String(value))">
              <template v-if="question.type === 'text'" #answer="{ labelledby }">
                <div class="space-y-2">
                  <p class="text-xs text-muted">
                    {{ t('recommendation.characters_max', { count: question.maxLength }) }}
                  </p>
                  <CommonTextarea
                    :model-value="responseValues[question.key]"
                    :maxlength="question.maxLength"
                    :readonly="readonly"
                    :rows="4"
                    :aria-labelledby="labelledby"
                    :required="question.required"
                    class="w-full"
                    @update:model-value="value => updateResponse(question.key, String(value))" />
                </div>
              </template>
            </ReviewRuntimeQuestionCard>
          </div>
        </section>
      </AssessmentSchemaPageSection>
    </section>
  </div>
</template>
