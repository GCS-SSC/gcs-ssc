/* eslint-disable jsdoc/require-jsdoc -- Wizard helpers use typed contracts covered by focused composable tests. */
import { nanoid } from 'nanoid'
import type { FormError } from '#ui/types'
import { toValue } from 'vue'
import type { MaybeRefOrGetter, Ref } from 'vue'
import {
  TransferPaymentWizardSchema,
  type AgencyFiscalYearItem,
  type TransferPaymentWizard
} from '~~/shared/types/schemas'
import { useAgencyOptions } from '~/composables/useAgencyOptions'
import { useWizardFlow, type WizardStepItem } from '~/composables/useWizardFlow'

export type TransferPaymentWizardStepValue =
  | 'general'
  | 'outcomes'
  | 'objectives'
  | 'budgets'
  | 'performance'
  | 'review'

type TransferPaymentWizardForm = Omit<TransferPaymentWizard, 'profile' | 'budgets'> & {
  profile: Omit<TransferPaymentWizard['profile'], 'egcs_tp_datestart' | 'egcs_tp_dateend'> & {
    egcs_tp_datestart: string | Date
    egcs_tp_dateend: string | Date
  }
  budgets: Array<Omit<TransferPaymentWizard['budgets'][number], 'egcs_tp_totalbudget'> & {
    egcs_tp_totalbudget: string
  }>
}

const guidanceKeyByStep: Record<TransferPaymentWizardStepValue, string> = {
  general: 'transfer_payment.wizard.guidance_1',
  outcomes: 'transfer_payment.wizard.guidance_2',
  objectives: 'transfer_payment.wizard.guidance_3',
  budgets: 'transfer_payment.wizard.guidance_4',
  performance: 'transfer_payment.wizard.guidance_5',
  review: 'transfer_payment.wizard.guidance_6'
}

export const resolveTransferPaymentWizardStep = (name?: string): TransferPaymentWizardStepValue => {
  const fieldPath = name ?? ''
  if (fieldPath.startsWith('outcomes.')) return 'outcomes'
  if (fieldPath.startsWith('objectives.')) return 'objectives'
  if (fieldPath.startsWith('budgets.')) return 'budgets'
  if (fieldPath.startsWith('performanceIndicators.')) return 'performance'
  return 'general'
}

export const createTransferPaymentWizardInitialState = (
  defaultAgencyId: string,
  currentDate: Date = new Date()
): TransferPaymentWizardForm => {
  const now = new Date(currentDate)
  const nextYear = new Date(currentDate)
  nextYear.setFullYear(currentDate.getFullYear() + 1)

  return {
    profile: {
      egcs_tp_agency: defaultAgencyId,
      egcs_tp_name_en: '',
      egcs_tp_name_fr: '',
      egcs_tp_abbreviation_en: '',
      egcs_tp_abbreviation_fr: '',
      egcs_tp_datestart: now,
      egcs_tp_dateend: nextYear,
      egcs_tp_tclink: '',
      egcs_tp_description_en: '',
      egcs_tp_description_fr: '',
      egcs_tp_purpose_en: '',
      egcs_tp_purpose_fr: '',
      egcs_tp_active: false
    },
    outcomes: [],
    objectives: [],
    budgets: [],
    performanceIndicators: []
  }
}

interface UseTransferPaymentWizardModalOptions {
  open: Ref<boolean>
  fixedAgencyId?: MaybeRefOrGetter<string | undefined>
}

