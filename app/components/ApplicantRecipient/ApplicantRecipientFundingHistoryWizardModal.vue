<script setup lang="ts">
import { useActionContext, type CapturedActionContext } from '~/composables/useActionContext'
import { useFormSession } from '~/composables/useFormSession'
/* eslint-disable jsdoc/require-jsdoc -- local wizard event helpers are self-documenting and not public APIs */
import { computed, nextTick, onScopeDispose, ref, shallowRef, useId, watch } from 'vue'
import type { Ref } from 'vue'
import type { FormError } from '#ui/types'
import { useModalSession } from '~/composables/useModalSession'
import type {
  FundingHistoryFormState,
  FundingHistorySimilarityResponse,
  FundingHistorySimilarityWarning,
  VisibleFundingHistoryRow
} from '~/types/funding-history'
import { compareMoney, formatMoneyText, parseMoney, zeroMoney, type Money, type MoneyInput } from '~~/shared/utils/money'

const {
  applicantRecipientId,
  applicantRecipientLabel,
  canCreate,
  canCreateRole,
  canUpdate,
  canUpdateRole,
  history = null
} = defineProps<{
  applicantRecipientId: string
  applicantRecipientLabel: string
  canCreate: boolean
  canCreateRole: boolean
  canUpdate: boolean
  canUpdateRole: boolean
  history?: VisibleFundingHistoryRow | null
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  saved: []
}>()

const { t, locale } = useI18n()
const { showError } = useApiErrorToast()
const toast = useLocalizedToast()
const { items: allCurrencyOptions } = useEnumSelectOptions({ name: () => 'currency_codes' })
const currencyOptions = allCurrencyOptions
const tryParseMoney = (value: MoneyInput): Money | null => {
  if (value === undefined) return null
  try {
    return parseMoney(value)
  } catch {
    return null
  }
}

const stepOrder = ['recipients', 'agency', 'program', 'agreement', 'review'] as const
type FundingHistoryStep = typeof stepOrder[number]

const state: Ref<FundingHistoryFormState | null> = ref(null)
const currentStep: Ref<FundingHistoryStep> = ref('recipients')
const errors: Ref<FormError[]> = ref([])
type WizardAction = { kind: 'advance'; step: FundingHistoryStep } | { kind: 'save' }
type WizardOperation = {
  session: number
  applicantRecipientId: string
  draft: FundingHistoryFormState
  action: WizardAction
  authority: CapturedActionContext
}
type WizardWorkflow =
  | { kind: 'closed' | 'editing' | 'disposed' }
  | { kind: 'checking' | 'saving'; operation: WizardOperation }
  | {
    kind: 'warning' | 'warning_closing'
    operation: WizardOperation
    warnings: FundingHistorySimilarityWarning[]
    resume: 'action' | 'recheck_save'
  }

const actionContext = useActionContext({
  identity: [() => applicantRecipientId],
  authority: () => history ? canUpdateRole : canCreateRole,
  eligible: () => history ? canUpdate : canCreate
})
const modal = useModalSession()
const workflow: Ref<WizardWorkflow> = shallowRef({ kind: 'closed' })
const isPending = computed(() => workflow.value.kind === 'checking' || workflow.value.kind === 'saving')
const warnings = computed(() => workflow.value.kind === 'warning' || workflow.value.kind === 'warning_closing'
  ? workflow.value.warnings
  : [])
const isWarningOpen = computed({
  get: () => workflow.value.kind === 'warning',
  set: (isOpen: boolean) => {
    if (!isOpen && workflow.value.kind === 'warning') {
      const closing: WizardWorkflow = { ...workflow.value, kind: 'warning_closing' }
      workflow.value = closing
      void nextTick(() => {
        if (workflow.value === closing) workflow.value = { kind: 'editing' }
      })
    }
  }
})
const ownsOperation = (operation: WizardOperation) => modal.isCurrentSession(operation.session)
  && state.value === operation.draft
  && operation.authority.isCurrent()

