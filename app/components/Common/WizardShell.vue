<script setup lang="ts">
import type { FormError } from '#ui/types'

interface WizardStepItem {
  value: string
  title: string
  description?: string
  icon?: string
}

interface StepErrorSummary {
  step: string
  title: string
  count: number
}

const {
  currentStep,
  steps,
  isFirstStep,
  isLastStep,
  guidance,
  errors,
  errorsByStep,
  currentStepErrors,
  cancelLabel,
  previousLabel,
  nextLabel,
  submitLabel,
  guidanceTitle,
  errorSummaryLabel,
  errorStepsLabel,
  errorCurrentStepLabel,
  pending = false
} = defineProps<{
  currentStep: string
  steps: WizardStepItem[]
  isFirstStep: boolean
  isLastStep: boolean
  guidance: string
  errors: FormError[]
  errorsByStep: StepErrorSummary[]
  currentStepErrors: FormError[]
  cancelLabel: string
  previousLabel: string
  nextLabel: string
  submitLabel: string
  guidanceTitle: string
  errorSummaryLabel: string
  errorStepsLabel: string
  errorCurrentStepLabel: string
  pending?: boolean
}>()

const emit = defineEmits<{
  'update:currentStep': [value: string]
  'cancel': []
  'previous': []
  'next': []
  'jump-to-step': [value: string]
}>()

/**
 * Handles updates from the stepper component.
 * Verifies the incoming value is a string before emitting the updated step value to the parent component.
 *
 * @param {string | number | undefined} value - The next step identifier, which must be a string.
 */
const onStepperUpdate = (value: string | number | undefined) => {
  if (pending || typeof value !== 'string') return
  emit('update:currentStep', value)
}

const onPrevious = () => {
  if (pending) return
  emit('previous')
}

const onNext = () => {
  if (pending) return
  emit('next')
}

const onJumpToStep = (value: string) => {
  if (pending) return
  emit('jump-to-step', value)
}
</script>

<template>
  <div class="flex h-full w-full flex-col lg:flex-row" :aria-busy="pending">
    <div class="flex min-w-0 flex-1 flex-col overflow-hidden p-6">
      <UStepper
        :model-value="currentStep"
        :items="steps"
        :disabled="pending"
        class="mb-8"
        @update:model-value="onStepperUpdate" />

      <div class="flex-1 overflow-y-auto pr-2">
        <slot :current-step="currentStep" />
      </div>

      <div class="border-default flex justify-between gap-4 border-t pt-6">
        <UButton
          :label="cancelLabel"
          :aria-label="cancelLabel"
          color="neutral"
          variant="ghost"
          type="button"
          @click="emit('cancel')" />

        <div class="flex gap-2">
          <UButton
            v-if="!isFirstStep"
            :label="previousLabel"
            :aria-label="previousLabel"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="outline"
            type="button"
            :disabled="pending"
            @click="onPrevious" />
          <UButton
            v-if="!isLastStep"
            :label="nextLabel"
            :aria-label="nextLabel"
            trailing-icon="i-lucide-arrow-right"
            type="button"
            :loading="pending"
            :disabled="pending"
            @click="onNext" />
          <CommonSaveButton
            v-else
            :label="submitLabel"
            :aria-label="submitLabel"
            :loading="pending"
            :disabled="pending"
            type="submit" />
        </div>
      </div>
    </div>

    <div class="bg-zinc-50 p-4 lg:w-96 lg:max-w-96 lg:basis-96 lg:shrink-0 lg:border-l lg:border-zinc-200 dark:bg-zinc-900 dark:lg:border-zinc-800">
      <div class="sticky top-0 space-y-4">
        <div class="flex items-center gap-2 font-black tracking-widest text-zinc-400 uppercase">
          <UIcon name="i-lucide-help-circle" class="size-5" />
          {{ guidanceTitle }}
        </div>
        <p class="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {{ guidance }}
        </p>

        <div
          v-if="errors.length > 0"
          class="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4 text-xs dark:border-red-900 dark:bg-red-950/30">
          <p class="text-sm font-semibold text-red-700 dark:text-red-300">
            {{ errorSummaryLabel }}
          </p>

          <div class="space-y-1">
            <p class="font-medium text-red-700 dark:text-red-300">
              {{ errorStepsLabel }}
            </p>
            <UButton
              v-for="item in errorsByStep"
              :key="item.step"
              :label="`${item.title} (${item.count})`"
              color="error"
              variant="link"
              size="xs"
              :ui="{ label: 'whitespace-normal break-words text-left' }"
              class="h-auto w-full justify-start px-0 text-left"
              type="button"
              :disabled="pending"
              @click="onJumpToStep(item.step)" />
          </div>

          <div v-if="currentStepErrors.length > 0" class="space-y-1">
            <p class="font-medium text-red-700 dark:text-red-300">
              {{ errorCurrentStepLabel }}
            </p>
            <div
              v-for="(error, index) in currentStepErrors"
              :key="`${error.name}-${index}`"
              class="flex items-start gap-1 text-red-700 dark:text-red-300">
              <UIcon name="i-lucide-alert-circle" class="mt-0.5 size-3 shrink-0" />
              <span>{{ error.message }}</span>
            </div>
          </div>
        </div>

        <slot name="guidance-extra" :current-step="currentStep" />
      </div>
    </div>
  </div>
</template>
