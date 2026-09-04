<script setup lang="ts">
import { ref } from 'vue'
import type { Ref } from 'vue'
import type { AssessmentDefinitionEditorState } from '~/composables/useAssessmentSchemaEditorState'
import { normalizeAssessmentDefinitionEditorState } from '~/composables/useAssessmentSchemaEditorState'

const state = defineModel<AssessmentDefinitionEditorState>({
  default: () => normalizeAssessmentDefinitionEditorState({})
})

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
  <AssessmentSchemaMitigationsTable ref="tableRef" v-model:outcomes="state.outcomes" />
</template>
