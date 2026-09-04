<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import type { AssessmentDefinitionEditorState } from '~/composables/useAssessmentSchemaEditorState'
import { normalizeAssessmentDefinitionEditorState } from '~/composables/useAssessmentSchemaEditorState'
import { createDependencyTargetAnswerPathValue } from '~/components/AssessmentSchema/assessment-schema-dependency'
import {
  buildAssessmentAnswerPathTree,
  getAssessmentLocaleLabel
} from '~/utils/assessment-schema'

const state = defineModel<AssessmentDefinitionEditorState>({
  default: () => normalizeAssessmentDefinitionEditorState({})
})

const { locale } = useI18n()
const activeLocale = computed<'en' | 'fr'>(() => locale.value === 'fr' ? 'fr' : 'en')

const answerPathTree = computed(() => buildAssessmentAnswerPathTree(state.value.sections.flatMap(section => {
  const sectionLabel = getAssessmentLocaleLabel(section.label, activeLocale.value, section.name) || section.name

  return section.subSections.flatMap(subSection => {
    const subSectionLabel = getAssessmentLocaleLabel(subSection.label, activeLocale.value, subSection.name) || subSection.name

    return subSection.questions.map(item => ({
      label: `${sectionLabel} > ${subSectionLabel} > ${getAssessmentLocaleLabel(item.question, activeLocale.value, item.name) || item.name}`,
      value: createDependencyTargetAnswerPathValue({
        type: 'answers',
        section: section.name,
        subsection: subSection.name,
        question: item.name
      })
    }))
  })
})))

/** Exposes the table create action to the page-level section header. */
const tableRef: Ref<{ openCreateEditor: () => void } | null> = ref(null)

const openCreateEditor = () => {
  tableRef.value?.openCreateEditor()
}

defineExpose({
  openCreateEditor
})
</script>

<template>
  <div class="space-y-4">
    <AssessmentSchemaImpactorsTable ref="tableRef" v-model:impactors="state.impactors" :answer-path-tree="answerPathTree" />
  </div>
</template>
