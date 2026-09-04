<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- local wizard event helpers are self-documenting and not public APIs */
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { FormError, FormSubmitEvent } from '#ui/types'
import type {
  FundingHistoryFormState,
  FundingHistorySimilarityResponse,
  FundingHistorySimilarityWarning,
  VisibleFundingHistoryRow
} from '~/types/funding-history'
import { compareMoney, formatMoneyText, parseMoney, type Money } from '~~/shared/utils/money'

const {
  applicantRecipientId,
  applicantRecipientLabel,
  history = null
} = defineProps<{
  applicantRecipientId: string
  applicantRecipientLabel: string
  history?: VisibleFundingHistoryRow | null
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  saved: []
}>()

const { t, locale } = useI18n()
const { showError } = useApiErrorToast()
const toast = useToast()
const { items: allCurrencyOptions } = useEnumSelectOptions({ name: () => 'currency_codes' })
const currencyOptions = computed(() => allCurrencyOptions.value.filter(option => option.value !== 'all'))
const ZERO_MONEY = parseMoney('0')
const tryParseMoney = (value: string | undefined): Money | null => {
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
const isSaving: Ref<boolean> = ref(false)
const isCheckingSimilarity: Ref<boolean> = ref(false)
const isPending = computed(() => isSaving.value || isCheckingSimilarity.value)
const warnings: Ref<FundingHistorySimilarityWarning[]> = ref([])
const isWarningOpen: Ref<boolean> = ref(false)
let continueAfterWarning: (() => Promise<void> | void) | null = null

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
  egcs_ar_fundingamount: item.totals[0]?.amount ?? '0.00',
  egcs_ar_currency: item.totals[0]?.currency || 'cad',
  confirmations: []
})

