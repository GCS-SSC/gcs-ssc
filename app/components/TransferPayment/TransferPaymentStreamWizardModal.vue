<script setup lang="ts">
import type { FormSubmitEvent } from '#ui/types'
import type { TransferPaymentStreamPolymorphicWizard } from '~~/shared/types/schemas'
import { useTransferPaymentStreamWizardModal } from '~/composables/useTransferPaymentStreamWizardModal'

const { programId, agencyId, pending = false } = defineProps<{
  programId: string
  agencyId?: string | null
  pending?: boolean
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  (event: 'submit', data: TransferPaymentStreamPolymorphicWizard): void
}>()

const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()
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
  parentStreams,
  budgets,
  chartOfAccountBudgetOptions,
  applicantRecipientOptions,
  lineItemOptions,
  agreementTypeOptions,
  agencyHoldbackOptions,
  validateWizard,
  clearErrors,
  currentGuidance,
  reviewGeneralSummaryItems,
  reviewStepSummaryItems,
  reviewBudgetSummaryItems,
  reviewAgreementSubtypeSummaryItems,
  addBudget,
  onBudgetModelUpdate,
  removeBudget,
  addHoldbackBasis,
  removeHoldbackBasis,
  addEligibleRecipient,
  removeEligibleRecipient,
  addCostCategoryLineItem,
  removeCostCategoryLineItem,
  addAmendmentType,
  removeAmendmentType,
  addAmendmentSubtype,
  removeAmendmentSubtype,
  addAgreementSubtype,
  removeAgreementSubtype,
  addChartOfAccount,
  removeChartOfAccount,
  addCommitmentType,
  removeCommitmentType,
  addMonitorType,
  removeMonitorType,
  addAreaOfExpertise,
  removeAreaOfExpertise,
  ensureFinancialLimit,
  clearFinancialLimit,
  getAmendmentTypeLabel,
  onCurrentStepUpdate
} = useTransferPaymentStreamWizardModal({
  open,
  programId,
  agencyId
})

/**
 * Emits a validated wizard payload unless a save is already pending.
 *
 * @param event Validated form submission event.
 */
