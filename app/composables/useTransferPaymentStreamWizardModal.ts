/* eslint-disable jsdoc/require-jsdoc -- wizard callbacks use self-descriptive local signatures */
import { nanoid } from 'nanoid'
import type { FormError } from '#ui/types'
import type { FetchError } from 'ofetch'
import type { Ref } from 'vue'
import type {
  AgencyAgreementTypeItem,
  AgencyHoldbackBasisItem,
  AgencyApplicantRecipientSubtypeItem,
  AgencyCostCategoryLineItemItem,
  TransferPaymentBudgetItem,
  TransferPaymentStreamPolymorphicWizard
} from '~~/shared/types/schemas'
import {
  TransferPaymentStreamPolymorphicWizardSchema
} from '~~/shared/types/schemas'
import { useWizardFlow, type WizardStepItem } from '~/composables/useWizardFlow'
import { formatMoneyText, parseMoney } from '~~/shared/utils/money'

interface ProgramBudgetOption extends TransferPaymentBudgetItem, Record<string, unknown> {
  fiscal_year_display?: string
}

type StreamBudgetState = Omit<TransferPaymentStreamPolymorphicWizard['budgets'][number], 'egcs_tp_totalbudget'> & {
  egcs_tp_totalbudget: string
}
type StreamFinancialLimitState = Omit<NonNullable<TransferPaymentStreamPolymorphicWizard['financialLimit']>,
  'egcs_tp_maxallowableperrecipient'> & {
    egcs_tp_maxallowableperrecipient: string
  }
type TransferPaymentStreamWizardForm = Omit<TransferPaymentStreamPolymorphicWizard, 'budgets' | 'financialLimit'> & {
  budgets: StreamBudgetState[]
  financialLimit?: StreamFinancialLimitState | null
}

export type TransferPaymentStreamWizardStepValue =
  | 'general'
  | 'holdback-bases'
  | 'budgets'
  | 'recipients'
  | 'cost-lines'
  | 'amendment-types'
  | 'amendment-subtypes'
  | 'agreement-subtypes'
  | 'chart-of-accounts'
  | 'commitment-types'
  | 'monitor-types'
  | 'areas'
  | 'financial-limits'
  | 'review'

const guidanceKeyByStep: Record<TransferPaymentStreamWizardStepValue, string> = {
  'general': 'transfer_payment.stream_wizard.guidance_1',
  'holdback-bases': 'transfer_payment.stream_wizard.guidance_2',
  'budgets': 'transfer_payment.stream_wizard.guidance_3',
  'recipients': 'transfer_payment.stream_wizard.guidance_4',
  'cost-lines': 'transfer_payment.stream_wizard.guidance_5',
  'amendment-types': 'transfer_payment.stream_wizard.guidance_6',
  'amendment-subtypes': 'transfer_payment.stream_wizard.guidance_7',
  'agreement-subtypes': 'transfer_payment.stream_wizard.guidance_8',
  'chart-of-accounts': 'transfer_payment.stream_wizard.guidance_9',
  'commitment-types': 'transfer_payment.commitment_types.description',
  'monitor-types': 'transfer_payment.stream_wizard.guidance_10',
  'areas': 'transfer_payment.stream_wizard.guidance_11',
  'financial-limits': 'transfer_payment.stream_wizard.guidance_12',
  'review': 'transfer_payment.stream_wizard.guidance_13'
}

const stepPrefixToStep: Record<string, TransferPaymentStreamWizardStepValue> = {
  'stream.': 'general',
  'holdbackBases.': 'holdback-bases',
  'budgets.': 'budgets',
  'eligibleRecipients.': 'recipients',
  'costCategoryLineItems.': 'cost-lines',
  'amendmentTypes.': 'amendment-types',
  'amendmentSubtypes.': 'amendment-subtypes',
  'agreementSubtypes.': 'agreement-subtypes',
  'chartOfAccounts.': 'chart-of-accounts',
  'commitmentTypes.': 'commitment-types',
  'monitorTypes.': 'monitor-types',
  'areasOfExpertise.': 'areas',
  'financialLimit.': 'financial-limits'
}

