<script setup lang="ts">
import { computed } from 'vue'
import type { AssessmentQuestionRow } from '~/composables/useAssessmentSchemaEditorState'
import ReviewRuntimeQuestionCard from '~/components/Review/ReviewRuntimeQuestionCard.vue'

const {
  question,
  modelValue,
  commentValue = '',
  questionNumber,
  streamId,
  assessmentSchemaId,
  sectionName,
  subSectionName,
  commentRequired = false,
  commentFieldName,
  disabled = false
} = defineProps<{
  question?: AssessmentQuestionRow | null
  modelValue?: string | null
  commentValue?: string
  questionNumber?: string
  streamId?: string
  assessmentSchemaId?: string
  sectionName?: string
  subSectionName?: string
  commentRequired?: boolean
  commentFieldName?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
  'update:commentValue': [value: string]
}>()

const { locale, t } = useI18n()
const { getBilingualValue } = useBilingualValue()
const sanitizeTestIdSegment = (value: string | null | undefined) => value
  ? value.trim().replace(/[^A-Za-z0-9_-]/g, '-')
  : ''
const questionLabel = computed(() => getBilingualValue({
  question_en: question?.question.en ?? '',
  question_fr: question?.question.fr ?? ''
}, 'question'))
const options = computed(() => (question?.options ?? []).map(option => ({
  label: getBilingualValue({ label_en: option.label.en, label_fr: option.label.fr }, 'label'),
  description: getBilingualValue({
    description_en: option.description.en,
    description_fr: option.description.fr
  }, 'description'),
  value: String(option.value)
})))
const helpItems = computed(() => (question?.help ?? []).map(helpItem => ({
  label: getBilingualValue({ label_en: helpItem.title.en, label_fr: helpItem.title.fr }, 'label'),
  content: getBilingualValue({
    content_en: helpItem.description.en,
    content_fr: helpItem.description.fr
  }, 'content'),
  value: helpItem._key
})))
const questionTestId = computed(() => {
  const questionName = sanitizeTestIdSegment(question?.name)
  return questionName ? `assessment-question-card:${questionName}` : undefined
})
const extensionContext = computed(() => ({
  textarea: {
    kind: 'assessment.questionComment',
    locale: locale.value,
    label: questionLabel.value,
    text: commentValue,
    assessmentSchemaId,
    sectionName,
    subSectionName,
    questionName: question?.name,
    questionLabel: questionLabel.value
  }
}))
</script>

<template>
  <ReviewRuntimeQuestionCard
    :question-label="questionLabel"
    :question-number="questionNumber"
    question-required
    :options="options"
    :help-items="helpItems"
    :model-value="modelValue"
    :comment-value="commentValue"
    :comment-required="commentRequired"
    :comment-field-name="commentFieldName"
    :comment-label="t('admin_common.fields.egcs_cn_comments')"
    :test-id="questionTestId"
    :disabled="disabled"
    :stream-id="streamId"
    extension-slot-name="textarea.after"
    :extension-context="extensionContext"
    @update:model-value="value => emit('update:modelValue', value)"
    @update:comment-value="value => emit('update:commentValue', value)" />
</template>
