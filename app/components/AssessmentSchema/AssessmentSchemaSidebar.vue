<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- locale-aware label callbacks are local and self-describing */
import type { AssessmentDefinitionEditorState } from '~/composables/useAssessmentSchemaEditorState'
import { normalizeAssessmentDefinitionEditorState } from '~/composables/useAssessmentSchemaEditorState'
import { useAssessmentSchemaHelperDefinitions } from '~/composables/useAssessmentSchemaHelpers'
import {
  buildAssessmentWeightSummary,
  collectAssessmentDependencyLabels,
  getAssessmentLocaleLabel
} from '~/utils/assessment-schema'

const props = defineProps<{
  state?: AssessmentDefinitionEditorState
}>()

const state = computed<AssessmentDefinitionEditorState>(() => props.state ?? normalizeAssessmentDefinitionEditorState({}))

const { t, locale } = useI18n()
const helperDefinitions = useAssessmentSchemaHelperDefinitions()

/** Builds locale-aware dependency summaries from the active editor definition. */
const dependencyLabels = computed(() => collectAssessmentDependencyLabels(state.value, {
  helpersLabel: t('transfer_payment.helpers_dependency'),
  answersLabel: t('transfer_payment.answers_dependency'),
  resolveHelperLabel: field => {
    const definition = helperDefinitions.value.find(item => item.field === field)
    return definition ? t(definition.labelKey) : field
  },
  resolveAnswerLabel: (sectionName, subsectionName, questionName) => {
    const section = state.value.sections.find(item => item.name === sectionName)
    const subsection = section?.subSections.find(item => item.name === subsectionName)
    const question = subsection?.questions.find(item => item.name === questionName)
    const activeLocale = locale.value === 'fr' ? 'fr' : 'en'
    return [
      getAssessmentLocaleLabel(section?.label, activeLocale, sectionName),
      getAssessmentLocaleLabel(subsection?.label, activeLocale, subsectionName),
      getAssessmentLocaleLabel(question?.question, activeLocale, questionName)
    ]
  }
}))
const weightSummary = computed(() => buildAssessmentWeightSummary(state.value))
</script>

<template>
  <aside class="space-y-6 xl:sticky xl:top-6">
    <section class="space-y-4 border-default border-t pt-4">
      <CommonPageSectionHeader :title="t('transfer_payment.dependency_assignment')" badge="A" variant="ghost" />

      <div v-if="dependencyLabels.length" class="space-y-3">
        <div
          v-for="label in dependencyLabels"
          :key="label"
          class="border-default border-t pt-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {{ label }}
        </div>
      </div>

      <p v-else class="text-sm text-zinc-500 dark:text-zinc-400">
        {{ t('transfer_payment.no_dependencies') }}
      </p>
    </section>

    <section class="space-y-4 border-default border-t pt-4">
      <CommonPageSectionHeader :title="t('transfer_payment.weight_totals')" badge="B" variant="ghost" />

      <div class="space-y-4">
        <div
          v-for="section in weightSummary.sections"
          :key="section.key"
          class="border-default border-t pt-4">
          <div class="font-semibold text-zinc-900 dark:text-white">
            {{ section.indexLabel }} {{ section.label }}
          </div>
          <div class="text-sm text-zinc-500 dark:text-zinc-400">
            {{ t('common.weight') }}: {{ section.weight }}
          </div>

          <div class="mt-3 space-y-3">
            <div v-for="subSection in section.subSections" :key="subSection.key" class="pl-4">
              <div class="font-medium text-zinc-800 dark:text-zinc-200">
                {{ subSection.label }}
              </div>
              <div v-if="subSection.weight !== null" class="text-sm text-zinc-500 dark:text-zinc-400">
                {{ t('common.weight') }}: {{ subSection.weight }}
              </div>

              <div class="mt-2 space-y-2 pl-4 text-sm text-zinc-600 dark:text-zinc-400">
                <div v-for="item in subSection.items" :key="item.key">
                  {{ item.label }}
                  <span v-if="item.weight !== null">: {{ item.weight }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="border-default space-y-2 border-t pt-4 text-sm text-zinc-700 dark:text-zinc-300">
          <div>{{ t('transfer_payment.total_section_weight') }}: {{ weightSummary.sectionWeightTotal.toFixed(2) }}</div>
          <div>{{ t('transfer_payment.total_impactor_weight') }}: {{ weightSummary.impactorWeightTotal.toFixed(2) }}</div>
        </div>
      </div>
    </section>
  </aside>
</template>
