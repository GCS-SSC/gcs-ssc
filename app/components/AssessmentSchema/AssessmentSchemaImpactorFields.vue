<!-- eslint-disable jsdoc/require-jsdoc, jsdoc/require-param-description, jsdoc/require-returns -- component-local callbacks are self-descriptive -->
<script setup lang="ts">
import { nanoid } from 'nanoid'
import {
  createAssessmentImpactorRow,
  type AssessmentImpactorRow
} from '~/composables/useAssessmentSchemaEditorState'
import type { DependencyTarget } from '~/components/AssessmentSchema/assessment-schema-dependency'
import type { AssessmentAnswerPathTreeNode } from '~/utils/assessment-schema'
import { getAssessmentLocaleLabel } from '~/utils/assessment-schema'

const impactor = defineModel<AssessmentImpactorRow>('impactor', {
  default: () => createAssessmentImpactorRow()
})

const {
  answerPathTree = []
} = defineProps<{
  answerPathTree?: AssessmentAnswerPathTreeNode[]
}>()

const { t, locale } = useI18n()
const activeLocale = computed<'en' | 'fr'>(() => locale.value === 'fr' ? 'fr' : 'en')
const impactorName = computed(() => getAssessmentLocaleLabel(
  impactor.value.label,
  activeLocale.value,
  t('transfer_payment.impactor')
))

const addScoringRow = () => {
  impactor.value.scoringMatrix.push({
    _key: nanoid(),
    max: 0,
    value: 0
  })
}

const removeScoringRow = (rowIndex: number) => {
  impactor.value.scoringMatrix.splice(rowIndex, 1)
}
</script>

<template>
  <div class="space-y-6">
    <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
      <UFormField :label="t('common.weight')" name="impactor.weight">
        <UInput v-model.number="impactor.weight" type="number" />
      </UFormField>
      <UFormField :label="t('transfer_payment.name_en')" name="impactor.label.en">
        <UInput v-model="impactor.label.en" />
      </UFormField>
      <UFormField :label="t('transfer_payment.name_fr')" name="impactor.label.fr">
        <UInput v-model="impactor.label.fr" />
      </UFormField>
    </div>

    <AssessmentSchemaDependencyTargetField
      :model-value="impactor.on as DependencyTarget"
      :answer-path-tree="answerPathTree"
      @update:model-value="value => (impactor.on = value)" />

    <AssessmentSchemaAccordionSection :title="t('transfer_payment.thresholds')">
      <div class="space-y-4">
        <div class="flex justify-end">
          <UButton icon="i-lucide-plus" :label="t('common.add')" variant="outline" class="cursor-default" @click="addScoringRow" />
        </div>

        <div
          v-for="(scoreRow, scoreIndex) in impactor.scoringMatrix"
          :key="scoreRow._key"
          class="border-default grid grid-cols-1 gap-4 border-t pt-4 md:grid-cols-3">
          <UFormField :label="t('common.max')" :name="`impactor.scoringMatrix.${scoreIndex}.max`">
            <UInput v-model.number="scoreRow.max" type="number" />
          </UFormField>

          <UFormField :label="t('common.value')" :name="`impactor.scoringMatrix.${scoreIndex}.value`">
            <UInput v-model.number="scoreRow.value" type="number" />
          </UFormField>

          <div class="flex items-end">
            <UButton
              icon="i-lucide-trash"
              color="error"
              variant="ghost"
              class="cursor-default"
              :aria-label="t('transfer_payment.remove_threshold_named', {
                position: scoreIndex + 1,
                name: impactorName
              })"
              @click="removeScoringRow(scoreIndex)" />
          </div>
        </div>
      </div>
    </AssessmentSchemaAccordionSection>
  </div>
</template>
