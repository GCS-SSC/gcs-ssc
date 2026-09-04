<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc */
import type {
  AssessmentCalculationRow,
  AssessmentItemRow,
  AssessmentOptionRow,
  AssessmentQuestionRow
} from '~/composables/useAssessmentSchemaEditorState'
import {
  createAssessmentOptionRow,
  createAssessmentQuestionRow
} from '~/composables/useAssessmentSchemaEditorState'
import type { AssessmentAnswerPathTreeNode } from '~/utils/assessment-schema'
import { getAssessmentLocaleLabel } from '~/utils/assessment-schema'

const item = defineModel<AssessmentItemRow>('item', {
  default: () => createAssessmentQuestionRow()
})

const {
  answerPathTree
} = defineProps<{
  answerPathTree: AssessmentAnswerPathTreeNode[]
}>()

const { t, locale } = useI18n()
const activeLocale = computed<'en' | 'fr'>(() => locale.value === 'fr' ? 'fr' : 'en')

const assistanceItems = computed(() => [
  { value: 'fundingHistory', label: t('transfer_payment.funding_history') }
])

const asQuestion = computed<AssessmentQuestionRow | null>(() => item.value.type === 'question' ? item.value : null)
const asCalculation = computed<AssessmentCalculationRow | null>(() => item.value.type === 'calculation' ? item.value : null)

const addOption = () => {
  if (item.value.type !== 'question') {
    return
  }

  item.value.options.push(createAssessmentOptionRow())
}

const removeOption = (optionIndex: number) => {
  if (item.value.type !== 'question') {
    return
  }

  item.value.options.splice(optionIndex, 1)
}

const getOptionKey = (option: AssessmentOptionRow) => option._key
const getOptionName = (option: AssessmentOptionRow) => getAssessmentLocaleLabel(
  option.label,
  activeLocale.value,
  String(option.value)
) || t('common.none')
</script>

<template>
  <div class="space-y-6">
    <AssessmentSchemaAccordionSection :title="t('agency.tabs.general')" :default-open="true">
      <div class="space-y-6">
        <UFormField :label="t('transfer_payment.language_independent_code')" name="item.name">
          <UInput v-model="item.name" />
        </UFormField>

        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <UFormField :label="t('transfer_payment.name_en')" name="item.question.en">
            <UInput v-model="item.question.en" />
          </UFormField>

          <UFormField :label="t('transfer_payment.name_fr')" name="item.question.fr">
            <UInput v-model="item.question.fr" />
          </UFormField>
        </div>

        <UFormField :label="t('common.weight')" name="item.weight">
          <AssessmentSchemaWeightEditor v-model="item.weight" :answer-path-tree="answerPathTree" />
        </UFormField>

        <UFormField :label="t('transfer_payment.dependencies')" name="item.depends">
          <AssessmentSchemaDependencyEditor v-model="item.depends" :answer-path-tree="answerPathTree" />
        </UFormField>

        <div v-if="asQuestion" class="space-y-4">
          <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
            <UFormField :label="t('common.min')" name="item.commentThreshold.min">
              <UInput v-model.number="asQuestion.commentThreshold.min" type="number" />
            </UFormField>

            <UFormField :label="t('common.max')" name="item.commentThreshold.max">
              <UInput v-model.number="asQuestion.commentThreshold.max" type="number" />
            </UFormField>

            <UFormField :label="t('transfer_payment.assistance')" name="item.assistance">
              <USelect
                v-model="asQuestion.assistance"
                :items="assistanceItems"
                value-key="value"
                label-key="label" />
            </UFormField>
          </div>
        </div>

        <UFormField v-if="asCalculation" :label="t('transfer_payment.formula')" name="item.formula">
          <AssessmentSchemaCalculationNode v-model="asCalculation.formula" :answer-path-tree="answerPathTree" />
        </UFormField>
      </div>
    </AssessmentSchemaAccordionSection>

    <div v-if="asQuestion" class="space-y-4">
      <AssessmentSchemaAccordionSection :title="t('transfer_payment.options')">
        <div class="space-y-4">
          <div class="flex justify-end">
            <UButton
              icon="i-lucide-plus"
              :label="t('common.add')"
              variant="outline"
              class="cursor-default"
              @click="addOption" />
          </div>

          <div
            v-for="(option, optionIndex) in asQuestion.options"
            :key="getOptionKey(option)"
            class="border-default space-y-4 border-t pt-4">
            <div class="grid grid-cols-1 gap-4 xl:grid-cols-[140px_minmax(0,1fr)_minmax(0,1fr)_auto]">
              <UFormField :label="t('common.value')" :name="`item.options.${optionIndex}.value`">
                <UInput v-model.number="option.value" type="number" />
              </UFormField>

              <UFormField :label="t('transfer_payment.name_en')" :name="`item.options.${optionIndex}.label.en`">
                <UInput v-model="option.label.en" />
              </UFormField>

              <UFormField :label="t('transfer_payment.name_fr')" :name="`item.options.${optionIndex}.label.fr`">
                <UInput v-model="option.label.fr" />
              </UFormField>

              <div class="flex items-end xl:pb-1.5">
                <UButton
                  icon="i-lucide-trash"
                  color="error"
                  variant="ghost"
                  class="cursor-default"
                  :aria-label="t('transfer_payment.remove_option_named', { position: optionIndex + 1, name: getOptionName(option) })"
                  @click="removeOption(optionIndex)" />
              </div>
            </div>

            <UFormField :label="t('transfer_payment.description_en')" :name="`item.options.${optionIndex}.description.en`">
              <CommonTextarea v-model="option.description.en" :rows="3" />
            </UFormField>

            <UFormField :label="t('transfer_payment.description_fr')" :name="`item.options.${optionIndex}.description.fr`">
              <CommonTextarea v-model="option.description.fr" :rows="3" />
            </UFormField>
          </div>
        </div>
      </AssessmentSchemaAccordionSection>
    </div>

    <ReviewSchemaHelpEditor v-model="item.help" />
  </div>
</template>