export const resolveTransferPaymentStreamWizardStep = (
  name?: string
): TransferPaymentStreamWizardStepValue => {
  const fieldPath = name ?? ''

  for (const [prefix, step] of Object.entries(stepPrefixToStep)) {
    if (fieldPath.startsWith(prefix)) {
      return step
    }
  }

  return 'general'
}

export const createTransferPaymentStreamWizardInitialState = (): TransferPaymentStreamWizardForm => ({
  // These fields are string-bound in form controls and schema validation, so they intentionally
  // start as empty strings rather than null to keep validation and v-model behavior stable.
  stream: {
    egcs_tp_parentstream: null,
    egcs_tp_name_en: '',
    egcs_tp_name_fr: '',
    egcs_tp_description_en: '',
    egcs_tp_description_fr: '',
    egcs_tp_abbreviation_en: '',
    egcs_tp_abbreviation_fr: '',
    egcs_tp_objective_en: '',
    egcs_tp_objective_fr: '',
    egcs_tp_allowsfurtherdistribution: false,
    egcs_tp_active: false
  },
  holdbackBases: [],
  budgets: [],
  eligibleRecipients: [],
  costCategoryLineItems: [],
  amendmentTypes: [],
  amendmentSubtypes: [],
  agreementSubtypes: [],
  chartOfAccounts: [],
  commitmentTypes: [],
  monitorTypes: [],
  areasOfExpertise: [],
  financialLimit: null,
  reviewSetups: [],
  recommendationSetups: []
})

interface UseTransferPaymentStreamWizardModalOptions {
  open: Ref<boolean>
  programId: string
  agencyId?: string | null
}

type WizardListKey = {
  [K in keyof TransferPaymentStreamWizardForm]: TransferPaymentStreamWizardForm[K] extends Array<unknown>
    ? K
    : never
}[keyof TransferPaymentStreamWizardForm] & keyof TransferPaymentStreamWizardForm

type WizardListItem<K extends WizardListKey> =
  TransferPaymentStreamWizardForm[K] extends Array<infer Item> ? Item : never