const steps = computed(() => stepOrder.map((value, index) => ({
  value,
  title: t(`applicant_recipient.funding_history.wizard.steps.${value}.title`),
  description: t(`applicant_recipient.funding_history.wizard.steps.${value}.description`),
  icon: ['i-lucide-users', 'i-lucide-landmark', 'i-lucide-building-2', 'i-lucide-file-text', 'i-lucide-clipboard-check'][index]
})))
const currentStepIndex = computed(() => stepOrder.indexOf(currentStep.value))
const isFirstStep = computed(() => currentStepIndex.value === 0)
const isLastStep = computed(() => currentStep.value === 'review')
const currentGuidance = computed(() => t(`applicant_recipient.funding_history.wizard.steps.${currentStep.value}.guidance`))

const newState = (): FundingHistoryFormState => ({
  recipientIds: [applicantRecipientId],
  egcs_ar_currency: 'cad',
  confirmations: []
})

const dateInputValue = (value: string): string => value.slice(0, 10)

const historyRecipientIds = (item: VisibleFundingHistoryRow): string[] => {
  const ids = item.recipients?.map(recipient => String(recipient.id)) || []
  return [applicantRecipientId, ...ids.filter(id => id !== applicantRecipientId)]
}

const stateFromHistory = (item: VisibleFundingHistoryRow): FundingHistoryFormState => ({
  historyId: item.historyId,
  recipientIds: historyRecipientIds(item),
  egcs_ar_agencyname_en: item.agencyNameEn || undefined,
  egcs_ar_agencyname_fr: item.agencyNameFr || undefined,
  egcs_ar_programname_en: item.programNameEn || undefined,
  egcs_ar_programname_fr: item.programNameFr || undefined,
  egcs_ar_agreementnumber: item.agreementNumber,
  egcs_ar_title_en: item.titleEn || undefined,
  egcs_ar_title_fr: item.titleFr || undefined,
  egcs_ar_description_en: item.descriptionEn || undefined,
  egcs_ar_description_fr: item.descriptionFr || undefined,
  egcs_ar_startdate: dateInputValue(item.startDate),
  egcs_ar_enddate: dateInputValue(item.endDate),
  egcs_ar_fundingamount: item.totals[0]?.amount,
  egcs_ar_currency: item.totals[0]?.currency || 'cad',
  confirmations: []
})

watch([open, () => applicantRecipientId, () => history?.historyId ?? history?.rowKey], ([isOpen]) => {
  modal.isOpen.value = false
  errors.value = []
  if (!isOpen) {
    state.value = null
    workflow.value = { kind: 'closed' }
    return
  }

  modal.isOpen.value = true
  state.value = history ? stateFromHistory(history) : newState()
  currentStep.value = 'recipients'
  workflow.value = { kind: 'editing' }
}, { immediate: true, flush: 'sync' })

onScopeDispose(() => {
  workflow.value = { kind: 'disposed' }
  state.value = null
})

const requirementId = useId()

const isBlank = (value?: string): boolean => !value || value.trim().length === 0
const addError = (list: FormError[], name: string, messageKey = 'validation.required') => {
  list.push({ name, message: t(messageKey) })
}

