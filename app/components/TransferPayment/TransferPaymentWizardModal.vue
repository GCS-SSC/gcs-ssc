<script setup lang="ts">
import type { FormSubmitEvent } from '#ui/types'
import type { TransferPaymentWizard } from '~~/shared/types/schemas'
import { formatMoneyText, parseMoney } from '~~/shared/utils/money'
import { useTransferPaymentWizardModal } from '~/composables/useTransferPaymentWizardModal'

const { fixedAgencyId, pending = false } = defineProps<{
  fixedAgencyId?: string
  pending?: boolean
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  (event: 'submit', data: TransferPaymentWizard): void
}>()

const { t, locale } = useI18n()
const {
  state,
  wizardErrors,
  steps,
  currentStep,
  isFirstStep,
  isLastStep,
  nextStep,
  prevStep,
  errorsByStep,
  currentStepErrors,
  agencies,
  fiscalYears,
  fiscalYearLabelById,
  isAgencyLocked,
  toDateInput,
  validateWizard,
  clearErrors,
  currentGuidance,
  addOutcome,
  removeOutcome,
  addObjective,
  removeObjective,
  addBudget,
  removeBudget,
  addPerformanceIndicator,
  removePerformanceIndicator,
  getOutcomeLabel,
  getObjectiveLabel,
  getPerformanceIndicatorLabel,
  getLinkedOutcomeLabel,
  updateStartDate,
  updateEndDate,
  getSelectedAgencyLabel,
  onCurrentStepUpdate
} = useTransferPaymentWizardModal({
  open,
  fixedAgencyId: () => fixedAgencyId
})

/**
 * Emits a validated wizard payload unless a save is already pending.
 *
 * @param event Validated form submission event.
 */