watch(open, isOpen => {
  if (!isOpen) {
    state.value = null
    errors.value = []
    warnings.value = []
    isWarningOpen.value = false
    continueAfterWarning = null
    return
  }

  state.value = history ? stateFromHistory(history) : newState()
  currentStep.value = 'recipients'
})

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
    if (fundingAmount === null || compareMoney(fundingAmount, ZERO_MONEY) < 0) {
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
  return formatMoneyText(amount, locale.value, data.egcs_ar_currency.toUpperCase())
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

const checkSimilarity = async (continuation: () => Promise<void> | void): Promise<void> => {
  if (!state.value) return
  isCheckingSimilarity.value = true
  try {
    const fetchSimilarity = $fetch as unknown as SimilarityFetch
    const response = await fetchSimilarity(
      `/api/applicant-recipients/${applicantRecipientId}/funding-history/similarity`,
      {
        method: 'POST',
        body: {
          ...payload(state.value),
          excludeHistoryId: state.value.historyId
        }
      }
    )
    const unconfirmed = response.warnings.filter(warning => !state.value?.confirmations.includes(warning.fingerprint))
    if (unconfirmed.length > 0) {
      warnings.value = unconfirmed
      continueAfterWarning = continuation
      isWarningOpen.value = true
      return
    }
    await continuation()
  } catch (error: unknown) {
    const code = findErrorCode(error)
    if (code?.includes('CONFLICT') || code?.includes('DUPLICATE')) {
      errors.value = [{
        name: currentStep.value === 'agency'
          ? 'egcs_ar_agencyname_en'
          : currentStep.value === 'program'
            ? 'egcs_ar_programname_en'
            : 'egcs_ar_agreementnumber',
        message: t('applicant_recipient.funding_history.validation.exact_conflict')
      }]
      return
    }
    showError(error)
  } finally {
    isCheckingSimilarity.value = false
  }
}

const nextStep = async () => {
  if (!state.value || isPending.value) return
  errors.value = validateState(state.value, currentStep.value)
  if (errors.value.length > 0) return
  const advance = () => {
    currentStep.value = stepOrder[currentStepIndex.value + 1] || currentStep.value
  }
  if (currentStep.value === 'agency' || currentStep.value === 'program' || currentStep.value === 'agreement') {
    await checkSimilarity(advance)
    return
  }
  advance()
}

const previousStep = () => {
  currentStep.value = stepOrder[currentStepIndex.value - 1] || currentStep.value
}

const confirmWarnings = async () => {
  if (!state.value) return
  state.value.confirmations = [...new Set([...state.value.confirmations, ...warnings.value.map(warning => warning.fingerprint)])]
  warnings.value = []
  const continuation = continueAfterWarning
  continueAfterWarning = null
  await continuation?.()
}

const invalidateConfirmations = () => {
  if (state.value) state.value.confirmations = []
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

const save = async (_event: FormSubmitEvent<FundingHistoryFormState>) => {
  if (!state.value || isPending.value) return
  errors.value = validateState(state.value)
  if (errors.value.length > 0) {
    currentStep.value = fieldStep(errors.value[0]?.name)
    return
  }

  await checkSimilarity(async () => {
    if (!state.value) return
    isSaving.value = true
    try {
      const url = state.value.historyId
        ? `/api/applicant-recipients/${applicantRecipientId}/funding-history/${state.value.historyId}`
        : `/api/applicant-recipients/${applicantRecipientId}/funding-history`
      const mutateFundingHistory = $fetch as unknown as MutationFetch
      await mutateFundingHistory(url, {
        method: state.value.historyId ? 'PATCH' : 'POST',
        body: payload(state.value)
      })
      toast.add({
        title: t('common.success'),
        description: t(state.value.historyId ? 'common.updated_success' : 'common.created_success'),
        color: 'success'
      })
      open.value = false
      emit('saved')
    } catch (error: unknown) {
      const code = findErrorCode(error)
      if (code === 'FUNDING_HISTORY_SIMILARITY_CONFIRMATION_REQUIRED') {
        const response = (error as {
          data?: FundingHistorySimilarityResponse & { details?: Array<{ message?: string }> }
        }).data
        warnings.value = response?.warnings || response?.details?.flatMap((detail) => {
          if (!detail.message) return []
          try {
            return [JSON.parse(detail.message) as FundingHistorySimilarityWarning]
          } catch {
            return []
          }
        }) || []
        continueAfterWarning = () => save({ data: state.value as FundingHistoryFormState } as FormSubmitEvent<FundingHistoryFormState>)
        isWarningOpen.value = true
        return
      }
      if (code?.includes('CONFLICT') || code?.includes('DUPLICATE')) {
        errors.value = [{ name: 'egcs_ar_agreementnumber', message: t('applicant_recipient.funding_history.validation.exact_conflict') }]
        currentStep.value = 'agreement'
        return
      }
      showError(error)
    } finally {
      isSaving.value = false
    }
  })
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t(history ? 'applicant_recipient.funding_history.wizard.edit_title' : 'applicant_recipient.funding_history.wizard.create_title')"
    fullscreen
    :ui="{ content: 'rounded-none shadow-none ring-0' }">
    <template #body>
      <UForm v-if="state" :state="state" :validate="validate" class="flex h-full flex-col lg:flex-row" @submit="save">
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
                <UFormField class="min-w-0 flex-1" :label="t('applicant_recipient.funding_history.fields.additional_recipient')" :name="`recipientIds.${index + 1}`">
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
                <UButton
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
                <UFormField :label="t('applicant_recipient.funding_history.fields.agency_name_en')" name="egcs_ar_agencyname_en">
                  <UInput v-model="state.egcs_ar_agencyname_en" @update:model-value="invalidateConfirmations" />
                </UFormField>
                <UFormField :label="t('applicant_recipient.funding_history.fields.agency_name_fr')" name="egcs_ar_agencyname_fr">
                  <UInput v-model="state.egcs_ar_agencyname_fr" @update:model-value="invalidateConfirmations" />
                </UFormField>
              </div>
            </div>

            <div v-if="slotProps.currentStep === 'program'" class="mx-auto max-w-3xl space-y-6">
              <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                <UFormField :label="t('applicant_recipient.funding_history.fields.program_name_en')" name="egcs_ar_programname_en">
                  <UInput v-model="state.egcs_ar_programname_en" @update:model-value="invalidateConfirmations" />
                </UFormField>
                <UFormField :label="t('applicant_recipient.funding_history.fields.program_name_fr')" name="egcs_ar_programname_fr">
                  <UInput v-model="state.egcs_ar_programname_fr" @update:model-value="invalidateConfirmations" />
                </UFormField>
              </div>
            </div>

            <div v-if="slotProps.currentStep === 'agreement'" class="mx-auto grid max-w-4xl grid-cols-1 gap-5 md:grid-cols-2">
              <UFormField class="md:col-span-2" :label="t('applicant_recipient.funding_history.fields.agreement_number')" name="egcs_ar_agreementnumber">
                <UInput v-model="state.egcs_ar_agreementnumber" @update:model-value="invalidateConfirmations" />
              </UFormField>
              <UFormField :label="t('applicant_recipient.funding_history.fields.title_en')" name="egcs_ar_title_en">
                <UInput v-model="state.egcs_ar_title_en" />
              </UFormField>
              <UFormField :label="t('applicant_recipient.funding_history.fields.title_fr')" name="egcs_ar_title_fr">
                <UInput v-model="state.egcs_ar_title_fr" />
              </UFormField>
              <UFormField :label="t('applicant_recipient.funding_history.fields.description_en')" name="egcs_ar_description_en">
                <UTextarea v-model="state.egcs_ar_description_en" autoresize />
              </UFormField>
              <UFormField :label="t('applicant_recipient.funding_history.fields.description_fr')" name="egcs_ar_description_fr">
                <UTextarea v-model="state.egcs_ar_description_fr" autoresize />
              </UFormField>
              <UFormField :label="t('applicant_recipient.funding_history.fields.start_date')" name="egcs_ar_startdate">
                <UInput v-model="state.egcs_ar_startdate" type="date" />
              </UFormField>
              <UFormField :label="t('applicant_recipient.funding_history.fields.end_date')" name="egcs_ar_enddate">
                <UInput v-model="state.egcs_ar_enddate" type="date" />
              </UFormField>
              <UFormField :label="t('applicant_recipient.funding_history.fields.amount')" name="egcs_ar_fundingamount">
                <UInput v-model="state.egcs_ar_fundingamount" inputmode="decimal" />
              </UFormField>
              <UFormField :label="t('applicant_recipient.funding_history.fields.currency')" name="egcs_ar_currency">
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
    @confirm="confirmWarnings"
    @back="continueAfterWarning = null" />
</template>