const validateState = (data: FundingHistoryFormState, onlyStep?: FundingHistoryStep): FormError[] => {
  const result: FormError[] = []
  const includes = (step: FundingHistoryStep) => !onlyStep || onlyStep === step || onlyStep === 'review'

  if (includes('recipients')) {
    const recipients = data.recipientIds.filter(Boolean)
    if (recipients.length === 0) addError(result, 'recipientIds')
    if (new Set(recipients).size !== recipients.length) {
      addError(result, 'recipientIds', 'applicant_recipient.funding_history.validation.duplicate_recipient')
    }
  }

  if (includes('agency')) {
    if (isBlank(data.egcs_ar_agencyname_en) && isBlank(data.egcs_ar_agencyname_fr)) {
      addError(result, 'egcs_ar_agencyname_en', 'applicant_recipient.funding_history.validation.bilingual_agency')
    }
  }

  if (includes('program')) {
    if (isBlank(data.egcs_ar_programname_en) && isBlank(data.egcs_ar_programname_fr)) {
      addError(result, 'egcs_ar_programname_en', 'applicant_recipient.funding_history.validation.bilingual_program')
    }
  }

  if (includes('agreement')) {
    if (isBlank(data.egcs_ar_agreementnumber)) addError(result, 'egcs_ar_agreementnumber')
    if (isBlank(data.egcs_ar_title_en) && isBlank(data.egcs_ar_title_fr)) {
      addError(result, 'egcs_ar_title_en', 'applicant_recipient.funding_history.validation.bilingual_title')
    }
    if (isBlank(data.egcs_ar_description_en) && isBlank(data.egcs_ar_description_fr)) {
      addError(result, 'egcs_ar_description_en', 'applicant_recipient.funding_history.validation.bilingual_description')
    }
    if (!data.egcs_ar_startdate) addError(result, 'egcs_ar_startdate')
    if (!data.egcs_ar_enddate) addError(result, 'egcs_ar_enddate')
    if (data.egcs_ar_startdate && data.egcs_ar_enddate && data.egcs_ar_enddate < data.egcs_ar_startdate) {
      addError(result, 'egcs_ar_enddate', 'applicant_recipient.funding_history.validation.end_date')
    }
    const fundingAmount = tryParseMoney(data.egcs_ar_fundingamount)
    if (fundingAmount === null || fundingAmount.currency !== data.egcs_ar_currency?.toUpperCase() || compareMoney(fundingAmount, zeroMoney(fundingAmount.currency)) < 0) {
      addError(result, 'egcs_ar_fundingamount', 'applicant_recipient.funding_history.validation.amount')
    }
    if (!data.egcs_ar_currency) addError(result, 'egcs_ar_currency')
  }

  return result
}

const validate = (data: FundingHistoryFormState): FormError[] => validateState(data)
const errorsByStep = computed(() => stepOrder
  .map(step => ({
    step,
    title: t(`applicant_recipient.funding_history.wizard.steps.${step}.title`),
    count: errors.value.filter(error => fieldStep(error.name) === step).length
  }))
  .filter(item => item.count > 0))
const currentStepErrors = computed(() => errors.value.filter(error => fieldStep(error.name) === currentStep.value))

const fieldStep = (name?: string): FundingHistoryStep => {
  if (name === 'recipientIds') return 'recipients'
  if (name?.includes('agency')) return 'agency'
  if (name?.includes('program')) return 'program'
  return 'agreement'
}

const payload = (data: FundingHistoryFormState) => ({
  recipientIds: data.recipientIds.filter(Boolean),
  egcs_ar_agencyname_en: data.egcs_ar_agencyname_en,
  egcs_ar_agencyname_fr: data.egcs_ar_agencyname_fr,
  egcs_ar_programname_en: data.egcs_ar_programname_en,
  egcs_ar_programname_fr: data.egcs_ar_programname_fr,
  egcs_ar_agreementnumber: data.egcs_ar_agreementnumber,
  egcs_ar_title_en: data.egcs_ar_title_en,
  egcs_ar_title_fr: data.egcs_ar_title_fr,
  egcs_ar_description_en: data.egcs_ar_description_en,
  egcs_ar_description_fr: data.egcs_ar_description_fr,
  egcs_ar_startdate: data.egcs_ar_startdate,
  egcs_ar_enddate: data.egcs_ar_enddate,
  egcs_ar_fundingamount: data.egcs_ar_fundingamount,
  egcs_ar_currency: data.egcs_ar_currency,
  confirmations: data.confirmations
})

const formatFundingAmount = (data: FundingHistoryFormState): string => {
  const amount = tryParseMoney(data.egcs_ar_fundingamount)
  if (amount === null || !data.egcs_ar_currency) return t('common.none')
  return formatMoneyText(amount, locale.value)
}

