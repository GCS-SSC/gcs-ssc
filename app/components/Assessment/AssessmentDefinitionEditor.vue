<!-- eslint-disable jsdoc/require-jsdoc -- component-local callbacks are self-descriptive -->
<script setup lang="ts">
import type { AssessmentDefinitionEditorState } from '~/composables/useAssessmentSchemaEditorState'

const state = defineModel<AssessmentDefinitionEditorState>({
  required: true,
  default: () => ({
    sectionMatrix: [],
    outcomes: [],
    impactors: [],
    sections: []
  })
})
</script>

<template>
  <div class="space-y-10">
    <AssessmentSchemaMatrices v-model="state" />
    <AssessmentSchemaSectionsEditor v-model="state" />
    <AssessmentSchemaMitigationsEditor v-model="state" />
    <AssessmentSchemaImpactorsEditor v-model="state" />
  </div>
</template>
