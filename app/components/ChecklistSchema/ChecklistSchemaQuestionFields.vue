<script setup lang="ts">
import { computed } from 'vue'
import type { ChecklistEditorQuestion } from '~/types/checklist-schema-editor'
import { CHECKLIST_COMMENT_POLICIES } from '~~/shared/types/schemas/checklist/checklist'

const question = defineModel<ChecklistEditorQuestion>('question', { required: true })

const { t } = useI18n()
const allowsNotApplicable = computed(() => question.value.options.some(option => option.value === 'not_applicable'))
/**
 * Updates the offered answers and removes comment requirements for unavailable answers.
 * @param enabled Whether the question offers N/A.
 */
const setAllowsNotApplicable = (enabled: boolean | 'indeterminate') => {
  if (enabled === true && !allowsNotApplicable.value) {
    question.value.options.push({
      value: 'not_applicable',
      description: {
        en: t('checklist_schema.na_description_en'),
        fr: t('checklist_schema.na_description_fr')
      }
    })
  } else if (enabled !== true) {
    question.value.options = question.value.options.filter(option => option.value !== 'not_applicable')
    if (question.value.commentPolicy === 'required_on_not_applicable') question.value.commentPolicy = 'optional'
    if (question.value.commentPolicy === 'required_on_fail_or_not_applicable') question.value.commentPolicy = 'required_on_fail'
  }
}
const commentPolicyOptions = computed(() => CHECKLIST_COMMENT_POLICIES.filter(value => allowsNotApplicable.value || !value.includes('not_applicable')).map(value => ({
  label: t(`checklist_schema.comment_policies.${value}`),
  value
})))
</script>

<template>
  <div v-if="question" class="space-y-6">
    <AssessmentSchemaAccordionSection :title="t('checklist_schema.question_details')">
      <div class="space-y-4">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <UFormField :label="t('checklist_schema.language_independent_code')" name="key" required>
            <UInput v-model="question.key" class="font-mono" />
          </UFormField>
          <UFormField :label="t('checklist_schema.comment_policy')" name="commentPolicy" required>
            <CommonEnumSelect v-model="question.commentPolicy" name="review_type" :items="commentPolicyOptions" class="w-full" />
          </UFormField>
        </div>

        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <UFormField :label="t('checklist_schema.question_en')" name="question.en" required>
            <CommonTextarea v-model="question.question.en" :rows="3" />
          </UFormField>
          <UFormField :label="t('checklist_schema.question_fr')" name="question.fr" required>
            <CommonTextarea v-model="question.question.fr" :rows="3" />
          </UFormField>
        </div>

        <UCheckbox :model-value="allowsNotApplicable" :label="t('checklist_schema.allow_na')" @update:model-value="setAllowsNotApplicable" />
        <UCheckbox v-model="question.required" :label="t('checklist_schema.required_question')" />
      </div>
    </AssessmentSchemaAccordionSection>

    <AssessmentSchemaAccordionSection :title="t('checklist_schema.answer_options')">
      <div class="space-y-6">
        <div
          v-for="(option, optionIndex) in question.options"
          :key="option.value"
          class="border-default space-y-4 border-t pt-4 first:border-t-0 first:pt-0">
          <div class="text-sm font-semibold text-zinc-900 dark:text-white">
            {{ t(`checklist.answer.${option.value}`) }}
          </div>
          <UFormField :label="t('transfer_payment.description_en')" :name="`options.${optionIndex}.description.en`" required>
            <CommonTextarea v-model="option.description.en" :rows="3" />
          </UFormField>
          <UFormField :label="t('transfer_payment.description_fr')" :name="`options.${optionIndex}.description.fr`" required>
            <CommonTextarea v-model="option.description.fr" :rows="3" />
          </UFormField>
        </div>
      </div>
    </AssessmentSchemaAccordionSection>

    <ReviewSchemaHelpEditor v-model="question.help" />
  </div>
</template>