type FundingHistoryPayload = ReturnType<typeof payload>
type SimilarityFetch = (
  url: string,
  options: {
    method: 'POST'
    body: FundingHistoryPayload & { excludeHistoryId?: string }
  }
) => Promise<FundingHistorySimilarityResponse>
type MutationFetch = (
  url: string,
  options: { method: 'POST' | 'PATCH', body: FundingHistoryPayload }
) => Promise<unknown>

const findErrorCode = (error: unknown): string | undefined => {
  if (!error || typeof error !== 'object') return undefined
  const candidate = error as { data?: { code?: string, statusMessage?: string }, statusMessage?: string }
  return candidate.data?.code || candidate.data?.statusMessage || candidate.statusMessage
}

const checkSimilarity = async (action: WizardAction): Promise<void> => {
  const session = modal.captureSession()
  if (session === null || !state.value || workflow.value.kind !== 'editing') return
  const authority = actionContext.capture()
  if (!authority?.canDispatch()) return
  const operation: WizardOperation = { session, applicantRecipientId, draft: state.value, action, authority }
  if (operation.draft.historyId) {
    await performAction(operation)
    return
  }
  const request: WizardWorkflow = { kind: 'checking', operation }
  workflow.value = request
  try {
    const fetchSimilarity = $fetch as unknown as SimilarityFetch
    const response = await fetchSimilarity(
      `/api/applicant-recipients/${operation.applicantRecipientId}/funding-history/similarity`,
      {
        method: 'POST',
        body: {
          ...payload(operation.draft),
          excludeHistoryId: operation.draft.historyId
        }
      }
    )
    if (!ownsOperation(operation) || workflow.value !== request) return
    const unconfirmed = response.warnings.filter(warning => !operation.draft.confirmations.includes(warning.fingerprint))
    if (unconfirmed.length > 0) {
      workflow.value = { kind: 'warning', operation, warnings: unconfirmed, resume: 'action' }
      return
    }
    await performAction(operation)
  } catch (error: unknown) {
    if (!ownsOperation(operation) || workflow.value !== request) return
    const code = findErrorCode(error)
    if (code?.includes('CONFLICT') || code?.includes('DUPLICATE')) {
      const step = action.kind === 'advance' ? action.step : 'agreement'
      errors.value = [{
        name: step === 'agency'
          ? 'egcs_ar_agencyname_en'
          : step === 'program'
            ? 'egcs_ar_programname_en'
            : 'egcs_ar_agreementnumber',
        message: t('applicant_recipient.funding_history.validation.exact_conflict')
      }]
      return
    }
    showError(error)
  } finally {
    if (workflow.value === request) workflow.value = { kind: 'editing' }
  }
}

const nextStep = async () => {
  if (!state.value || workflow.value.kind !== 'editing') return
  errors.value = validateState(state.value, currentStep.value)
  if (errors.value.length > 0) return
  const action: WizardAction = { kind: 'advance', step: currentStep.value }
  if (currentStep.value === 'agency' || currentStep.value === 'program' || currentStep.value === 'agreement') {
    await checkSimilarity(action)
    return
  }
  currentStep.value = stepOrder[currentStepIndex.value + 1] || currentStep.value
}

const previousStep = () => {
  if (workflow.value.kind !== 'editing') return
  currentStep.value = stepOrder[currentStepIndex.value - 1] || currentStep.value
}

const dismissWarnings = () => {
  if (workflow.value.kind === 'warning' || workflow.value.kind === 'warning_closing') {
    workflow.value = { kind: 'editing' }
  }
}

const confirmWarnings = async () => {
  const warning = workflow.value
  if (warning.kind !== 'warning' && warning.kind !== 'warning_closing') return
  if (!ownsOperation(warning.operation) || !warning.operation.authority.canDispatch()) {
    workflow.value = { kind: 'editing' }
    return
  }
  const data = warning.operation.draft
  data.confirmations = [...new Set([...data.confirmations, ...warning.warnings.map(item => item.fingerprint)])]
  workflow.value = { kind: 'editing' }
  if (warning.resume === 'recheck_save') {
    await checkSimilarity({ kind: 'save' })
    return
  }
  await performAction(warning.operation)
}

