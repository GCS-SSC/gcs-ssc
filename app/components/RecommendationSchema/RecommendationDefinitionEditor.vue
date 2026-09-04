<script setup lang="ts">
import { nanoid } from 'nanoid'
import { computed } from 'vue'
import type { RecommendationDefinition, RecommendationQuestion } from '~~/shared/types/schemas/recommendation/recommendation'
import { getAssessmentLocaleLabel } from '~/utils/assessment-schema'

const definition = defineModel<RecommendationDefinition>({ required: true })
const { t, locale } = useI18n()
const activeLocale = computed<'en' | 'fr'>(() => locale.value === 'fr' ? 'fr' : 'en')
const getNavigationLabel = (label: { en?: string; fr?: string }, fallback: string) => getAssessmentLocaleLabel(label, activeLocale.value, fallback)

/**
 * Ensures that only the selected radio question decides the recommendation outcome.
 * @param questionKey Stable key of the selected deciding question.
 */
const selectDecidingQuestion = (questionKey: string) => {
  for (let sectionIndex = 0; sectionIndex < definition.value.sections.length; sectionIndex++) {
    const section = definition.value.sections[sectionIndex]!
    for (let subSectionIndex = 0; subSectionIndex < section.subSections.length; subSectionIndex++) {
      const subSection = section.subSections[subSectionIndex]!
      for (let questionIndex = 0; questionIndex < subSection.questions.length; questionIndex++) {
        const question = subSection.questions[questionIndex]!
        if (question.key === questionKey || question.type !== 'radio') continue
        question.isResult = false
        for (const option of question.options) {
          delete option.outcome
        }
      }
    }
  }
}

/**
 * Adds a bilingual section with a stable language-independent key.
 */
const addSection = () => {
  definition.value.sections.push({
    key: `section-${nanoid(6)}`,
    label: { en: t('recommendation_schema.new_section_en'), fr: t('recommendation_schema.new_section_fr') },
    subSections: []
  })
}
/**
 * Adds a bilingual subsection to the selected section.
 * @param sectionIndex Selected section index.
 */
const addSubSection = (sectionIndex: number) => {
  definition.value.sections[sectionIndex]?.subSections.push({
    key: `subsection-${nanoid(6)}`,
    label: { en: t('recommendation_schema.new_subsection_en'), fr: t('recommendation_schema.new_subsection_fr') },
    questions: []
  })
}
/**
 * Adds a radio question, matching the default assessment-style response pattern.
 * @param sectionIndex Selected section index.
 * @param subSectionIndex Selected subsection index.
 */
const addQuestion = (sectionIndex: number, subSectionIndex: number) => {
  const question: RecommendationQuestion = {
    key: `question-${nanoid(6)}`,
    type: 'radio',
    question: { en: t('recommendation_schema.new_question_en'), fr: t('recommendation_schema.new_question_fr') },
    required: true,
    isResult: false,
    options: [
      { key: `option-${nanoid(6)}`, label: { en: t('recommendation_schema.new_option_en'), fr: t('recommendation_schema.new_option_fr') } },
      { key: `option-${nanoid(6)}`, label: { en: t('recommendation_schema.new_option_en'), fr: t('recommendation_schema.new_option_fr') } }
    ]
  }
  definition.value.sections[sectionIndex]?.subSections[subSectionIndex]?.questions.push(question)
}
</script>

<template>
  <div v-if="definition" class="space-y-5">
    <div class="flex items-center justify-between border-default border-b pb-3">
      <h3 class="font-semibold text-highlighted">
        {{ t('recommendation_schema.form_sections') }}
      </h3>
      <UButton icon="i-lucide-plus" variant="outline" :label="t('recommendation_schema.add_section')" class="cursor-default" @click="addSection" />
    </div>

    <AssessmentSchemaAccordionSection
      v-for="(section, sectionIndex) in definition.sections"
      :key="section.key"
      :persistence-key="`recommendation:${section.key}`"
      :title="getNavigationLabel(section.label, section.key)">
      <div class="space-y-5">
        <div class="grid gap-4 md:grid-cols-2">
          <UFormField :label="t('transfer_payment.name_en')">
            <UInput v-model="section.label.en" class="w-full" />
          </UFormField>
          <UFormField :label="t('transfer_payment.name_fr')">
            <UInput v-model="section.label.fr" class="w-full" />
          </UFormField>
        </div>
        <div class="flex justify-end gap-2">
          <UButton icon="i-lucide-plus" variant="outline" :label="t('recommendation_schema.add_subsection')" class="cursor-default" @click="addSubSection(sectionIndex)" />
          <UButton icon="i-lucide-trash" color="error" variant="ghost" :aria-label="t('recommendation_schema.remove_section')" class="cursor-default" @click="definition.sections.splice(sectionIndex, 1)" />
        </div>

        <AssessmentSchemaAccordionSection
          v-for="(subSection, subSectionIndex) in section.subSections"
          :key="subSection.key"
          :persistence-key="`recommendation:${section.key}:${subSection.key}`"
          :title="getNavigationLabel(subSection.label, subSection.key)"
          level="sub">
          <div class="space-y-5">
            <div class="grid gap-4 md:grid-cols-2">
              <UFormField :label="t('transfer_payment.name_en')">
                <UInput v-model="subSection.label.en" class="w-full" />
              </UFormField>
              <UFormField :label="t('transfer_payment.name_fr')">
                <UInput v-model="subSection.label.fr" class="w-full" />
              </UFormField>
            </div>
            <div class="flex justify-end gap-2">
              <UButton icon="i-lucide-plus" variant="outline" :label="t('recommendation_schema.add_question')" class="cursor-default" @click="addQuestion(sectionIndex, subSectionIndex)" />
              <UButton icon="i-lucide-trash" color="error" variant="ghost" :aria-label="t('recommendation_schema.remove_subsection')" class="cursor-default" @click="section.subSections.splice(subSectionIndex, 1)" />
            </div>
            <AssessmentSchemaAccordionSection
              v-for="(question, questionIndex) in subSection.questions"
              :key="question.key"
              :persistence-key="`recommendation:${section.key}:${subSection.key}:${question.key}`"
              :title="getNavigationLabel(question.question, question.key)"
              level="sub">
              <RecommendationSchemaRecommendationQuestionFields
                v-model="subSection.questions[questionIndex]!"
                @deciding-selected="selectDecidingQuestion" />
              <div class="mt-4 flex justify-end">
                <UButton icon="i-lucide-trash" color="error" variant="ghost" :label="t('recommendation_schema.remove_question')" class="cursor-default" @click="subSection.questions.splice(questionIndex, 1)" />
              </div>
            </AssessmentSchemaAccordionSection>
          </div>
        </AssessmentSchemaAccordionSection>
      </div>
    </AssessmentSchemaAccordionSection>
  </div>
</template>