const onSubmit = (event: FormSubmitEvent<TransferPaymentStreamPolymorphicWizard>) => {
  if (pending) return
  clearErrors()
  emit('submit', event.data)
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('transfer_payment.stream_wizard.title')"
    :description="t('transfer_payment.stream_wizard.description')"
    fullscreen
    :ui="{ content: 'rounded-none shadow-none ring-0' }">
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
          :error-summary-label="t('transfer_payment.stream_wizard.errors_summary', { count: wizardErrors.length })"
          :error-steps-label="t('transfer_payment.stream_wizard.errors_steps')"
          :error-current-step-label="t('transfer_payment.stream_wizard.errors_current_step')"
          :pending="pending"
          @update:current-step="onCurrentStepUpdate"
          @cancel="open = false"
          @previous="prevStep"
          @next="nextStep"
          @jump-to-step="onCurrentStepUpdate">
          <template #default="slotProps">
            <div v-if="slotProps.currentStep === 'general'" class="space-y-4">
              <TransferPaymentFieldsTransferPaymentStreamFields
                :model="state.stream"
                :parent-streams="parentStreams"
                is-stacked
                name-prefix="stream" />
            </div>

            <div v-if="slotProps.currentStep === 'holdback-bases'" class="space-y-6">
              <div
                v-for="(holdbackBasis, index) in state.holdbackBases"
                :key="holdbackBasis.tempId"
                class="border-default relative space-y-4 rounded-xl border bg-zinc-50/50 p-4 dark:bg-zinc-900/50">
                <UButton icon="i-lucide-x" color="error" variant="ghost" class="absolute top-2 right-2 cursor-default" type="button" :aria-label="t('common.remove')" :title="t('common.remove')" @click="removeHoldbackBasis(index)" />
                <TransferPaymentFieldsTransferPaymentStreamHoldbackBasisFields
                  :model="holdbackBasis"
                  :agency-holdback-bases="agencyHoldbackOptions"
                  :name-prefix="`holdbackBases.${index}`" />
              </div>
              <UButton type="button" :label="t('common.add')" icon="i-lucide-plus" variant="outline" block @click="addHoldbackBasis" />
            </div>

            <div v-if="slotProps.currentStep === 'budgets'" class="space-y-6">
              <div
                v-for="(budget, index) in state.budgets"
                :key="budget.tempId"
                class="border-default relative grid grid-cols-1 gap-4 rounded-xl border bg-zinc-50/50 p-4 md:grid-cols-3 dark:bg-zinc-900/50">
                <UButton icon="i-lucide-x" color="error" variant="ghost" class="absolute top-2 right-2 cursor-default" type="button" :aria-label="t('common.remove')" :title="t('common.remove')" @click="removeBudget(index)" />
                <TransferPaymentFieldsTransferPaymentStreamBudgetFields
                  :model="budget"
                  :transfer-payment-id="programId"
                  :budget-options="budgets"
                  :name-prefix="`budgets.${index}`"
                  @update:model="updatedBudget => onBudgetModelUpdate(index, updatedBudget)" />
              </div>
              <UButton type="button" :label="t('common.add')" icon="i-lucide-plus" variant="outline" block @click="addBudget" />
            </div>

            <div v-if="slotProps.currentStep === 'recipients'" class="space-y-6">
              <div
                v-for="(recipient, index) in state.eligibleRecipients"
                :key="recipient.tempId"
                class="border-default relative space-y-4 rounded-xl border bg-zinc-50/50 p-4 dark:bg-zinc-900/50">
                <UButton icon="i-lucide-x" color="error" variant="ghost" class="absolute top-2 right-2 cursor-default" type="button" :aria-label="t('common.remove')" :title="t('common.remove')" @click="removeEligibleRecipient(index)" />
                <TransferPaymentFieldsTransferPaymentEligibleRecipientFields
                  :model="recipient"
                  :recipient-options="applicantRecipientOptions"
                  :name-prefix="`eligibleRecipients.${index}`" />
              </div>
              <UButton type="button" :label="t('common.add')" icon="i-lucide-plus" variant="outline" block @click="addEligibleRecipient" />
            </div>

            <div v-if="slotProps.currentStep === 'cost-lines'" class="space-y-6">
              <div
                v-for="(lineItem, index) in state.costCategoryLineItems"
                :key="lineItem.tempId"
                class="border-default relative grid grid-cols-1 gap-4 rounded-xl border bg-zinc-50/50 p-4 md:grid-cols-2 dark:bg-zinc-900/50">
                <UButton icon="i-lucide-x" color="error" variant="ghost" class="absolute top-2 right-2 cursor-default" type="button" :aria-label="t('common.remove')" :title="t('common.remove')" @click="removeCostCategoryLineItem(index)" />
                <TransferPaymentFieldsTransferPaymentCostCategoryLineItemFields
                  :model="lineItem"
                  :line-item-options="lineItemOptions"
                  :name-prefix="`costCategoryLineItems.${index}`" />
              </div>
              <UButton type="button" :label="t('common.add')" icon="i-lucide-plus" variant="outline" block @click="addCostCategoryLineItem" />
            </div>

            <div v-if="slotProps.currentStep === 'amendment-types'" class="space-y-6">
              <div
                v-for="(amendmentType, index) in state.amendmentTypes"
                :key="amendmentType.tempId"
                class="border-default relative space-y-4 rounded-xl border bg-zinc-50/50 p-4 dark:bg-zinc-900/50">
                <UButton icon="i-lucide-x" color="error" variant="ghost" class="absolute top-2 right-2 cursor-default" type="button" :aria-label="t('common.remove')" :title="t('common.remove')" @click="removeAmendmentType(index)" />
                <TransferPaymentFieldsTransferPaymentAmendmentTypeFields
                  :model="amendmentType"
                  :name-prefix="`amendmentTypes.${index}`" />
              </div>
              <UButton type="button" :label="t('common.add')" icon="i-lucide-plus" variant="outline" block @click="addAmendmentType" />
            </div>

            <div v-if="slotProps.currentStep === 'amendment-subtypes'" class="space-y-6">
              <div
                v-for="(subtype, index) in state.amendmentSubtypes"
                :key="subtype.tempId"
                class="border-default relative space-y-4 rounded-xl border bg-zinc-50/50 p-4 dark:bg-zinc-900/50">
                <UButton icon="i-lucide-x" color="error" variant="ghost" class="absolute top-2 right-2 cursor-default" type="button" :aria-label="t('common.remove')" :title="t('common.remove')" @click="removeAmendmentSubtype(index)" />
                <TransferPaymentFieldsTransferPaymentAmendmentSubtypeFields
                  :model="subtype"
                  :amendment-types="state.amendmentTypes"
                  :name-prefix="`amendmentSubtypes.${index}`"
                  amendment-type-field="tempAmendmentTypeIds"
                  amendment-type-value-key="tempId" />
              </div>
              <UButton
                v-if="state.amendmentTypes.length > 0"
                type="button"
                :label="t('common.add')"
                icon="i-lucide-plus"
                variant="outline"
                block
                @click="addAmendmentSubtype" />
            </div>

            <div v-if="slotProps.currentStep === 'agreement-subtypes'" class="space-y-6">
              <div
                v-for="(agreementSubtype, index) in state.agreementSubtypes"
                :key="agreementSubtype.tempId"
                class="border-default relative space-y-4 rounded-xl border bg-zinc-50/50 p-4 dark:bg-zinc-900/50">
                <UButton icon="i-lucide-x" color="error" variant="ghost" class="absolute top-2 right-2 cursor-default" type="button" :aria-label="t('common.remove')" :title="t('common.remove')" @click="removeAgreementSubtype(index)" />
                <TransferPaymentFieldsTransferPaymentAgreementSubtypeFields
                  :model="agreementSubtype"
                  :agreement-types="agreementTypeOptions"
                  :name-prefix="`agreementSubtypes.${index}`" />
              </div>
              <UButton type="button" :label="t('common.add')" icon="i-lucide-plus" variant="outline" block @click="addAgreementSubtype" />
            </div>

            <div v-if="slotProps.currentStep === 'chart-of-accounts'" class="space-y-6">
              <div
                v-for="(chartOfAccount, index) in state.chartOfAccounts"
                :key="chartOfAccount.tempId"
                class="border-default relative space-y-4 rounded-xl border bg-zinc-50/50 p-4 dark:bg-zinc-900/50">
                <UButton icon="i-lucide-x" color="error" variant="ghost" class="absolute top-2 right-2 cursor-default" type="button" :aria-label="t('common.remove')" :title="t('common.remove')" @click="removeChartOfAccount(index)" />
                <TransferPaymentFieldsTransferPaymentStreamChartOfAccountFields
                  :model-value="chartOfAccount"
                  :budget-options="chartOfAccountBudgetOptions"
                  budget-field="tempStreamBudgetId"
                  :name-prefix="`chartOfAccounts.${index}`" />
              </div>
              <UButton v-if="state.budgets.length > 0" type="button" :label="t('common.add')" icon="i-lucide-plus" variant="outline" block @click="addChartOfAccount" />
            </div>

            <div v-if="slotProps.currentStep === 'monitor-types'" class="space-y-6">
              <div
                v-for="(reviewType, index) in state.monitorTypes"
                :key="reviewType.tempId"
                class="border-default relative space-y-4 rounded-xl border bg-zinc-50/50 p-4 dark:bg-zinc-900/50">
                <UButton icon="i-lucide-x" color="error" variant="ghost" class="absolute top-2 right-2 cursor-default" type="button" :aria-label="t('common.remove')" :title="t('common.remove')" @click="removeMonitorType(index)" />
                <TransferPaymentFieldsTransferPaymentMonitorTypeFields :model="reviewType" :name-prefix="`monitorTypes.${index}`" />
              </div>
              <UButton type="button" :label="t('common.add')" icon="i-lucide-plus" variant="outline" block @click="addMonitorType" />
            </div>

            <div v-if="slotProps.currentStep === 'commitment-types'" class="space-y-6">
              <div
                v-for="(commitmentType, index) in state.commitmentTypes"
                :key="commitmentType.tempId"
                class="border-default relative space-y-4 rounded-xl border bg-zinc-50/50 p-4 dark:bg-zinc-900/50">
                <UButton icon="i-lucide-x" color="error" variant="ghost" class="absolute top-2 right-2 cursor-default" type="button" :aria-label="t('common.remove')" :title="t('common.remove')" @click="removeCommitmentType(index)" />
                <UFormField :label="t('transfer_payment.name_en')" :name="`commitmentTypes.${index}.egcs_tp_name_en`">
                  <UInput v-model="commitmentType.egcs_tp_name_en" class="w-full" />
                </UFormField>
                <UFormField :label="t('transfer_payment.name_fr')" :name="`commitmentTypes.${index}.egcs_tp_name_fr`">
                  <UInput v-model="commitmentType.egcs_tp_name_fr" class="w-full" />
                </UFormField>
              </div>
              <UButton type="button" :label="t('common.add')" icon="i-lucide-plus" variant="outline" block @click="addCommitmentType" />
            </div>

            <div v-if="slotProps.currentStep === 'areas'" class="space-y-6">
              <div
                v-for="(area, index) in state.areasOfExpertise"
                :key="area.tempId"
                class="border-default relative space-y-4 rounded-xl border bg-zinc-50/50 p-4 dark:bg-zinc-900/50">
                <UButton icon="i-lucide-x" color="error" variant="ghost" class="absolute top-2 right-2 cursor-default" type="button" :aria-label="t('common.remove')" :title="t('common.remove')" @click="removeAreaOfExpertise(index)" />
                <TransferPaymentFieldsTransferPaymentAreaOfExpertiseFields :model="area" :name-prefix="`areasOfExpertise.${index}`" is-stacked />
              </div>
              <UButton type="button" :label="t('common.add')" icon="i-lucide-plus" variant="outline" block @click="addAreaOfExpertise" />
            </div>

            <div v-if="slotProps.currentStep === 'financial-limits'" class="space-y-6">
              <div v-if="!state.financialLimit" class="border-default rounded-xl border border-dashed p-6 text-center">
                <UButton type="button" :label="t('common.add')" icon="i-lucide-plus" variant="outline" @click="ensureFinancialLimit" />
              </div>

              <div
                v-else
                class="border-default relative space-y-4 rounded-xl border bg-zinc-50/50 p-4 dark:bg-zinc-900/50">
                <UButton icon="i-lucide-x" color="error" variant="ghost" class="absolute top-2 right-2 cursor-default" type="button" :aria-label="t('common.remove')" :title="t('common.remove')" @click="clearFinancialLimit" />
                <TransferPaymentFieldsTransferPaymentFinancialLimitFields
                  :model="state.financialLimit"
                  is-stacked
                  name-prefix="financialLimit" />
              </div>
            </div>

            <div v-if="slotProps.currentStep === 'review'" class="space-y-8 pb-8">
              <section class="space-y-4">
                <h3 class="flex items-center gap-2 text-lg font-bold">
                  <UIcon name="i-lucide-layers" class="text-primary" />
                  {{ t('transfer_payment.stream_wizard.step_1') }}
                </h3>
                <div class="grid grid-cols-1 gap-6 rounded-xl bg-zinc-50 p-6 md:grid-cols-2 dark:bg-zinc-900/50">
                  <div v-for="item in reviewGeneralSummaryItems" :key="item.key">
                    <span class="text-xs font-bold tracking-widest text-zinc-400 uppercase">{{ item.label }}</span>
                    <p>{{ item.value }}</p>
                  </div>
                </div>
              </section>

              <section class="space-y-2">
                <div
                  v-for="item in reviewStepSummaryItems"
                  :key="item.key"
                  class="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900/50">
                  {{ item.label }}: {{ item.value }}
                </div>
              </section>

              <section v-if="reviewBudgetSummaryItems.length > 0" class="space-y-4">
                <h3 class="flex items-center gap-2 text-lg font-bold">
                  <UIcon name="i-lucide-banknote" class="text-primary" />
                  {{ t('transfer_payment.stream_wizard.step_3') }} ({{ reviewBudgetSummaryItems.length }})
                </h3>
                <div class="space-y-3">
                  <div
                    v-for="budget in reviewBudgetSummaryItems"
                    :key="budget.key"
                    class="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900/50">
                    <p class="font-semibold">
                      {{ budget.title }}
                    </p>
                    <div class="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
                      <div v-for="item in budget.items" :key="item.key">
                        <span class="text-xs font-bold tracking-widest text-zinc-400 uppercase">{{ item.label }}</span>
                        <p>{{ item.value }}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section v-if="state.amendmentSubtypes.length > 0" class="space-y-2">
                <h3 class="text-sm font-semibold">
                  {{ t('transfer_payment.amendment_subtypes') }}
                </h3>
                <div
                  v-for="subtype in state.amendmentSubtypes"
                  :key="subtype.tempId"
                  class="rounded-lg bg-zinc-50 p-4 text-sm dark:bg-zinc-900/50">
                  {{ getBilingualValue(subtype, 'egcs_tp_name', t('common.none')) }}
                  <span class="text-zinc-500">({{ subtype.tempAmendmentTypeIds.map(getAmendmentTypeLabel).join(', ') }})</span>
                </div>
              </section>

              <section v-if="reviewAgreementSubtypeSummaryItems.length > 0" class="space-y-2">
                <h3 class="text-sm font-semibold">
                  {{ t('transfer_payment.agreement_subtypes') }}
                </h3>
                <div
                  v-for="agreementSubtype in reviewAgreementSubtypeSummaryItems"
                  :key="agreementSubtype.id"
                  class="rounded-lg bg-zinc-50 p-4 text-sm dark:bg-zinc-900/50">
                  {{ getBilingualValue(agreementSubtype, 'egcs_ay_name', t('common.none')) }}
                </div>
              </section>
            </div>
          </template>
        </CommonWizardShell>
      </UForm>
    </template>
  </UModal>
</template>