const invalidateConfirmations = () => {
  if (state.value) state.value.confirmations = []
  if (workflow.value.kind === 'checking' || workflow.value.kind === 'warning' || workflow.value.kind === 'warning_closing') {
    workflow.value = { kind: 'editing' }
  }
}

const addRecipient = () => {
  state.value?.recipientIds.push('')
}

const removeRecipient = (index: number) => {
  if (!state.value || index === 0) return
  state.value.recipientIds.splice(index, 1)
}

const localized = (english?: string | null, french?: string | null): string => {
  const primary = locale.value === 'fr' ? french : english
  const secondary = locale.value === 'fr' ? english : french
  return primary || secondary || t('common.none')
}

const recipientPrependItems = computed(() => (history?.recipients || []).map(recipient => ({
  value: String(recipient.id),
  label: localized(recipient.labelEn, recipient.labelFr)
})))

const selectedAgencyLabel = computed(() => state.value
  ? localized(state.value.egcs_ar_agencyname_en, state.value.egcs_ar_agencyname_fr)
  : t('common.none'))
const selectedProgramLabel = computed(() => state.value
  ? localized(state.value.egcs_ar_programname_en, state.value.egcs_ar_programname_fr)
  : t('common.none'))

const performAction = async (operation: WizardOperation): Promise<void> => {
  if (!ownsOperation(operation) || !operation.authority.canDispatch()) return
  if (operation.action.kind === 'advance') {
    currentStep.value = stepOrder[stepOrder.indexOf(operation.action.step) + 1] || operation.action.step
    workflow.value = { kind: 'editing' }
    return
  }

  const request: WizardWorkflow = { kind: 'saving', operation }
  workflow.value = request
  const data = operation.draft
  const historyId = data.historyId
  try {
    const url = historyId
      ? `/api/applicant-recipients/${operation.applicantRecipientId}/funding-history/${historyId}`
      : `/api/applicant-recipients/${operation.applicantRecipientId}/funding-history`
    const mutateFundingHistory = $fetch as unknown as MutationFetch
    await mutateFundingHistory(url, {
      method: historyId ? 'PATCH' : 'POST',
      body: payload(data)
    })
    if (modal.isDisposed() || !operation.authority.isCurrent() || applicantRecipientId !== operation.applicantRecipientId) return
    if (!ownsOperation(operation) || workflow.value !== request) {
      emit('saved')
      return
    }
    toast.add({
      title: toast.localized('common.success'),
      description: toast.localized(historyId ? 'common.updated_success' : 'common.created_success'),
      color: 'success'
    })
    open.value = false
    emit('saved')
  } catch (error: unknown) {
    if (!ownsOperation(operation) || workflow.value !== request) return
    const code = findErrorCode(error)
    if (code === 'FUNDING_HISTORY_SIMILARITY_CONFIRMATION_REQUIRED') {
      const response = (error as {
        data?: FundingHistorySimilarityResponse & { details?: Array<{ message?: string }> }
      }).data
      const requiredWarnings = response?.warnings || response?.details?.flatMap((detail) => {
        if (!detail.message) return []
        try {
          return [JSON.parse(detail.message) as FundingHistorySimilarityWarning]
        } catch {
          return []
        }
      }) || []
      workflow.value = { kind: 'warning', operation, warnings: requiredWarnings, resume: 'recheck_save' }
      return
    }
    if (code?.includes('CONFLICT') || code?.includes('DUPLICATE')) {
      errors.value = [{ name: 'egcs_ar_agreementnumber', message: t('applicant_recipient.funding_history.validation.exact_conflict') }]
      currentStep.value = 'agreement'
      return
    }
    showError(error)
  } finally {
    if (workflow.value === request) workflow.value = { kind: 'editing' }
  }
}

