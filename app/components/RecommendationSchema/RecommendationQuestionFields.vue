<script setup lang="ts">
import { computed } from 'vue'
import { nanoid } from 'nanoid'
import type { RecommendationQuestion } from '~~/shared/types/schemas/recommendation/recommendation'

const question = defineModel<RecommendationQuestion>({ required: true })
const emit = defineEmits<{ decidingSelected: [questionKey: string] }>()
const { t } = useI18n()
const typeOptions = computed(() => [
  { value: 'radio', label: t('recommendation_schema.question_types.radio') },
  { value: 'text', label: t('recommendation_schema.question_types.text') }
])
const outcomeOptions = computed(() => [
  { value: 'recommended', label: t('recommendation.outcomes.recommended') },
  { value: 'not_recommended', label: t('recommendation.outcomes.not_recommended') }
])
/**
 * Changes the question type while preserving its shared identity and bilingual prompt.
 * @param value Selected question type.
 */
const setType = (value: string) => {
  const base = {
    key: question.value.key,
    question: { ...question.value.question },
    required: question.value.required,
    isResult: value === 'radio' && question.value.isResult,
    help: question.value.help ? structuredClone(question.value.help) : undefined
  }
  question.value = value === 'text'
    ? { ...base, type: 'text', maxLength: 1000 }
    : { ...base, type: 'radio', options: [
        { key: `option-${nanoid(6)}`, label: { en: t('recommendation_schema.new_option_en'), fr: t('recommendation_schema.new_option_fr') } },
        { key: `option-${nanoid(6)}`, label: { en: t('recommendation_schema.new_option_en'), fr: t('recommendation_schema.new_option_fr') } }
      ] }
}
/**
 * Toggles this radio question as the schema's sole deciding question.
 * @param value Whether this question determines the recommendation outcome.
 */
const setDecidingQuestion = (value: boolean) => {
  if (question.value.type !== 'radio') return
  question.value.isResult = value
  question.value.options.forEach((option, index) => {
    if (value) {
      option.outcome = option.outcome ?? (index === 0 ? 'recommended' : 'not_recommended')
    } else {
      delete option.outcome
    }
  })
  if (value) emit('decidingSelected', question.value.key)
}
/** Adds a stable radio option outside the template render path. */
const addOption = () => {
  if (question.value.type !== 'radio') return
  question.value.options.push({
    key: `option-${nanoid(6)}`,
    label: { en: t('recommendation_schema.new_option_en'), fr: t('recommendation_schema.new_option_fr') },
    ...(question.value.isResult ? { outcome: 'recommended' as const } : {})
  })
}
/** Adds a bilingual guidance item with a stable editor key. */
const addHelp = () => {
  if (!question.value.help) question.value.help = []
  question.value.help.push({
    key: `help-${nanoid(6)}`,
    title: {
      en: t('recommendation_schema.new_help_title_en'),
      fr: t('recommendation_schema.new_help_title_fr')
    },
    description: {
      en: t('recommendation_schema.new_help_description_en'),
      fr: t('recommendation_schema.new_help_description_fr')
    }
  })
}
/**
 * Updates one localized subtitle and removes the optional value when both fields are empty.
 * @param language Subtitle language.
 * @param value Updated subtitle text.
 */
const updateTextDescription = (language: 'en' | 'fr', value: string) => {
  if (question.value.type !== 'text') return
  const description = question.value.description
    ? { ...question.value.description }
    : { en: '', fr: '' }
  description[language] = value
  if (description.en.length === 0 && description.fr.length === 0) {
    delete question.value.description
    return
  }
  question.value.description = description
}
</script>

