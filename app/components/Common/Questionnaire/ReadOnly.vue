<script setup lang="ts">
import { computed } from 'vue'
import type { QuestionnaireDefinition, QuestionnaireQuestion, QuestionnaireResponse } from '~~/shared/types/schemas/questionnaire'

const { definition, responses } = defineProps<{
  definition: QuestionnaireDefinition
  responses: QuestionnaireResponse[]
}>()
const { locale, t } = useI18n()
const responsesByQuestion = computed(() => new Map(responses.map(response => [response.questionKey, response])))

/**
 * Selects a label from the immutable questionnaire in the current interface language.
 * @param value Stored bilingual content.
 * @param value.en English content.
 * @param value.fr French content.
 * @returns Localized content.
 */
const localized = (value: { en: string, fr: string }): string => locale.value === 'fr' ? value.fr : value.en

/**
 * Resolves an answer using only the question's pinned options and saved response.
 * @param question Pinned questionnaire question.
 * @returns Verbatim text, the localized selected option, or an explicit empty value.
 */
const answerFor = (question: QuestionnaireQuestion): string => {
  const value = responsesByQuestion.value.get(question.key)?.value
  if (value === undefined || value === '') return t('supplementary_information.no_answer')
  if (question.type === 'text') return value
  const option = question.options.find(candidate => candidate.key === value)
  return option ? localized(option.label) : value
}

/**
 * Gets supporting content for the selected pinned radio option.
 * @param question Pinned questionnaire question.
 * @returns The selected option's localized description, when present.
 */
const selectedOptionDescription = (question: QuestionnaireQuestion): string => {
  if (question.type !== 'radio') return ''
  const value = responsesByQuestion.value.get(question.key)?.value
  const description = question.options.find(option => option.key === value)?.description
  return description ? localized(description) : ''
}
</script>

<template>
  <div class="space-y-8">
    <section v-for="section in definition.sections" :key="section.key" class="space-y-5">
      <h4 class="text-base font-semibold text-highlighted">
        {{ localized(section.label) }}
      </h4>
      <section v-for="subSection in section.subSections" :key="subSection.key" class="space-y-3">
        <h5 class="text-sm font-semibold text-muted">
          {{ localized(subSection.label) }}
        </h5>
        <dl class="divide-y divide-default">
          <div v-for="question in subSection.questions" :key="question.key" class="space-y-2 py-4 first:pt-0">
            <dt class="text-sm font-medium text-highlighted">
              {{ localized(question.question) }}
            </dt>
            <dd class="space-y-2 text-sm">
              <p v-if="question.type === 'text' && question.description" class="text-muted">
                {{ localized(question.description) }}
              </p>
              <p class="whitespace-pre-wrap break-words text-default" data-testid="supplementary-answer">
                {{ answerFor(question) }}
              </p>
              <p v-if="selectedOptionDescription(question)" class="text-muted">
                {{ selectedOptionDescription(question) }}
              </p>
              <div v-if="responsesByQuestion.get(question.key)?.comment" class="border-l-2 border-default pl-3">
                <p class="text-xs font-medium text-muted">
                  {{ t('admin_common.fields.egcs_cn_comments') }}
                </p>
                <p class="whitespace-pre-wrap break-words text-default" data-testid="supplementary-comment">
                  {{ responsesByQuestion.get(question.key)?.comment }}
                </p>
              </div>
              <details v-if="question.help?.length" class="text-muted">
                <summary class="cursor-pointer">
                  {{ t('supplementary_information.question_guidance') }}
                </summary>
                <div v-for="help in question.help" :key="help.key" class="mt-2 space-y-1">
                  <p class="font-medium">
                    {{ localized(help.title) }}
                  </p>
                  <p class="whitespace-pre-wrap break-words">
                    {{ localized(help.description) }}
                  </p>
                </div>
              </details>
            </dd>
          </div>
        </dl>
      </section>
    </section>
  </div>
</template>