const save = async () => {
  if (!state.value || workflow.value.kind !== 'editing') return
  errors.value = validateState(state.value)
  if (errors.value.length > 0) {
    currentStep.value = fieldStep(errors.value[0]?.name)
    return
  }
  await checkSimilarity({ kind: 'save' })
}
const formSession = useFormSession({ owner: modal, action: { kind: 'remote', context: actionContext }, onDenied: () => toast.add({ title: toast.localized('common.warning'), description: toast.localized('workflow.action_prerequisite_unavailable'), color: 'warning' }), submit: save })
</script>

<template>
  <UModal
    v-model:open="open"
    data-help-view="proponent.funding-history-editor"
    :title="t(history ? 'applicant_recipient.funding_history.wizard.edit_title' : 'applicant_recipient.funding_history.wizard.create_title')"
    fullscreen
    :ui="{ content: 'rounded-none shadow-none ring-0' }" data-field-scope="applicant-recipient.funding-history-wizard-modal">
    <template #body>
      <UForm v-if="state" v-bind="formSession" :state="state" :validate="validate" class="flex h-full flex-col lg:flex-row">
        <CommonWizardShell
          :current-step="currentStep"
          :steps="steps"
          :is-first-step="isFirstStep"
          :is-last-step="isLastStep"
          :guidance="currentGuidance"
          :errors="errors"
          :errors-by-step="errorsByStep"
          :current-step-errors="currentStepErrors"
          :cancel-label="t('common.cancel')"
          :previous-label="t('common.previous')"
          :next-label="t('common.next')"
          :submit-label="t(history ? 'common.update' : 'common.create')"
          :guidance-title="t('common.guidance')"
          :error-summary-label="t('applicant_recipient.funding_history.wizard.errors_summary', { count: errors.length })"
          :error-steps-label="t('applicant_recipient.funding_history.wizard.errors_steps')"
          :error-current-step-label="t('applicant_recipient.funding_history.wizard.errors_current_step')"
          :pending="isPending"
          @update:current-step="value => currentStep = value as FundingHistoryStep"
          @cancel="open = false"
          @previous="previousStep"
          @next="nextStep"
          @jump-to-step="value => currentStep = value as FundingHistoryStep">
          <template #default="slotProps">
            <div v-if="slotProps.currentStep === 'recipients'" class="mx-auto max-w-3xl space-y-5">
              <div class="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
                <p class="text-xs font-bold tracking-wider text-zinc-500 uppercase">
                  {{ t('applicant_recipient.funding_history.fields.primary_recipient') }}
                </p>
                <p class="mt-1 font-semibold">
                  {{ applicantRecipientLabel }}
                </p>
              </div>

              <div v-for="(_recipientId, index) in state.recipientIds.slice(1)" :key="index" class="flex items-end gap-2">
                <UFormField class="min-w-0 flex-1" :label="t('applicant_recipient.funding_history.fields.additional_recipient')" :name="`recipientIds.${index + 1}`" data-ui-target="applicant-recipient.funding-history-wizard-modal.recipientIds">
                  <CommonServerLookupSelect
                    v-model="state.recipientIds[index + 1]"
                    :fetch-url="`/api/applicant-recipients/${applicantRecipientId}/funding-history/lookups/recipients`"
                    value-key="id"
                    label-en-key="label_en"
                    label-fr-key="label_fr"
                    :query="{ permission_action: history ? 'update' : 'create' }"
                    :prepend-items="recipientPrependItems"
                    :exclude-values="state.recipientIds.filter((_, recipientIndex) => recipientIndex !== index + 1)"
                    :placeholder="t('applicant_recipient.funding_history.placeholders.recipient')" />
                </UFormField>
                <CommonActionButton
                  icon="i-lucide-x"
                  color="error"
                  variant="ghost"
                  :aria-label="t('common.remove')"
                  @click="removeRecipient(index + 1)" />
              </div>

              <UButton
                color="neutral"
                variant="outline"
                icon="i-lucide-user-plus"
                :label="t('applicant_recipient.funding_history.actions.add_recipient')"
                @click="addRecipient" />
            </div>

            <div v-if="slotProps.currentStep === 'agency'" class="mx-auto max-w-3xl space-y-6">
              <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                <p :id="`${requirementId}-agencyname`" class="text-sm text-muted md:col-span-2">
                  {{ t('applicant_recipient.funding_history.validation.bilingual_agency') }}
                </p>
                <UFormField :label="t('applicant_recipient.funding_history.fields.agency_name_en')" name="egcs_ar_agencyname_en">
                  <UInput v-model="state.egcs_ar_agencyname_en" :aria-describedby="`${requirementId}-agencyname`" @update:model-value="invalidateConfirmations" />
                </UFormField>
                <UFormField :label="t('applicant_recipient.funding_history.fields.agency_name_fr')" name="egcs_ar_agencyname_fr">
                  <UInput v-model="state.egcs_ar_agencyname_fr" :aria-describedby="`${requirementId}-agencyname`" @update:model-value="invalidateConfirmations" />
                </UFormField>
              </div>
            </div>

            <div v-if="slotProps.currentStep === 'program'" class="mx-auto max-w-3xl space-y-6">
              <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                <p :id="`${requirementId}-programname`" class="text-sm text-muted md:col-span-2">
                  {{ t('applicant_recipient.funding_history.validation.bilingual_program') }}
                </p>
                <UFormField :label="t('applicant_recipient.funding_history.fields.program_name_en')" name="egcs_ar_programname_en">
                  <UInput v-model="state.egcs_ar_programname_en" :aria-describedby="`${requirementId}-programname`" @update:model-value="invalidateConfirmations" />
                </UFormField>
                <UFormField :label="t('applicant_recipient.funding_history.fields.program_name_fr')" name="egcs_ar_programname_fr">
                  <UInput v-model="state.egcs_ar_programname_fr" :aria-describedby="`${requirementId}-programname`" @update:model-value="invalidateConfirmations" />
                </UFormField>
              </div>
            </div>

            <div v-if="slotProps.currentStep === 'agreement'" class="mx-auto grid max-w-4xl grid-cols-1 gap-5 md:grid-cols-2">
              <UFormField class="md:col-span-2" :label="t('applicant_recipient.funding_history.fields.agreement_number')" name="egcs_ar_agreementnumber" required>
                <UInput v-model="state.egcs_ar_agreementnumber" @update:model-value="invalidateConfirmations" />
              </UFormField>
              <p :id="`${requirementId}-title`" class="text-sm text-muted md:col-span-2">
                {{ t('applicant_recipient.funding_history.validation.bilingual_title') }}
              </p>
              <UFormField :label="t('applicant_recipient.funding_history.fields.title_en')" name="egcs_ar_title_en">
                <UInput v-model="state.egcs_ar_title_en" :aria-describedby="`${requirementId}-title`" />
              </UFormField>
              <UFormField :label="t('applicant_recipient.funding_history.fields.title_fr')" name="egcs_ar_title_fr">
                <UInput v-model="state.egcs_ar_title_fr" :aria-describedby="`${requirementId}-title`" />
              </UFormField>
              <p :id="`${requirementId}-description`" class="text-sm text-muted md:col-span-2">
                {{ t('applicant_recipient.funding_history.validation.bilingual_description') }}
              </p>
              <UFormField :label="t('applicant_recipient.funding_history.fields.description_en')" name="egcs_ar_description_en">
                <UTextarea v-model="state.egcs_ar_description_en" :aria-describedby="`${requirementId}-description`" autoresize />
              </UFormField>
              <UFormField :label="t('applicant_recipient.funding_history.fields.description_fr')" name="egcs_ar_description_fr">
                <UTextarea v-model="state.egcs_ar_description_fr" :aria-describedby="`${requirementId}-description`" autoresize />
              </UFormField>
              <UFormField :label="t('applicant_recipient.funding_history.fields.start_date')" name="egcs_ar_startdate" required>
                <UInput v-model="state.egcs_ar_startdate" type="date" />
              </UFormField>
              <UFormField :label="t('applicant_recipient.funding_history.fields.end_date')" name="egcs_ar_enddate" required>
                <UInput v-model="state.egcs_ar_enddate" type="date" />
              </UFormField>
              <UFormField :label="t('applicant_recipient.funding_history.fields.amount')" name="egcs_ar_fundingamount" required>
                <CommonCurrencyInput v-model="state.egcs_ar_fundingamount" :currency="state.egcs_ar_currency" />
              </UFormField>
              <UFormField :label="t('applicant_recipient.funding_history.fields.currency')" name="egcs_ar_currency" required>
                <CommonEnumSelect v-model="state.egcs_ar_currency" name="currency_codes" :items="currencyOptions" />
              </UFormField>
            </div>

            <div v-if="slotProps.currentStep === 'review'" class="mx-auto max-w-4xl space-y-6 pb-6">
              <section class="grid grid-cols-1 gap-x-8 gap-y-5 rounded-xl border border-zinc-200 p-6 md:grid-cols-2 dark:border-zinc-800">
                <div>
                  <p class="text-xs font-bold tracking-wider text-zinc-500 uppercase">
                    {{ t('applicant_recipient.funding_history.fields.recipients') }}
                  </p>
                  <p class="mt-1 font-medium">
                    {{ t('applicant_recipient.funding_history.wizard.recipient_count', { count: state.recipientIds.filter(Boolean).length }) }}
                  </p>
                </div>
                <div>
                  <p class="text-xs font-bold tracking-wider text-zinc-500 uppercase">
                    {{ t('applicant_recipient.funding_history.fields.agency') }}
                  </p>
                  <p class="mt-1 font-medium">
                    {{ selectedAgencyLabel }}
                  </p>
                </div>
                <div>
                  <p class="text-xs font-bold tracking-wider text-zinc-500 uppercase">
                    {{ t('applicant_recipient.funding_history.fields.program') }}
                  </p>
                  <p class="mt-1 font-medium">
                    {{ selectedProgramLabel }}
                  </p>
                </div>
                <div>
                  <p class="text-xs font-bold tracking-wider text-zinc-500 uppercase">
                    {{ t('applicant_recipient.funding_history.fields.agreement_number') }}
                  </p>
                  <p class="mt-1 font-mono font-semibold">
                    {{ state.egcs_ar_agreementnumber }}
                  </p>
                </div>
                <div class="md:col-span-2">
                  <p class="text-xs font-bold tracking-wider text-zinc-500 uppercase">
                    {{ t('applicant_recipient.funding_history.fields.title') }}
                  </p>
                  <p class="mt-1 font-medium">
                    {{ localized(state.egcs_ar_title_en, state.egcs_ar_title_fr) }}
                  </p>
                </div>
                <div>
                  <p class="text-xs font-bold tracking-wider text-zinc-500 uppercase">
                    {{ t('applicant_recipient.funding_history.fields.dates') }}
                  </p>
                  <p class="mt-1">
                    {{ state.egcs_ar_startdate }} {{ t('common.to') }} {{ state.egcs_ar_enddate }}
                  </p>
                </div>
                <div>
                  <p class="text-xs font-bold tracking-wider text-zinc-500 uppercase">
                    {{ t('applicant_recipient.funding_history.fields.amount') }}
                  </p>
                  <p class="mt-1 font-semibold">
                    {{ formatFundingAmount(state) }}
                  </p>
                </div>
              </section>
            </div>
          </template>
        </CommonWizardShell>
      </UForm>
    </template>
  </UModal>

  <ApplicantRecipientFundingHistorySimilarityDialog
    v-model:open="isWarningOpen"
    :warnings="warnings"
    data-field-scope="applicant-recipient.funding-history-wizard-modal"
    @confirm="confirmWarnings" @back="dismissWarnings" />
</template>
