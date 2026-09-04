<script setup lang="ts">
import { computed } from 'vue'
import type { ChecklistEditorQuestion } from '~/types/checklist-schema-editor'
import { CHECKLIST_COMMENT_POLICIES } from '~~/shared/types/schemas/checklist/checklist'

const question = defineModel<ChecklistEditorQuestion>('question', { required: true })

const { t } = useI18n()
const commentPolicyOptions = computed(() => CHECKLIST_COMMENT_POLICIES.map(value => ({
  label: t(`checklist_schema.comment_policies.${value}`),
  value
})))
</script>

<template>
  <div v-if="question" class="space-y-6">
    <AssessmentSchemaAccordionSection :title="t('checklist_schema.question_details')">
      <div class="space-y-4">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <UFormField :label="t('checklist_schema.language_independent_code')">
            <UInput v-model="question.key" class="font-mono" />
          </UFormField>
          <UFormField :label="t('checklist_schema.comment_policy')">
            <CommonEnumSelect v-model="question.commentPolicy" name="review_type" :items="commentPolicyOptions" class="w-full" />
          </UFormField>
        </div>

        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <UFormField :label="t('checklist_schema.question_en')">
            <CommonTextarea v-model="question.question.en" :rows="3" />
          </UFormField>
          <UFormField :label="t('checklist_schema.question_fr')">
            <CommonTextarea v-model="question.question.fr" :rows="3" />
          </UFormField>
        </div>

        <UCheckbox v-model="question.required" :label="t('checklist_schema.required_question')" />
      </div>
    </AssessmentSchemaAccordionSection>

    <AssessmentSchemaAccordionSection :title="t('checklist_schema.answer_options')">
      <div class="space-y-6">
        <div
          v-for="option in question.options"
          :key="option.value"
          class="border-default space-y-4 border-t pt-4 first:border-t-0 first:pt-0">
          <div class="text-sm font-semibold text-zinc-900 dark:text-white">
            {{ t(`checklist.answer.${option.value}`) }}
          </div>
          <UFormField :label="t('transfer_payment.description_en')">
            <CommonTextarea v-model="option.description.en" :rows="3" />
          </UFormField>
          <UFormField :label="t('transfer_payment.description_fr')">
            <CommonTextarea v-model="option.description.fr" :rows="3" />
          </UFormField>
        </div>
      </div>
    </AssessmentSchemaAccordionSection>

    <ReviewSchemaHelpEditor v-model="question.help" />
  </div>
</template>