export const useTransferPaymentWizardModal = ({
  open,
  fixedAgencyId
}: UseTransferPaymentWizardModalOptions) => {
  const { t } = useI18n()
  const { createValidator } = useZodI18n()
  const { parseDateInput, toDateInput } = useDateHelpers()
  const { getBilingualValue } = useBilingualValue()

  const resolvedDefaultAgencyId = computed(() => toValue(fixedAgencyId) ?? '')

  const state: Ref<TransferPaymentWizardForm | null> = ref(null)
  const wizardErrors: Ref<FormError[]> = ref([])

  const steps = computed<WizardStepItem<TransferPaymentWizardStepValue>[]>(() => [
    {
      value: 'general',
      title: t('transfer_payment.wizard.step_1'),
      description: t('transfer_payment.wizard.step_1_desc'),
      icon: 'i-lucide-info'
    },
    {
      value: 'outcomes',
      title: t('transfer_payment.wizard.step_2'),
      description: t('transfer_payment.wizard.step_2_desc'),
      icon: 'i-lucide-target'
    },
    {
      value: 'objectives',
      title: t('transfer_payment.wizard.step_3'),
      description: t('transfer_payment.wizard.step_3_desc'),
      icon: 'i-lucide-goal'
    },
    {
      value: 'budgets',
      title: t('transfer_payment.wizard.step_4'),
      description: t('transfer_payment.wizard.step_4_desc'),
      icon: 'i-lucide-banknote'
    },
    {
      value: 'performance',
      title: t('transfer_payment.wizard.step_5'),
      description: t('transfer_payment.wizard.step_5_desc'),
      icon: 'i-lucide-line-chart'
    },
    {
      value: 'review',
      title: t('transfer_payment.wizard.step_6'),
      description: t('transfer_payment.wizard.step_6_desc'),
      icon: 'i-lucide-check-check'
    }
  ])

  const {
    currentStep,
    isFirstStep,
    isLastStep,
    nextStep,
    prevStep,
    goToStep,
    reset,
    errorsByStep,
    currentStepErrors
  } = useWizardFlow<TransferPaymentWizardStepValue>({
    steps,
    initialStep: 'general',
    errors: wizardErrors,
    resolveStepForField: resolveTransferPaymentWizardStep,
    excludedErrorSummarySteps: ['review']
  })

  const selectedAgencyId = computed(() => state.value?.profile.egcs_tp_agency ?? resolvedDefaultAgencyId.value)
  const { agencies } = useAgencyOptions({ selectedAgencyId })
  const selectedAgency = computed(() =>
    agencies.value.find(agency => String(agency.id) === state.value?.profile.egcs_tp_agency)
  )
  const isAgencyLocked = computed(() => Boolean(toValue(fixedAgencyId)))

  const { data: fiscalYearsResponse } = useAgencyReferenceData<AgencyFiscalYearItem>({
    agencyId: computed(() => state.value?.profile.egcs_tp_agency ?? ''),
    buildUrl: id => `/api/agency/${id}/fiscal-years`
  })
  const fiscalYears = computed(() => fiscalYearsResponse.value?.items ?? [])
  const fiscalYearLabelById = computed(
    () => new Map(fiscalYears.value.map((item: AgencyFiscalYearItem) => [String(item.id), item.egcs_ay_fiscalyeardisplay]))
  )

  const initializeState = () => {
    state.value = createTransferPaymentWizardInitialState(resolvedDefaultAgencyId.value)
    reset()
    wizardErrors.value = []
  }

  const clearState = () => {
    wizardErrors.value = []
    state.value = null
  }

  const addOutcome = () => {
    if (!state.value) return

    state.value.outcomes.push({
      tempId: nanoid(),
      egcs_tp_name_en: '',
      egcs_tp_name_fr: '',
      egcs_tp_description_en: '',
      egcs_tp_description_fr: ''
    })
  }

  const removeOutcome = (index: number) => {
    if (!state.value) return

    const removedOutcome = state.value.outcomes[index]
    if (!removedOutcome) return

    state.value.outcomes.splice(index, 1)
    state.value.performanceIndicators = state.value.performanceIndicators.filter(
      performanceIndicator => performanceIndicator.tempOutcomeId !== removedOutcome.tempId
    )
  }

  const addObjective = () => {
    if (!state.value) return

    state.value.objectives.push({
      tempId: nanoid(),
      egcs_tp_objective_en: '',
      egcs_tp_objective_fr: ''
    })
  }

  const removeObjective = (index: number) => {
    if (!state.value) return

    state.value.objectives.splice(index, 1)
  }

  const addBudget = () => {
    if (!state.value) return

    state.value.budgets.push({
      tempId: nanoid(),
      egcs_tp_fiscalyear: '',
      egcs_tp_totalbudget: '0',
      egcs_tp_overcommitthreshold: 0
    })
  }

  const removeBudget = (index: number) => {
    if (!state.value) return

    state.value.budgets.splice(index, 1)
  }

  const addPerformanceIndicator = () => {
    if (!state.value) return

    const defaultOutcome = state.value.outcomes[0]
    if (!defaultOutcome) return

    state.value.performanceIndicators.push({
      tempId: nanoid(),
      tempOutcomeId: defaultOutcome.tempId,
      egcs_tp_name_en: '',
      egcs_tp_name_fr: '',
      egcs_tp_description_en: '',
      egcs_tp_description_fr: ''
    })
  }

  const removePerformanceIndicator = (index: number) => {
    if (!state.value) return

    state.value.performanceIndicators.splice(index, 1)
  }

  const validateWizardSchema = createValidator(TransferPaymentWizardSchema)

  const validateWizard = async (wizardState: TransferPaymentWizardForm) => {
    clearErrors()
    const result = await validateWizardSchema(wizardState)
    wizardErrors.value = result
    return result
  }

  const clearErrors = () => {
    wizardErrors.value = []
  }

  const currentGuidance = computed(() => t(guidanceKeyByStep[currentStep.value]))

  watch(
    () => state.value?.profile.egcs_tp_agency,
    (agencyId, previousAgencyId) => {
      if (!state.value) return
      if (!agencyId || agencyId === previousAgencyId || previousAgencyId === undefined || previousAgencyId === '') return
      if (state.value.budgets.length === 0) return

      state.value.budgets = []
    }
  )

  watch(
    open,
    isOpen => {
      if (isOpen) {
        initializeState()
        return
      }

      clearState()
    },
    { immediate: true }
  )

  watch(
    resolvedDefaultAgencyId,
    agencyId => {
      if (!open.value || !state.value || !agencyId) return
      if (!state.value.profile.egcs_tp_agency) {
        state.value.profile.egcs_tp_agency = agencyId
      }
    },
    { immediate: true }
  )

  const getOutcomeLabel = (outcome: TransferPaymentWizard['outcomes'][number]) => {
    return getBilingualValue(outcome, 'egcs_tp_name', t('common.none'))
  }

  const getObjectiveLabel = (objective: TransferPaymentWizard['objectives'][number]) => {
    return getBilingualValue(objective, 'egcs_tp_objective', t('common.none'))
  }

  const getPerformanceIndicatorLabel = (indicator: TransferPaymentWizard['performanceIndicators'][number]) => {
    return getBilingualValue(indicator, 'egcs_tp_name', t('common.none'))
  }

  const getLinkedOutcomeLabel = (tempOutcomeId: string) => {
    if (!state.value) return t('common.none')

    const outcome = state.value.outcomes.find(item => item.tempId === tempOutcomeId)
    if (!outcome) return t('common.none')

    return getOutcomeLabel(outcome)
  }

  const updateStartDate = (value: string) => {
    if (!state.value) return
    if (value === '') {
      state.value.profile.egcs_tp_datestart = ''
      return
    }

    const parsedDate = parseDateInput(value)
    if (!parsedDate) return

    state.value.profile.egcs_tp_datestart = parsedDate
  }

  const updateEndDate = (value: string) => {
    if (!state.value) return
    if (value === '') {
      state.value.profile.egcs_tp_dateend = ''
      return
    }

    const parsedDate = parseDateInput(value)
    if (!parsedDate) return

    state.value.profile.egcs_tp_dateend = parsedDate
  }

  const getSelectedAgencyLabel = () => {
    const agency = selectedAgency.value
    return getBilingualValue(agency, 'egcs_ay_name', t('common.none'))
  }

  const onCurrentStepUpdate = (step: string) => {
    goToStep(step as TransferPaymentWizardStepValue)
  }

  return {
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
  }
}
