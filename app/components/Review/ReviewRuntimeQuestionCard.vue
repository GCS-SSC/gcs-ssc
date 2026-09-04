<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import type { Ref } from 'vue'
import CommonTextarea from '~/components/Common/Textarea.vue'
import type { ReviewRuntimeQuestionHelpItem, ReviewRuntimeQuestionOption } from '~/types/review-runtime'
import type { GcsExtensionSlot, GcsExtensionSlotContext } from '~~/shared/utils/extensions'

const {
  questionLabel,
  questionDescription,
  questionNumber,
  questionRequired = false,
  options,
  helpItems = [],
  modelValue = null,
  commentValue = '',
  commentRequired = false,
  showComment = true,
  showOptions = true,
  errorMessage,
  commentFieldName,
  commentLabel,
  commentPlaceholder,
  testId,
  disabled = false,
  commentDisabled = false,
  streamId,
  extensionSlotName,
  extensionContext
} = defineProps<{
  questionLabel: string
  questionDescription?: string
  questionNumber?: string
  questionRequired?: boolean
  options: ReviewRuntimeQuestionOption[]
  helpItems?: ReviewRuntimeQuestionHelpItem[]
  modelValue?: string | null
  commentValue?: string
  commentRequired?: boolean
  showComment?: boolean
  showOptions?: boolean
  errorMessage?: string
  commentFieldName?: string
  commentLabel: string
  commentPlaceholder?: string
  testId?: string
  disabled?: boolean
  commentDisabled?: boolean
  streamId?: string
  extensionSlotName?: GcsExtensionSlot
  extensionContext?: GcsExtensionSlotContext
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
  'update:commentValue': [value: string]
}>()

const { t } = useI18n()
const isHelpOpen: Ref<boolean> = ref(false)
const questionHeadingId = `review-question-${useId()}`
const localModelValue = computed<string | undefined>(() => typeof modelValue === 'string' ? modelValue : undefined)
const helpButtonLabel = computed(() => t('transfer_payment.open_question_help', { question: questionLabel }))
const handleModelValueUpdate = (value: string | number | null | undefined) => {
  emit('update:modelValue', typeof value === 'string' ? value : null)
}
</script>

<template>
  <div
    class="py-6"
    :data-testid="testId">
    <div class="flex gap-4">
      <div
        v-if="questionNumber"
        class="w-14 shrink-0 pt-0.5 text-right text-sm font-semibold tabular-nums text-zinc-500 dark:text-zinc-400">
        {{ questionNumber }}
      </div>

      <div class="min-w-0 flex-1 space-y-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 space-y-1">
            <h3 :id="questionHeadingId" class="text-base font-semibold text-zinc-900 dark:text-white">
              {{ questionLabel }}
              <span v-if="questionRequired" class="text-red-600 dark:text-red-400" aria-hidden="true">*</span>
              <span v-if="questionRequired" class="sr-only">{{ t('validation.required') }}</span>
            </h3>
            <p v-if="questionDescription" class="text-sm leading-5 text-muted">
              {{ questionDescription }}
            </p>
          </div>

          <USlideover
            v-if="helpItems.length > 0"
            v-model:open="isHelpOpen"
            :title="t('transfer_payment.help')"
            :description="questionLabel"
            side="right"
            :ui="{
              content: 'sm:max-w-xl',
              body: 'space-y-4'
            }">
            <UButton
              icon="i-lucide-circle-help"
              color="primary"
              variant="solid"
              size="xs"
              class="cursor-default rounded-full shadow-sm transition-colors hover:bg-primary/90"
              :aria-label="helpButtonLabel"
              :title="helpButtonLabel"
              :ui="{ leadingIcon: 'size-4' }"
              @click="isHelpOpen = true" />

            <template #body>
              <UAccordion
                type="multiple"
                :items="helpItems"
                :default-value="[]"
                :unmount-on-hide="false"
                :ui="{
                  root: 'space-y-2',
                  item: 'border-0',
                  header: 'm-0',
                  trigger: 'w-full rounded-md border border-primary/30 bg-primary/10 px-4 py-2.5 text-left text-sm font-semibold text-primary transition-colors hover:border-primary/45 hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-primary/30 dark:border-primary/35 dark:bg-primary/15 dark:text-primary dark:hover:border-primary/50 dark:hover:bg-primary/20',
                  body: 'px-2 pb-3 pt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300',
                  content: 'data-[state=open]:animate-none'
                }" />
            </template>
          </USlideover>
        </div>

        <URadioGroup
          v-if="showOptions"
          :model-value="localModelValue"
          :items="options"
          :aria-labelledby="questionHeadingId"
          :aria-required="questionRequired"
          variant="card"
          size="lg"
          class="w-full"
          :disabled="disabled"
          @update:model-value="handleModelValueUpdate" />

        <slot name="answer" :labelledby="questionHeadingId" />

        <p v-if="errorMessage" class="text-sm font-medium text-error" role="alert">
          {{ errorMessage }}
        </p>

        <UFormField v-if="showComment" :name="commentFieldName">
          <template #label>
            <span>
              {{ commentLabel }}
              <span v-if="commentRequired" class="text-red-600 dark:text-red-400">*</span>
              <span v-if="commentRequired" class="sr-only">{{ t('validation.required') }}</span>
            </span>
          </template>

          <CommonTextarea
            :model-value="commentValue"
            :rows="4"
            class="w-full"
            :disabled="disabled || commentDisabled"
            :required="commentRequired"
            :aria-required="commentRequired"
            :placeholder="commentPlaceholder"
            :stream-id="streamId"
            :extension-slot-name="extensionSlotName"
            :extension-context="extensionContext"
            @update:model-value="value => emit('update:commentValue', value)" />
        </UFormField>
      </div>
    </div>
  </div>
</template>
