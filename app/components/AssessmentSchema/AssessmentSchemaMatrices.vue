<script setup lang="ts">
import type {
  AssessmentBandRow,
  AssessmentDefinitionEditorState
} from '~/composables/useAssessmentSchemaEditorState'
import {
  normalizeAssessmentDefinitionEditorState
} from '~/composables/useAssessmentSchemaEditorState'

const state = defineModel<AssessmentDefinitionEditorState>({
  default: () => normalizeAssessmentDefinitionEditorState({})
})
const overallScoringMatrix = defineModel<AssessmentBandRow[]>('overallScoringMatrix', {
  default: () => []
})

const { t } = useI18n()
</script>

<template>
  <AssessmentSchemaPageSection section-id="schema-matrices" :title="t('transfer_payment.scoring_matrix_record')">
    <div class="space-y-2">
      <AssessmentSchemaAccordionSection :title="t('transfer_payment.overall_scoring_matrix')">
        <AssessmentScoringBandArrayEditor
          v-model="overallScoringMatrix"
          field-path="scoringMatrix"
          :title="t('transfer_payment.assessment_scoring_matrix')" />
      </AssessmentSchemaAccordionSection>

      <AssessmentSchemaAccordionSection :title="t('transfer_payment.section_scoring_matrix')">
        <AssessmentScoringBandArrayEditor
          v-model="state.sectionMatrix"
          field-path="assessmentSchema.sectionMatrix"
          :title="t('transfer_payment.assessment_section_matrix')" />
      </AssessmentSchemaAccordionSection>
    </div>
  </AssessmentSchemaPageSection>
</template>
