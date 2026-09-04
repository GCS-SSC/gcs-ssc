<script setup lang="ts">
import {
  createAssessmentSubSectionRow,
  type AssessmentSubSectionRow
} from '~/composables/useAssessmentSchemaEditorState'
import type { AssessmentAnswerPathTreeNode } from '~/utils/assessment-schema'
import { getAssessmentLocaleLabel } from '~/utils/assessment-schema'

const subSection = defineModel<AssessmentSubSectionRow>('subSection', {
  default: () => createAssessmentSubSectionRow()
})

const {
  sectionKey,
  subSectionIndex,
  displayOrder = subSectionIndex + 1,
  sectionTitle = '',
  answerPathTree
} = defineProps<{
  sectionKey: string
  subSectionIndex: number
  displayOrder?: number
  sectionTitle?: string
  answerPathTree: AssessmentAnswerPathTreeNode[]
}>()

const emit = defineEmits<{
  remove: []
}>()

const { t, locale } = useI18n()

const activeLocale = computed<'en' | 'fr'>(() => locale.value === 'fr' ? 'fr' : 'en')

const subSectionTitle = computed(() => {
  const label = getAssessmentLocaleLabel(subSection.value.label, activeLocale.value, subSection.value.name)
  return label || t('transfer_payment.assessment_subsection')
})
</script>

<template>
  <AssessmentSchemaAccordionSection :title="subSectionTitle" level="sub">
    <div class="space-y-6">
      <div class="flex justify-end">
        <UButton
          icon="i-lucide-trash"
          color="error"
          variant="ghost"
          class="cursor-default"
          :aria-label="t('transfer_payment.remove_subsection_named', {
            position: displayOrder,
            name: subSectionTitle,
            section: sectionTitle || t('transfer_payment.assessment_section')
          })"
          @click="emit('remove')" />
      </div>

      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <UFormField :label="t('common.order')" :name="`sections.${sectionKey}.subSections.${subSectionIndex}.number`">
          <UInput v-model="subSection.number" />
        </UFormField>

        <UFormField :label="t('transfer_payment.language_independent_code')" :name="`sections.${sectionKey}.subSections.${subSectionIndex}.name`">
          <UInput v-model="subSection.name" />
        </UFormField>
      </div>

      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <UFormField :label="t('transfer_payment.name_en')" :name="`sections.${sectionKey}.subSections.${subSectionIndex}.label.en`">
          <UInput v-model="subSection.label.en" />
        </UFormField>

        <UFormField :label="t('transfer_payment.name_fr')" :name="`sections.${sectionKey}.subSections.${subSectionIndex}.label.fr`">
          <UInput v-model="subSection.label.fr" />
        </UFormField>
      </div>

      <AssessmentSchemaWeightSummaryField
        v-model="subSection.weight"
        :answer-path-tree="answerPathTree"
        :name-prefix="`sections.${sectionKey}.subSections.${subSectionIndex}`" />

      <AssessmentSchemaDependencyTableField
        v-model="subSection.depends"
        :answer-path-tree="answerPathTree" />

      <AssessmentSchemaAccordionSection :title="t('transfer_payment.assessment_questions')" level="sub">
        <AssessmentSchemaItemsTable v-model:items="subSection.questions" :answer-path-tree="answerPathTree" />
      </AssessmentSchemaAccordionSection>
    </div>
  </AssessmentSchemaAccordionSection>
</template>
