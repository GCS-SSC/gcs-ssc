import { toValue } from 'vue'
import type { ComputedRef, MaybeRefOrGetter, Ref } from 'vue'
import type { FormError } from '#ui/types'

export interface WizardStepItem<TStep extends string> {
  value: TStep
  title: string
  description?: string
  icon?: string
}

interface UseWizardFlowOptions<TStep extends string> {
  steps: MaybeRefOrGetter<WizardStepItem<TStep>[]>
  initialStep: TStep
  errors: MaybeRefOrGetter<FormError[]>
  resolveStepForField: (fieldPath?: string) => TStep
  excludedErrorSummarySteps?: MaybeRefOrGetter<TStep[]>
}

interface ErrorSummaryStep<TStep extends string> {
  step: TStep
  title: string
  count: number
}

/**
 * Manages step navigation and error summaries for multi-step forms.
 *
 * @param options - Wizard configuration for steps and error-to-step routing.
 * @returns Reactive step state, navigation handlers, and error summaries.
 *
 * @example
 * ```typescript
 * const flow = useWizardFlow({
 *   steps,
 *   initialStep: 'general',
 *   errors,
 *   resolveStepForField: () => 'general'
 * })
 * ```
 */
export const useWizardFlow = <TStep extends string>(options: UseWizardFlowOptions<TStep>) => {
  const currentStep = ref(options.initialStep) as Ref<TStep>

  const steps = computed(() => toValue(options.steps))

  const stepIndex = computed(() => steps.value.findIndex(step => step.value === currentStep.value))
  const isFirstStep = computed(() => stepIndex.value <= 0)
  const isLastStep = computed(() => stepIndex.value === steps.value.length - 1)

  /**
   * Advances the wizard to the next sequential step.
   * Does nothing if the current step is already the last step.
   */
  const nextStep = () => {
    if (isLastStep.value) return
    const next = steps.value[stepIndex.value + 1]
    if (!next) return
    currentStep.value = next.value
  }

  /**
   * Navigates the wizard back to the previous sequential step.
   * Does nothing if the current step is the first step.
   */
  const prevStep = () => {
    if (isFirstStep.value) return
    const prev = steps.value[stepIndex.value - 1]
    if (!prev) return
    currentStep.value = prev.value
  }

  /**
   * Navigates the wizard directly to a specific step.
   * Validates that the requested step exists before updating the state.
   *
   * @param {TStep} step - The identifier of the step to navigate to.
   */
  const goToStep = (step: TStep) => {
    const exists = steps.value.some(item => item.value === step)
    if (!exists) return
    currentStep.value = step
  }

  /**
   * Resets the wizard to its initial starting step as defined in the options.
   */
  const reset = () => {
    currentStep.value = options.initialStep
  }

  const errorsByStep = computed<ErrorSummaryStep<TStep>[]>(() => {
    const counts = new Map<TStep, number>()
    const errors = toValue(options.errors)

    for (const error of errors) {
      const step = options.resolveStepForField(error.name)
      counts.set(step, (counts.get(step) ?? 0) + 1)
    }

    const excludedSteps = new Set(toValue(options.excludedErrorSummarySteps) ?? [])

    return steps.value
      .filter(step => !excludedSteps.has(step.value))
      .map(step => ({
        step: step.value,
        title: step.title,
        count: counts.get(step.value) ?? 0
      }))
      .filter(item => item.count > 0)
  })

  const currentStepErrors = computed<FormError[]>(() => {
    const errors = toValue(options.errors)
    const seen = new Set<string>()

    return errors.filter(error => {
      if (options.resolveStepForField(error.name) !== currentStep.value) return false

      const key = `${error.name ?? ''}|${error.message}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  })

  return {
    currentStep,
    steps,
    stepIndex,
    isFirstStep,
    isLastStep,
    nextStep,
    prevStep,
    goToStep,
    reset,
    errorsByStep,
    currentStepErrors
  } as {
    currentStep: Ref<TStep>
    steps: ComputedRef<WizardStepItem<TStep>[]>
    stepIndex: ComputedRef<number>
    isFirstStep: ComputedRef<boolean>
    isLastStep: ComputedRef<boolean>
    nextStep: () => void
    prevStep: () => void
    goToStep: (step: TStep) => void
    reset: () => void
    errorsByStep: ComputedRef<ErrorSummaryStep<TStep>[]>
    currentStepErrors: ComputedRef<FormError[]>
  }
}