export const useTransferPaymentStreamWizardModal = ({
  open,
  programId,
  agencyId
}: UseTransferPaymentStreamWizardModalOptions) => {
  const { t, locale } = useI18n()
  const toast = useToast()
  const { createValidator } = useZodI18n()
  const { getBilingualValue } = useBilingualValue()

  const state: Ref<TransferPaymentStreamWizardForm | null> = ref(null)
  const wizardErrors: Ref<FormError[]> = ref([])
  const isReferenceDataLoading: Ref<boolean> = ref(false)
  const latestReferenceLoadId: Ref<number> = ref(0)

  const steps = computed<WizardStepItem<TransferPaymentStreamWizardStepValue>[]>(() => [
    { value: 'general', title: t('transfer_payment.stream_wizard.step_1'), icon: 'i-lucide-layers' },
    { value: 'holdback-bases', title: t('transfer_payment.stream_wizard.step_2'), icon: 'i-lucide-percent' },
    { value: 'budgets', title: t('transfer_payment.stream_wizard.step_3'), icon: 'i-lucide-wallet' },
    { value: 'recipients', title: t('transfer_payment.stream_wizard.step_4'), icon: 'i-lucide-users' },
    { value: 'cost-lines', title: t('transfer_payment.stream_wizard.step_5'), icon: 'i-lucide-list' },
    { value: 'amendment-types', title: t('transfer_payment.stream_wizard.step_6'), icon: 'i-lucide-file-edit' },
    { value: 'amendment-subtypes', title: t('transfer_payment.stream_wizard.step_7'), icon: 'i-lucide-files' },
    { value: 'agreement-subtypes', title: t('transfer_payment.stream_wizard.step_8'), icon: 'i-lucide-file-stack' },
    { value: 'chart-of-accounts', title: t('transfer_payment.stream_wizard.step_9'), icon: 'i-lucide-table-properties' },
    { value: 'commitment-types', title: t('transfer_payment.commitment_types.title'), icon: 'i-lucide-tags' },
    { value: 'monitor-types', title: t('transfer_payment.stream_wizard.step_10'), icon: 'i-lucide-clipboard-check' },
    { value: 'areas', title: t('transfer_payment.stream_wizard.step_11'), icon: 'i-lucide-brain-circuit' },
    { value: 'financial-limits', title: t('transfer_payment.stream_wizard.step_12'), icon: 'i-lucide-dollar-sign' },
    { value: 'review', title: t('transfer_payment.stream_wizard.step_13'), icon: 'i-lucide-check-check' }
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
  } = useWizardFlow<TransferPaymentStreamWizardStepValue>({
    steps,
    initialStep: 'general',
    errors: wizardErrors,
    resolveStepForField: resolveTransferPaymentStreamWizardStep,
    excludedErrorSummarySteps: ['review']
  })

  const {
    data: parentStreamsResponse,
    error: parentStreamsError,
    refresh: refreshParentStreams
  } = useFetch<{
    items: Array<{ id: string, egcs_tp_name_en: string, egcs_tp_name_fr: string }>
  }, FetchError, string>(`/api/transfer-payments/${programId}/streams`, {
    query: {
      page: 1,
      limit: 100
    },
    immediate: false
  })
  const parentStreams = computed(() => parentStreamsResponse.value?.items ?? [])

  const {
    data: budgetsResponse,
    error: budgetsError,
    refresh: refreshBudgets
  } = useFetch<{ items: ProgramBudgetOption[] }, FetchError, string>(`/api/transfer-payments/${programId}/budgets`, {
    query: {
      page: 1,
      limit: 100
    },
    immediate: false
  })
  const budgets = computed(() => budgetsResponse.value?.items ?? [])
  const budgetLabelById = computed(
    () =>
      new Map(
        budgets.value.map((item: ProgramBudgetOption) => [
          String(item.id),
          String(item.fiscal_year_display ?? item.egcs_tp_fiscalyear ?? item.id)
        ])
      )
  )
  const chartOfAccountBudgetOptions = computed(() => (state.value?.budgets ?? []).map(budget => ({
    label: budgetLabelById.value.get(String(budget.egcs_tp_transferpaymentbudget)) ?? String(budget.egcs_tp_transferpaymentbudget),
    value: budget.tempId
  })))

  const {
    data: applicantRecipientResponse,
    error: applicantRecipientError,
    refresh: refreshApplicantRecipientOptions
  } =
    useAgencyReferenceData<AgencyApplicantRecipientSubtypeItem>({
      agencyId: computed(() => (open.value ? agencyId ?? '' : '')),
      buildUrl: id => `/api/agency/${id}/applicant-recipient-subtypes`,
      query: { page: 1, limit: 100 }
    })
  const applicantRecipientOptions = computed(() => applicantRecipientResponse.value?.items ?? [])

  const {
    data: lineItemResponse,
    error: lineItemError,
    refresh: refreshLineItemOptions
  } =
    useAgencyReferenceData<AgencyCostCategoryLineItemItem>({
      agencyId: computed(() => (open.value ? agencyId ?? '' : '')),
      buildUrl: id => `/api/agency/${id}/line-items`,
      query: { page: 1, limit: 100 }
    })
  const lineItemOptions = computed(() => lineItemResponse.value?.items ?? [])

  const {
    data: agreementTypeResponse,
    error: agreementTypeError,
    refresh: refreshAgreementTypeOptions
  } =
    useAgencyReferenceData<AgencyAgreementTypeItem>({
      agencyId: computed(() => (open.value ? agencyId ?? '' : '')),
      buildUrl: id => `/api/agency/${id}/agreement-types`,
      query: { page: 1, limit: 100 }
    })
  const agreementTypeOptions = computed(() => agreementTypeResponse.value?.items ?? [])

  const {
    data: agencyHoldbackResponse,
    error: agencyHoldbackError,
    refresh: refreshAgencyHoldbackOptions
  } = useAgencyReferenceData<AgencyHoldbackBasisItem>({
    agencyId: computed(() => (open.value ? agencyId ?? '' : '')),
    buildUrl: id => `/api/agency/${id}/holdback-bases`,
    query: { page: 1, limit: 100 }
  })
  const agencyHoldbackOptions = computed(() => agencyHoldbackResponse.value?.items ?? [])

  const clearErrors = () => {
    wizardErrors.value = []
  }

  const addListItem = <K extends WizardListKey>(key: K, createItem: () => WizardListItem<K>) => {
    if (!state.value) return

    const list = state.value[key] as WizardListItem<K>[]
    list.push(createItem())
  }

  const removeListItem = <K extends WizardListKey>(
    key: K,
    index: number
  ): WizardListItem<K> | undefined => {
    if (!state.value) return undefined

    const list = state.value[key] as WizardListItem<K>[]
    const [removed] = list.splice(index, 1)
    return removed
  }

  const addBudget = () => {
    addListItem('budgets', () => ({
      tempId: nanoid(),
      egcs_tp_transferpaymentbudget: '',
      egcs_tp_totalbudget: '0',
      egcs_tp_overcommitthreshold: 0
    }))
  }

  const onBudgetModelUpdate = (index: number, updatedBudget: Partial<StreamBudgetState>) => {
    if (!state.value) return

    const currentBudget = state.value.budgets[index]
    if (!currentBudget) return

    state.value.budgets[index] = {
      ...currentBudget,
      ...updatedBudget
    }
  }

  const removeBudget = (index: number) => {
    const removedBudget = removeListItem('budgets', index)
    if (!removedBudget || !state.value) return
    state.value.chartOfAccounts = state.value.chartOfAccounts.filter(
      chartOfAccount => chartOfAccount.tempStreamBudgetId !== removedBudget.tempId
    )
  }

  const addHoldbackBasis = () => {
    addListItem('holdbackBases', () => ({
      tempId: nanoid(),
      egcs_tp_agencyholdback: '',
      egcs_tp_name_en: '',
      egcs_tp_name_fr: '',
      egcs_tp_requiresamendmentsubtype: false
    }))
  }

  const removeHoldbackBasis = (index: number) => {
    removeListItem('holdbackBases', index)
  }

  const addEligibleRecipient = () => {
    addListItem('eligibleRecipients', () => ({
      tempId: nanoid(),
      egcs_tp_applicantrecipientsubtype: ''
    }))
  }

  const removeEligibleRecipient = (index: number) => {
    removeListItem('eligibleRecipients', index)
  }

  const addCostCategoryLineItem = () => {
    addListItem('costCategoryLineItems', () => ({
      tempId: nanoid(),
      egcs_tp_organizationcostcategory: '',
      egcs_tp_costsharingratio: 0
    }))
  }

  const removeCostCategoryLineItem = (index: number) => {
    removeListItem('costCategoryLineItems', index)
  }

  const addAmendmentType = () => {
    addListItem('amendmentTypes', () => ({
      tempId: nanoid(),
      egcs_tp_amended: 'articles' as const,
      egcs_tp_name_en: '',
      egcs_tp_name_fr: '',
      egcs_tp_requiresamendmentsubtype: false
    }))
  }

  const removeAmendmentType = (index: number) => {
    const removedType = removeListItem('amendmentTypes', index)
    if (!removedType || !state.value) return

    state.value.amendmentSubtypes = state.value.amendmentSubtypes
      .map(subtype => ({ ...subtype, tempAmendmentTypeIds: subtype.tempAmendmentTypeIds.filter(id => id !== removedType.tempId) }))
      .filter(subtype => subtype.tempAmendmentTypeIds.length > 0)
  }

  const addAmendmentSubtype = () => {
    if (!state.value) return

    const defaultAmendmentType = state.value.amendmentTypes[0]
    if (!defaultAmendmentType) return

    state.value.amendmentSubtypes.push({
      tempId: nanoid(),
      tempAmendmentTypeIds: [defaultAmendmentType.tempId],
      egcs_tp_name_en: '',
      egcs_tp_name_fr: '',
      egcs_tp_description_en: '',
      egcs_tp_description_fr: ''
    })
  }

  const removeAmendmentSubtype = (index: number) => {
    removeListItem('amendmentSubtypes', index)
  }

  const addAgreementSubtype = () => {
    addListItem('agreementSubtypes', () => ({
      tempId: nanoid(),
      egcs_tp_agreementtype: ''
    }))
  }

  const removeAgreementSubtype = (index: number) => {
    removeListItem('agreementSubtypes', index)
  }

  const addChartOfAccount = () => {
    addListItem('chartOfAccounts', () => ({
      tempId: nanoid(),
      tempStreamBudgetId: state.value?.budgets[0]?.tempId ?? '',
      egcs_tp_accountingdimensions: [{
        tempId: nanoid(),
        label_en: '',
        label_fr: '',
        value: ''
      }]
    }))
  }

  const removeChartOfAccount = (index: number) => {
    removeListItem('chartOfAccounts', index)
  }

  const addCommitmentType = () => {
    addListItem('commitmentTypes', () => ({
      tempId: nanoid(),
      egcs_tp_name_en: '',
      egcs_tp_name_fr: ''
    }))
  }

  const removeCommitmentType = (index: number) => {
    removeListItem('commitmentTypes', index)
  }

  const addMonitorType = () => {
    addListItem('monitorTypes', () => ({
      tempId: nanoid(),
      egcs_tp_name_en: '',
      egcs_tp_name_fr: ''
    }))
  }

  const removeMonitorType = (index: number) => {
    removeListItem('monitorTypes', index)
  }

  const addAreaOfExpertise = () => {
    addListItem('areasOfExpertise', () => ({
      tempId: nanoid(),
      egcs_tp_name_en: '',
      egcs_tp_name_fr: '',
      egcs_tp_description_en: '',
      egcs_tp_description_fr: ''
    }))
  }

  const removeAreaOfExpertise = (index: number) => {
    removeListItem('areasOfExpertise', index)
  }

  const ensureFinancialLimit = () => {
    if (!state.value || state.value.financialLimit) return

    state.value.financialLimit = {
      egcs_tp_maxallowableperrecipient: '0',
      egcs_tp_maxpercentofsupportavailableperrecipient: 0,
      egcs_tp_maxpercentofretroactivecostsallowable: 0,
      egcs_tp_stackinglimit: 0,
      egcs_tp_active: true
    }
  }

  const clearFinancialLimit = () => {
    if (!state.value) return

    state.value.financialLimit = null
  }

  const validateWizardSchema = createValidator(TransferPaymentStreamPolymorphicWizardSchema)

  const validateWizard = async (wizardState: TransferPaymentStreamPolymorphicWizard) => {
    const result = await validateWizardSchema(wizardState)
    wizardErrors.value = result
    return result
  }

  const currentGuidance = computed(() => t(guidanceKeyByStep[currentStep.value]))

  const reviewGeneralSummaryItems = computed(() => {
    if (!state.value) return []

    return [
      {
        key: 'name-en',
        label: t('transfer_payment.name_en'),
        value: state.value.stream.egcs_tp_name_en || t('common.none')
      },
      {
        key: 'name-fr',
        label: t('transfer_payment.name_fr'),
        value: state.value.stream.egcs_tp_name_fr || t('common.none')
      },
      {
        key: 'allows-further-distribution',
        label: t('transfer_payment.allows_further_distribution'),
        value: state.value.stream.egcs_tp_allowsfurtherdistribution ? t('common.yes') : t('common.no')
      }
    ]
  })

  const hasFinancialLimit = computed(() => Boolean(state.value?.financialLimit))

  const reviewStepSummaryItems = computed(() => {
    if (!state.value) return []

    return [
      { key: 'step-2', label: t('transfer_payment.stream_wizard.step_2'), value: state.value.holdbackBases.length },
      { key: 'step-3', label: t('transfer_payment.stream_wizard.step_3'), value: state.value.budgets.length },
      {
        key: 'step-4',
        label: t('transfer_payment.stream_wizard.step_4'),
        value: state.value.eligibleRecipients.length
      },
      {
        key: 'step-5',
        label: t('transfer_payment.stream_wizard.step_5'),
        value: state.value.costCategoryLineItems.length
      },
      {
        key: 'step-6',
        label: t('transfer_payment.stream_wizard.step_6'),
        value: state.value.amendmentTypes.length
      },
      {
        key: 'step-7',
        label: t('transfer_payment.stream_wizard.step_7'),
        value: state.value.amendmentSubtypes.length
      },
      {
        key: 'step-8',
        label: t('transfer_payment.stream_wizard.step_8'),
        value: state.value.agreementSubtypes.length
      },
      { key: 'step-9', label: t('transfer_payment.stream_wizard.step_9'), value: state.value.chartOfAccounts.length },
      { key: 'commitment-types', label: t('transfer_payment.commitment_types.title'), value: state.value.commitmentTypes.length },
      {
        key: 'step-10',
        label: t('transfer_payment.stream_wizard.step_10'),
        value: state.value.monitorTypes.length
      },
      {
        key: 'step-11',
        label: t('transfer_payment.stream_wizard.step_11'),
        value: state.value.areasOfExpertise.length
      },
      {
        key: 'step-12',
        label: t('transfer_payment.stream_wizard.step_12'),
        value: hasFinancialLimit.value ? t('common.yes') : t('common.no')
      }
    ]
  })

  const reviewBudgetSummaryItems = computed(() => {
    if (!state.value) return []

    return state.value.budgets.map((budget, index) => ({
      key: budget.tempId,
      title: budgetLabelById.value.get(String(budget.egcs_tp_transferpaymentbudget)) || t('common.none'),
      items: [
        {
          key: `budget-${index}`,
          label: t('transfer_payment.program_budget'),
          value: budgetLabelById.value.get(String(budget.egcs_tp_transferpaymentbudget)) || t('common.none')
        },
        {
          key: `total-${index}`,
          label: t('transfer_payment.total_budget'),
          value: formatMoneyText(parseMoney(budget.egcs_tp_totalbudget), locale.value, 'CAD')
        },
        {
          key: `overcommit-${index}`,
          label: t('transfer_payment.overcommit_threshold'),
          value: String(budget.egcs_tp_overcommitthreshold)
        }
      ]
    }))
  })

  const reviewAgreementSubtypeSummaryItems = computed(() => {
    if (!state.value) return []

    return state.value.agreementSubtypes
      .map((item: TransferPaymentStreamPolymorphicWizard['agreementSubtypes'][number]) =>
        agreementTypeOptions.value.find((option: AgencyAgreementTypeItem) => String(option.id) === String(item.egcs_tp_agreementtype)) ?? null
      )
      .filter((item): item is AgencyAgreementTypeItem => item !== null)
  })

  const preloadReferenceData = async () => {
    const loadId = latestReferenceLoadId.value + 1
    latestReferenceLoadId.value = loadId
    isReferenceDataLoading.value = true

    try {
      await Promise.all([
        refreshParentStreams(),
        refreshBudgets(),
        refreshApplicantRecipientOptions(),
        refreshLineItemOptions(),
        refreshAgreementTypeOptions(),
        refreshAgencyHoldbackOptions()
      ])

      const requestError = parentStreamsError.value
        ?? budgetsError.value
        ?? applicantRecipientError.value
        ?? lineItemError.value
        ?? agreementTypeError.value
        ?? agencyHoldbackError.value
      if (requestError) {
        throw requestError
      }
    } catch (error: unknown) {
      if (latestReferenceLoadId.value !== loadId || !open.value) return

      console.error('Failed to preload stream wizard reference data', error)
      toast.add({
        title: t('common.error'),
        description: t('common.unknown_error'),
        color: 'error'
      })
    } finally {
      if (latestReferenceLoadId.value === loadId) {
        isReferenceDataLoading.value = false
      }
    }
  }

  const initializeState = () => {
    state.value = createTransferPaymentStreamWizardInitialState()
    reset()
    clearErrors()
    void preloadReferenceData()
  }

  const clearState = () => {
    latestReferenceLoadId.value += 1
    isReferenceDataLoading.value = false
    clearErrors()
    state.value = null
  }

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

  const getAmendmentTypeLabel = (tempId: string) => {
    if (!state.value) return t('common.none')

    const amendmentType = state.value.amendmentTypes.find(item => item.tempId === tempId)
    if (!amendmentType) return t('common.none')

    return getBilingualValue(amendmentType, 'egcs_tp_name', t('common.none'))
  }

  const onCurrentStepUpdate = (step: string) => {
    goToStep(step as TransferPaymentStreamWizardStepValue)
  }

  return {
    state,
    wizardErrors,
    isReferenceDataLoading,
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
    budgetLabelById,
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
    hasFinancialLimit,
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
  }
}
