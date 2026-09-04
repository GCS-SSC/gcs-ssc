<script setup lang="ts">
import { computed } from 'vue'
import type { ChecklistAnswerValue } from '~/composables/useChecklistDetailPage'
import { DEFAULT_CHECKLIST_OPTIONS } from '~~/shared/types/schemas/checklist/checklist'
import type { ChecklistQuestion } from '~~/shared/types/schemas/checklist/checklist'
import ReviewRuntimeQuestionCard from '~/components/Review/ReviewRuntimeQuestionCard.vue'

const {
  question = {
    key: '',
    question: { en: '', fr: '' },
    help: [],
    options: DEFAULT_CHECKLIST_OPTIONS.map(option => ({ value: option.value, description: { ...option.description } })),
    required: false,
    commentPolicy: 'optional'
  },
  number = '',
  modelValue = null,
  commentValue = '',
  disabled = false
} = defineProps<{
  question?: ChecklistQuestion
  number?: string
  modelValue?: ChecklistAnswerValue
  commentValue?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ChecklistAnswerValue]
  'update:commentValue': [value: string]
}>()

const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()
const questionLabel = computed(() => getBilingualValue({
  question_en: question.question.en,
  question_fr: question.question.fr
}, 'question'))
const helpItems = computed(() => question.help.map((helpItem, helpIndex) => ({
  label: getBilingualValue({ label_en: helpItem.title.en, label_fr: helpItem.title.fr }, 'label'),
  content: getBilingualValue({ content_en: helpItem.description.en, content_fr: helpItem.description.fr }, 'content'),
  value: `${question.key}-help-${helpIndex}`
})))
const commentRequired = computed(() => question.commentPolicy === 'required'
  || (question.commentPolicy === 'required_on_fail' && modelValue === 'fail'))
const options = computed(() => question.options.map(option => ({
  label: t(`checklist.answer.${option.value}`),
  description: getBilingualValue({
    description_en: option.description.en,
    description_fr: option.description.fr
  }, 'description'),
  value: option.value
})))
const handleAnswer = (value: string | null) => {
  emit('update:modelValue', value === 'pass' || value === 'fail' ? value : null)
}
</script>

<template>
  <ReviewRuntimeQuestionCard
    :question-label="questionLabel"
    :question-number="number"
    :question-required="question.required"
    :options="options"
    :help-items="helpItems"
    :model-value="modelValue"
    :comment-value="commentValue"
    :comment-required="commentRequired"
    :comment-label="t('admin_common.fields.egcs_cn_comments')"
    :comment-placeholder="t('checklist.comment_placeholder')"
    :test-id="`checklist-question:${question.key}`"
    :disabled="disabled"
    :comment-disabled="modelValue === null"
    @update:model-value="handleAnswer"
    @update:comment-value="value => emit('update:commentValue', value)" />
</template>