<template>
  <div v-if="question" class="space-y-6">
    <div class="grid gap-4 md:grid-cols-2">
      <UFormField :label="t('recommendation_schema.question_en')">
        <CommonTextarea v-model="question.question.en" :rows="3" />
      </UFormField>
      <UFormField :label="t('recommendation_schema.question_fr')">
        <CommonTextarea v-model="question.question.fr" :rows="3" />
      </UFormField>
      <UFormField :label="t('recommendation_schema.language_independent_code')">
        <UInput v-model="question.key" class="w-full font-mono" />
      </UFormField>
      <UFormField :label="t('recommendation_schema.question_type')">
        <CommonEnumSelect
          :model-value="question.type"
          name="review_type"
          :items="typeOptions"
          class="w-full"
          @update:model-value="value => setType(String(value))" />
      </UFormField>
    </div>
    <div class="flex flex-wrap gap-6">
      <UCheckbox v-model="question.required" :label="t('recommendation_schema.required_question')" />
      <UCheckbox
        v-if="question.type === 'radio'"
        :model-value="question.isResult"
        :label="t('recommendation_schema.result_question')"
        :description="t('recommendation_schema.result_question_help')"
        @update:model-value="setDecidingQuestion(Boolean($event))" />
    </div>

    <div v-if="question.type === 'text'" class="space-y-4">
      <div class="grid gap-4 md:grid-cols-2">
        <UFormField :label="t('recommendation_schema.subtitle_en')">
          <CommonTextarea
            :model-value="question.description?.en ?? ''"
            :rows="2"
            @update:model-value="value => updateTextDescription('en', value)" />
        </UFormField>
        <UFormField :label="t('recommendation_schema.subtitle_fr')">
          <CommonTextarea
            :model-value="question.description?.fr ?? ''"
            :rows="2"
            @update:model-value="value => updateTextDescription('fr', value)" />
        </UFormField>
      </div>
      <UFormField :label="t('recommendation_schema.max_length')">
        <UInputNumber v-model="question.maxLength" :min="1" :max="10000" />
      </UFormField>
    </div>

    <div v-else class="space-y-4">
      <div class="flex items-center justify-between border-default border-b pb-3">
        <h4 class="font-semibold text-highlighted">
          {{ t('recommendation_schema.radio_options') }}
        </h4>
        <UButton icon="i-lucide-plus" variant="outline" :label="t('recommendation_schema.add_option')" class="cursor-default" @click="addOption" />
      </div>
      <div v-for="(option, optionIndex) in question.options" :key="option.key" class="grid items-end gap-3" :class="question.isResult ? 'md:grid-cols-[1fr_1fr_minmax(12rem,0.7fr)_auto]' : 'md:grid-cols-[1fr_1fr_auto]'">
        <UFormField :label="t('transfer_payment.name_en')">
          <UInput v-model="option.label.en" class="w-full" />
        </UFormField>
        <UFormField :label="t('transfer_payment.name_fr')">
          <UInput v-model="option.label.fr" class="w-full" />
        </UFormField>
        <UFormField v-if="question.isResult" :label="t('recommendation_schema.canonical_outcome')">
          <CommonEnumSelect v-model="option.outcome" name="recommendation_outcome" :items="outcomeOptions" class="w-full" />
        </UFormField>
        <UButton
          icon="i-lucide-trash"
          color="error"
          variant="ghost"
          :aria-label="t('recommendation_schema.remove_option')"
          :disabled="question.options.length <= 2"
          class="cursor-default"
          @click="question.options.splice(optionIndex, 1)" />
      </div>
    </div>

    <div class="space-y-4 border-default border-t pt-5">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h4 class="font-semibold text-highlighted">
            {{ t('recommendation_schema.question_help') }}
          </h4>
          <p class="text-sm text-muted">
            {{ t('recommendation_schema.question_help_description') }}
          </p>
        </div>
        <UButton icon="i-lucide-plus" variant="outline" :label="t('recommendation_schema.add_help')" class="cursor-default" @click="addHelp" />
      </div>
      <div v-for="(helpItem, helpIndex) in question.help" :key="helpItem.key" class="space-y-4 rounded-md border border-default p-4">
        <div class="grid gap-4 md:grid-cols-2">
          <UFormField :label="t('recommendation_schema.help_title_en')">
            <UInput v-model="helpItem.title.en" class="w-full" />
          </UFormField>
          <UFormField :label="t('recommendation_schema.help_title_fr')">
            <UInput v-model="helpItem.title.fr" class="w-full" />
          </UFormField>
          <UFormField :label="t('recommendation_schema.help_description_en')">
            <CommonTextarea v-model="helpItem.description.en" :rows="3" />
          </UFormField>
          <UFormField :label="t('recommendation_schema.help_description_fr')">
            <CommonTextarea v-model="helpItem.description.fr" :rows="3" />
          </UFormField>
        </div>
        <div class="flex justify-end">
          <UButton icon="i-lucide-trash" color="error" variant="ghost" :label="t('recommendation_schema.remove_help')" class="cursor-default" @click="question.help?.splice(helpIndex, 1)" />
        </div>
      </div>
    </div>
  </div>
</template>