const onSubmit = (event: FormSubmitEvent<TransferPaymentWizard>) => {
  if (pending) return
  clearErrors()
  emit('submit', event.data)
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('transfer_payment.wizard.title')"
    :description="t('common.form_dialog_description')"
    fullscreen
    :ui="{
      content: 'rounded-none shadow-none ring-0'
    }">
    <template #body>
      <UForm
        v-if="state"
        :state="state"
        :validate="validateWizard"
        class="flex h-full flex-col lg:flex-row"
        @submit="onSubmit">
        <CommonWizardShell
          :current-step="currentStep"
          :steps="steps"
          :is-first-step="isFirstStep"
          :is-last-step="isLastStep"
          :guidance="currentGuidance"
          :errors="wizardErrors"
          :errors-by-step="errorsByStep"
          :current-step-errors="currentStepErrors"
          :cancel-label="t('common.cancel')"
          :previous-label="t('common.previous')"
          :next-label="t('common.next')"
          :submit-label="t('common.submit')"
          :guidance-title="t('common.guidance')"
          :error-summary-label="t('transfer_payment.wizard.errors_summary', { count: wizardErrors.length })"
          :error-steps-label="t('transfer_payment.wizard.errors_steps')"
          :error-current-step-label="t('transfer_payment.wizard.errors_current_step')"
          :pending="pending"
          @update:current-step="onCurrentStepUpdate"
          @cancel="open = false"
          @previous="prevStep"
          @next="nextStep"
          @jump-to-step="onCurrentStepUpdate">
          <template #default="slotProps">
            <div v-if="slotProps.currentStep === 'general'" class="space-y-4">
              <TransferPaymentFieldsTransferPaymentProfileFields
                v-model:model="state.profile"
                :agencies="agencies"
                :is-agency-locked="isAgencyLocked"
                is-stacked
                name-prefix="profile"
                :start-date-value="toDateInput(state.profile.egcs_tp_datestart)"
                :end-date-value="toDateInput(state.profile.egcs_tp_dateend)"
                :on-update-start-date="updateStartDate"
                :on-update-end-date="updateEndDate" />
            </div>

            <div v-if="slotProps.currentStep === 'outcomes'" class="space-y-6">
              <div
                v-if="state.outcomes.length === 0"
                class="flex flex-col items-center justify-center py-12 text-zinc-500">
                <UIcon name="i-lucide-target" class="mb-2 size-12 opacity-20" />
                <p>{{ t('transfer_payment.wizard.no_outcomes') }}</p>
              </div>

              <div
                v-for="(outcome, index) in state.outcomes"
                :key="outcome.tempId"
                class="border-default relative space-y-4 rounded-xl border bg-zinc-50/50 p-4 dark:bg-zinc-900/50">
                <UButton
                  icon="i-lucide-x"
                  color="error"
                  variant="ghost"
                  size="xs"
                  class="absolute top-2 right-2"
                  type="button"
                  :aria-label="t('transfer_payment.wizard.remove_outcome_named', {
                    position: index + 1,
                    name: getOutcomeLabel(outcome)
                  })"
                  @click="removeOutcome(index)" />

                <TransferPaymentFieldsTransferPaymentOutcomeFields :model="outcome" :name-prefix="`outcomes.${index}`" is-stacked />
              </div>

              <UButton
                :label="t('transfer_payment.add_outcome')"
                icon="i-lucide-plus"
                color="neutral"
                variant="outline"
                block
                type="button"
                @click="addOutcome" />
            </div>

            <div v-if="slotProps.currentStep === 'objectives'" class="space-y-6">
              <div
                v-if="state.objectives.length === 0"
                class="flex flex-col items-center justify-center py-12 text-zinc-500">
                <UIcon name="i-lucide-goal" class="mb-2 size-12 opacity-20" />
                <p>{{ t('transfer_payment.wizard.no_objectives') }}</p>
              </div>

              <div
                v-for="(objective, index) in state.objectives"
                :key="objective.tempId"
                class="border-default relative space-y-4 rounded-xl border bg-zinc-50/50 p-4 dark:bg-zinc-900/50">
                <UButton
                  icon="i-lucide-x"
                  color="error"
                  variant="ghost"
                  size="xs"
                  class="absolute top-2 right-2"
                  type="button"
                  :aria-label="t('transfer_payment.wizard.remove_objective_named', {
                    position: index + 1,
                    name: getObjectiveLabel(objective)
                  })"
                  @click="removeObjective(index)" />

                <TransferPaymentFieldsTransferPaymentObjectiveFields :model="objective" :name-prefix="`objectives.${index}`" is-stacked />
              </div>

              <UButton
                :label="t('transfer_payment.add_objective')"
                icon="i-lucide-plus"
                color="neutral"
                variant="outline"
                block
                type="button"
                @click="addObjective" />
            </div>

            <div v-if="slotProps.currentStep === 'budgets'" class="space-y-6">
              <div
                v-if="state.budgets.length === 0"
                class="flex flex-col items-center justify-center py-12 text-zinc-500">
                <UIcon name="i-lucide-banknote" class="mb-2 size-12 opacity-20" />
                <p>{{ t('transfer_payment.wizard.no_budgets') }}</p>
              </div>

              <div
                v-for="(budget, index) in state.budgets"
                :key="budget.tempId"
                class="border-default relative grid grid-cols-1 gap-4 rounded-xl border bg-zinc-50/50 p-4 md:grid-cols-3 dark:bg-zinc-900/50">
                <UButton
                  icon="i-lucide-x"
                  color="error"
                  variant="ghost"
                  size="xs"
                  class="absolute top-2 right-2"
                  type="button"
                  :aria-label="t('transfer_payment.wizard.remove_budget_named', {
                    position: index + 1,
                    name: fiscalYearLabelById.get(String(budget.egcs_tp_fiscalyear)) || String(budget.egcs_tp_fiscalyear)
                  })"
                  @click="removeBudget(index)" />

                <TransferPaymentFieldsTransferPaymentBudgetFields
                  :model="budget"
                  :fiscal-years="fiscalYears"
                  :name-prefix="`budgets.${index}`" />
              </div>

              <UButton
                :label="t('transfer_payment.add_budget')"
                icon="i-lucide-plus"
                color="neutral"
                variant="outline"
                block
                type="button"
                @click="addBudget" />
            </div>

            <div v-if="slotProps.currentStep === 'performance'" class="space-y-6">
              <div
                v-if="state.performanceIndicators.length === 0"
                class="flex flex-col items-center justify-center py-12 text-zinc-500">
                <UIcon name="i-lucide-line-chart" class="mb-2 size-12 opacity-20" />
                <p>{{ t('transfer_payment.wizard.no_indicators') }}</p>
              </div>

              <div
                v-for="(pi, index) in state.performanceIndicators"
                :key="pi.tempId"
                class="border-default relative space-y-4 rounded-xl border bg-zinc-50/50 p-4 dark:bg-zinc-900/50">
                <UButton
                  icon="i-lucide-x"
                  color="error"
                  variant="ghost"
                  size="xs"
                  class="absolute top-2 right-2"
                  type="button"
                  :aria-label="t('transfer_payment.wizard.remove_performance_indicator_named', {
                    position: index + 1,
                    name: getPerformanceIndicatorLabel(pi)
                  })"
                  @click="removePerformanceIndicator(index)" />

                <TransferPaymentFieldsTransferPaymentPerformanceIndicatorFields
                  :model="pi"
                  :name-prefix="`performanceIndicators.${index}`"
                  :outcomes="state.outcomes"
                  outcome-field="tempOutcomeId"
                  outcome-value-key="tempId"
                  is-stacked />
              </div>

              <UButton
                v-if="state.outcomes.length > 0"
                :label="t('transfer_payment.add_performance_indicator')"
                icon="i-lucide-plus"
                color="neutral"
                variant="outline"
                block
                type="button"
                @click="addPerformanceIndicator" />
            </div>

            <div v-if="slotProps.currentStep === 'review'" class="space-y-8 pb-8">
              <section class="space-y-4">
                <h3 class="flex items-center gap-2 text-lg font-bold">
                  <UIcon name="i-lucide-info" class="text-primary" />
                  {{ t('transfer_payment.wizard.step_1') }}
                </h3>
                <div class="grid grid-cols-1 gap-6 rounded-xl bg-zinc-50 p-6 md:grid-cols-2 dark:bg-zinc-900/50">
                  <div class="space-y-1">
                    <span class="text-xs font-bold tracking-widest text-zinc-400 uppercase">
                      {{ t('transfer_payment.name_en') }}
                    </span>
                    <p>
                      {{ state.profile.egcs_tp_name_en || t('common.none') }}
                    </p>
                  </div>
                  <div class="space-y-1">
                    <span class="text-xs font-bold tracking-widest text-zinc-400 uppercase">
                      {{ t('transfer_payment.name_fr') }}
                    </span>
                    <p>
                      {{ state.profile.egcs_tp_name_fr || t('common.none') }}
                    </p>
                  </div>
                  <div class="space-y-1">
                    <span class="text-xs font-bold tracking-widest text-zinc-400 uppercase">
                      {{ t('transfer_payment.agency') }}
                    </span>
                    <p>
                      {{ getSelectedAgencyLabel() }}
                    </p>
                  </div>
                  <div class="space-y-1">
                    <span class="text-xs font-bold tracking-widest text-zinc-400 uppercase">
                      {{ t('transfer_payment.start_date') }} {{ t('common.separator') }}
                      {{ t('transfer_payment.end_date') }}
                    </span>
                    <p>
                      {{ toDateInput(state.profile.egcs_tp_datestart) }} {{ t('common.to') }}
                      {{ toDateInput(state.profile.egcs_tp_dateend) }}
                    </p>
                  </div>
                </div>
              </section>

              <section v-if="state.outcomes.length > 0" class="space-y-4">
                <h3 class="flex items-center gap-2 text-lg font-bold">
                  <UIcon name="i-lucide-target" class="text-primary" />
                  {{ t('transfer_payment.wizard.step_2') }} ({{ state.outcomes.length }})
                </h3>
                <div class="space-y-2">
                  <div
                    v-for="outcome in state.outcomes"
                    :key="outcome.tempId"
                    class="flex items-center justify-between rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900/50">
                    <span class="font-medium">
                      {{ getOutcomeLabel(outcome) }}
                    </span>
                  </div>
                </div>
              </section>

              <section v-if="state.objectives.length > 0" class="space-y-4">
                <h3 class="flex items-center gap-2 text-lg font-bold">
                  <UIcon name="i-lucide-goal" class="text-primary" />
                  {{ t('transfer_payment.wizard.step_3') }} ({{ state.objectives.length }})
                </h3>
                <div class="space-y-2">
                  <div
                    v-for="obj in state.objectives"
                    :key="obj.tempId"
                    class="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900/50">
                    <p>
                      {{ getObjectiveLabel(obj) }}
                    </p>
                  </div>
                </div>
              </section>

              <section v-if="state.budgets.length > 0" class="space-y-4">
                <h3 class="flex items-center gap-2 text-lg font-bold">
                  <UIcon name="i-lucide-banknote" class="text-primary" />
                  {{ t('transfer_payment.wizard.step_4') }} ({{ state.budgets.length }})
                </h3>
                <div class="space-y-2">
                  <div
                    v-for="budget in state.budgets"
                    :key="budget.tempId"
                    class="flex items-center justify-between rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900/50">
                    <span class="font-bold">
                      {{ fiscalYearLabelById.get(budget.egcs_tp_fiscalyear) || t('common.none') }}
                    </span>
                    <span class="text-primary font-mono font-black">
                      {{ formatMoneyText(parseMoney(budget.egcs_tp_totalbudget), locale, 'CAD') }}
                    </span>
                  </div>
                </div>
              </section>

              <section v-if="state.performanceIndicators.length > 0" class="space-y-4">
                <h3 class="flex items-center gap-2 text-lg font-bold">
                  <UIcon name="i-lucide-line-chart" class="text-primary" />
                  {{ t('transfer_payment.wizard.step_5') }} ({{ state.performanceIndicators.length }})
                </h3>
                <div class="space-y-2">
                  <div
                    v-for="pi in state.performanceIndicators"
                    :key="pi.tempId"
                    class="flex items-center justify-between rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900/50">
                    <span class="font-medium">{{ getPerformanceIndicatorLabel(pi) }}</span>
                    <CommonStatusBadge variant="meta" size="sm" :label="getLinkedOutcomeLabel(pi.tempOutcomeId)" />
                  </div>
                </div>
              </section>
            </div>
          </template>

          <template #guidance-extra="guidanceProps">
            <div
              v-if="guidanceProps.currentStep === 'budgets'"
              class="bg-primary-50 text-primary-700 dark:bg-primary-950/30 dark:text-primary-400 rounded-lg p-4 text-xs">
              <p class="flex items-start gap-2 font-medium">
                <UIcon name="i-lucide-info" class="shrink-0" />
                {{ t('transfer_payment.wizard.fiscal_year_guidance') }}
              </p>
            </div>

            <div
              v-if="guidanceProps.currentStep === 'performance'"
              class="bg-primary-50 text-primary-700 dark:bg-primary-950/30 dark:text-primary-400 rounded-lg p-4 text-xs">
              <p class="flex items-start gap-2 font-medium">
                <UIcon name="i-lucide-info" class="shrink-0" />
                {{ t('transfer_payment.wizard.outcome_selection_guidance') }}
              </p>
            </div>
          </template>
        </CommonWizardShell>
      </UForm>
    </template>
  </UModal>
</template>
