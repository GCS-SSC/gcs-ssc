<script setup lang="ts">
import { useCrudModalPending } from '~/composables/useCrudModal'
import { useBusinessStatusState } from '~/composables/useBusinessStatusState'
/* eslint-disable jsdoc/require-jsdoc -- Payment table callbacks are exercised by focused component tests. */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { FormError } from '#ui/types'
import { useWizardFlow } from '~/composables/useWizardFlow'
import AgreementPaymentFields from '~/components/Agreement/AgreementPaymentFields.vue'
import { useExtensionCreateActions } from '~/composables/useExtensionCreateActions'
import { useExtensionPaymentAmountCalculators } from '~/composables/useExtensionPaymentAmountCalculators'
import { useJsonRequest } from '~/composables/useJsonRequest'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { hasPaymentOffset } from '~/utils/payment-offset-display'
import { appRouteLocations } from '~/utils/route-locations'
import type {
  FundingCaseAgreementPaymentForm,
  FundingCaseAgreementPaymentOverviewRow,
  FundingCaseAgreementPaymentRow,
  FundingCaseAgreementProfileRow,
  FundingCaseAgreementCommitmentRow
} from '~~/shared/types/funding-case-agreement-ui'
import { FundingCaseAgreementPaymentCreateSchema } from '~~/shared/types/schemas'
import { compareMoney, formatMoneyText, parseMoney, type Money } from '~~/shared/utils/money'
import type { GcsPaymentAmountCalculatorResult } from '@gcs-ssc/extensions/ui'
import type { Currency_Codes } from '~~/shared/types/database'
import type { PaymentOffsetPreview } from '~~/shared/types/account-receivable'
import type { AdminCommonLookupResponseItem } from '~~/shared/types/admin-common-ui'
import { withFormRequirements } from '~~/shared/utils/form-requirements'
import { sumMoney } from '~~/shared/utils/money'

type PaymentWizardForm = FundingCaseAgreementPaymentForm & {
  egcs_fc_offsetdate?: string
  egcs_fc_offsetdatetoken?: string
  egcs_fc_offsetplanhash?: string
  egcs_fc_offsetcreditmemos?: Array<{
    egcs_fc_key: string
    egcs_fc_lines: Array<{ egcs_fc_codingaccount?: string; egcs_fc_amount: string }>
  }>
}
type PaymentWizardStep = 'payment' | 'credit-memos' | 'review'

type PaymentCalculatorResult = GcsPaymentAmountCalculatorResult

const MONTH_KEYS = ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar'] as const
const ZERO_MONEY = parseMoney('0')

const { agreementId, currency: agreementCurrency, canCreate, canCreateRole = undefined, canUpdate, canDelete } = defineProps<{
  agreementId: string
  currency: Currency_Codes
  canCreate: boolean
  canCreateRole?: boolean
  canUpdate: boolean
  canDelete: boolean
}>()
const agreementIdRef = computed(() => agreementId)
let recordActionGeneration = 0
const pendingRecordActions = ref<Map<string, symbol>>(new Map())
const isOpeningCreate = ref(false)

const { t, locale } = useI18n()
const statusCatalog = useStatusCatalog()
void statusCatalog.load()
const getStatusLabel = (statusId: string) => {
  const definition = statusCatalog.getById(statusId)
  return definition ? (locale.value === 'fr' ? definition.nameFr : definition.nameEn) : ''
}
const localePath = useLocalePath()
const toast = useLocalizedToast()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const { saveJson, sendJson } = useJsonRequest()
const { isRecordLocked, getDefinition, isTerminalStatus } = useBusinessStatusState()
const {
  appendActions: extensionAppendCreateActions,
  replacementAction: extensionReplacementCreateAction,
  hasReplacement: hasExtensionCreateReplacement,
  hasConflict: hasExtensionCreateConflict
} = useExtensionCreateActions({
  operation: 'agreement.payments.create',
  agreementId: agreementIdRef
})
const {
  calculator: paymentAmountCalculator,
  hasConflict: hasPaymentAmountCalculatorConflict
} = useExtensionPaymentAmountCalculators({
  agreementId: agreementIdRef
})

const search: Ref<string> = ref('')
const pagination: Ref<{ pageIndex: number, pageSize: number }> = ref({
  pageIndex: 0,
  pageSize: 25
})

const paymentModal = useCrudModal<FundingCaseAgreementPaymentRow, PaymentWizardForm>({
  createState: () => ({ egcs_fc_currency: agreementCurrency }),
  updateState: payment => ({
    id: payment.id,
    egcs_fc_applicantrecipient: payment.egcs_fc_applicantrecipient ?? undefined,
    egcs_fc_commitmenttype: payment.commitment_type ?? undefined,
    egcs_fc_fiscalyear: payment.egcs_fc_fiscalyear,
    egcs_fc_paymenttype: payment.egcs_fc_paymenttype,
    egcs_fc_periodstart: payment.egcs_fc_periodstart,
    egcs_fc_periodend: payment.egcs_fc_periodend,
    egcs_fc_paymentamount: payment.egcs_fc_paymentamount,
    egcs_fc_currency: payment.egcs_fc_currency,
    egcs_fc_comment: payment.egcs_fc_comment
  })
})

const selectedPayment = paymentModal.selected
const isPaymentModalOpen = paymentModal.isOpen
const validatePaymentSchema = createValidator(FundingCaseAgreementPaymentCreateSchema)
const paymentPending = useCrudModalPending(paymentModal.captureSession)
let modalIntent = 0
const isSavingPayment = paymentPending.isPending
const wizardErrors: Ref<FormError[]> = ref([])
const offsetPreview: Ref<PaymentOffsetPreview | null> = ref(null)
const resolvedPaymentLabels: Ref<Record<string, AdminCommonLookupResponseItem[]>> = ref({})
const wizardSteps = computed(() => (['payment', 'credit-memos', 'review'] as const).map(value => ({
  value,
  title: t(`agreement.payments.wizard.steps.${value}.title`),
  icon: value === 'payment' ? 'i-lucide-banknote' : value === 'credit-memos' ? 'i-lucide-receipt' : 'i-lucide-clipboard-check'
})))
const { currentStep, steps, isFirstStep, isLastStep, stepIndex, prevStep, goToStep, reset: resetWizard, errorsByStep, currentStepErrors } = useWizardFlow<PaymentWizardStep>({
  steps: wizardSteps,
  initialStep: 'payment',
  errors: wizardErrors,
  resolveStepForField: name => name?.startsWith('egcs_fc_offsetcreditmemos') ? 'credit-memos' : 'payment'
})
let disposed = false
onBeforeUnmount(() => {
  disposed = true
})
const paymentHeader = () => {
  if (!selectedPayment.value) return null
  const { egcs_fc_offsetdatetoken: _token, egcs_fc_offsetdate: _date, egcs_fc_offsetplanhash: _hash, egcs_fc_offsetcreditmemos: _memos, ...header } = selectedPayment.value
  return header
}
const paymentHeaderSignature = computed(() => JSON.stringify(paymentHeader()))
watch(paymentHeaderSignature, () => {
  offsetPreview.value = null
  if (selectedPayment.value) {
    delete selectedPayment.value.egcs_fc_offsetdatetoken
    delete selectedPayment.value.egcs_fc_offsetdate
    delete selectedPayment.value.egcs_fc_offsetplanhash
    delete selectedPayment.value.egcs_fc_offsetcreditmemos
  }
  wizardErrors.value = []
  resetWizard()
}, { flush: 'sync' })
watch(() => paymentModal.captureSession(), () => {
  offsetPreview.value = null
  resolvedPaymentLabels.value = {}
  wizardErrors.value = []
  resetWizard()
}, { flush: 'sync' })
const paymentLabel = (field: string) => {
  const item = resolvedPaymentLabels.value[field]?.[0]
  return String(item?.[locale.value === 'fr' ? 'label_fr' : 'label_en'] ?? t('common.not_available'))
}
const memoCodingOptions = (memoIndex: number) => (offsetPreview.value?.egcs_fc_creditmemos[memoIndex]?.egcs_fc_codingaccounts ?? [])
  .map(account => ({ value: account.id, label: locale.value === 'fr' ? account.egcs_fc_name_fr : account.egcs_fc_name_en }))
const selectedMemoCodingLabel = (memoIndex: number, codingId?: string) => memoCodingOptions(memoIndex).find(item => item.value === codingId)?.label ?? t('common.not_available')
const validatePayment = withFormRequirements(async (state: PaymentWizardForm) => {
  const errors = await validatePaymentSchema(state)
  for (const [memoIndex, memo] of (state.egcs_fc_offsetcreditmemos ?? []).entries()) {
    const expected = offsetPreview.value?.egcs_fc_creditmemos[memoIndex]?.egcs_fc_amount
    const names = memo.egcs_fc_lines.map(line => line.egcs_fc_codingaccount).filter(Boolean)
    if (new Set(names).size !== names.length) errors.push({
      name: `egcs_fc_offsetcreditmemos.${memoIndex}.egcs_fc_lines`, message: t('agreement.payments.wizard.duplicate_coding')
    })
    try {
      if (expected && compareMoney(sumMoney(memo.egcs_fc_lines.map(line => parseMoney(line.egcs_fc_amount))), expected) !== 0) errors.push({
        name: `egcs_fc_offsetcreditmemos.${memoIndex}.egcs_fc_lines`, message: t('agreement.payments.wizard.coding_total', { amount: formatMoney(expected, agreementCurrency.toUpperCase()) })
      })
    } catch {
      // The schema keeps invalid money on its individual field.
    }
  }
  wizardErrors.value = errors
  return errors
}, FundingCaseAgreementPaymentCreateSchema)
const preparePaymentOffset = async () => {
  if (!selectedPayment.value || isSavingPayment.value || isPaymentAboveCalculatorCeiling.value || paymentCalculatorResult.value?.loading) return false
  const header = paymentHeader()
  const session = paymentModal.captureSession()
  const signature = paymentHeaderSignature.value
  const owner = agreementId
  const isCurrent = () => !disposed && isPaymentModalOpen.value && paymentModal.captureSession() === session
    && owner === agreementId && signature === paymentHeaderSignature.value
  if (!header?.id && !await checkCreationPrerequisites(isCurrent)) return false
  if (!isCurrent()) return false
  const errors = await validatePaymentSchema(header)
  if (!isCurrent()) return false
  wizardErrors.value = errors
  if (errors.length) return false
  if (!paymentPending.begin(session)) return false
  try {
    const previewUrl = header?.id ? `/api/agreements/${owner}/payments/${header.id}/preview` : `/api/agreements/${owner}/payments/preview`
    const preview = await sendJson<PaymentOffsetPreview>(previewUrl, 'POST', header)
    if (disposed || !isPaymentModalOpen.value || paymentModal.captureSession() !== session || owner !== agreementId || signature !== paymentHeaderSignature.value || !selectedPayment.value) return false
    offsetPreview.value = preview
    selectedPayment.value.egcs_fc_offsetdatetoken = preview.egcs_fc_offsetdatetoken
    selectedPayment.value.egcs_fc_offsetdate = preview.egcs_fc_offsetdate
    selectedPayment.value.egcs_fc_offsetplanhash = preview.egcs_fc_offsetplanhash
    selectedPayment.value.egcs_fc_offsetcreditmemos = preview.egcs_fc_creditmemos.map(memo => ({
      egcs_fc_key: memo.egcs_fc_key,
      egcs_fc_lines: memo.egcs_fc_lines.length ? memo.egcs_fc_lines.map(line => ({ ...line })) : [{ egcs_fc_amount: memo.egcs_fc_amount }]
    }))
    goToStep('credit-memos')
    return true
  } catch (error) {
    if (!disposed && isPaymentModalOpen.value && paymentModal.captureSession() === session && owner === agreementId && signature === paymentHeaderSignature.value) showError(error)
    return false
  } finally {
    paymentPending.end(session)
  }
}
const nextPaymentStep = async () => {
  if (isSavingPayment.value) return
  if (currentStep.value === 'payment') {
    await preparePaymentOffset()
  } else if (currentStep.value === 'credit-memos' && selectedPayment.value && offsetPreview.value) {
    if (!(await validatePayment(selectedPayment.value)).length) goToStep('review')
  }
}
const changePaymentStep = async (step: string) => {
  if (isSavingPayment.value) return
  const targetIndex = steps.value.findIndex(item => item.value === step)
  if (targetIndex < 0) return
  if (targetIndex <= stepIndex.value) {
    goToStep(step as PaymentWizardStep)
    return
  }
  while (stepIndex.value < targetIndex) {
    const previousIndex = stepIndex.value
    await nextPaymentStep()
    if (stepIndex.value === previousIndex) break
  }
}
const addMemoCodingLine = (memoIndex: number) => {
  if (isSavingPayment.value) return
  selectedPayment.value?.egcs_fc_offsetcreditmemos?.[memoIndex]?.egcs_fc_lines.push({ egcs_fc_amount: '' })
}
const paymentCalculatorResult: Ref<PaymentCalculatorResult | null> = ref(null)
const hasManualPaymentAmount: Ref<boolean> = ref(false)
let lastSuggestedPaymentAmount: Money | null = null
watch(() => paymentModal.captureSession(), () => {
  lastSuggestedPaymentAmount = null
  hasManualPaymentAmount.value = false
}, { flush: 'sync' })
watch(agreementIdRef, () => {
  recordActionGeneration += 1
  pendingRecordActions.value = new Map()
  isOpeningCreate.value = false
  paymentModal.close()
  paymentCalculatorResult.value = null
}, { flush: 'sync' })
const useOverviewFetch = useFetch as unknown as (url: Ref<string>) => {
  data: Ref<FundingCaseAgreementPaymentOverviewRow | null>
  refresh: () => Promise<void>
  status: Ref<'idle' | 'pending' | 'success' | 'error'>
}
const {
  data: overview,
  refresh: refreshOverview,
  status: overviewStatus
} = useOverviewFetch(computed(() => `/api/agreements/${agreementId}/payments-overview`))

const columns: TableColumnInput<FundingCaseAgreementPaymentRow>[] = [
  { id: 'type', accessorKey: 'egcs_fc_paymenttype', headerKey: 'agreement.payments.type' },
  { id: 'payee', headerKey: 'agreement.payments.payee' },
  { id: 'status', accessorKey: 'egcs_fc_status', headerKey: 'common.status' },
  { id: 'amount', accessorKey: 'egcs_fc_paymentamount', headerKey: 'agreement.payments.amount' },
  { id: 'schedule', headerKey: 'agreement.payments.schedule' },
  { id: 'comment', accessorKey: 'egcs_fc_comment', headerKey: 'common.comment' },
  { id: 'actions', headerKey: 'common.actions', meta: { class: { th: 'w-40', td: 'w-40' } } }
]

const normalizedSearch = computed(() => search.value.trim().toLowerCase())
const tableRows = computed<FundingCaseAgreementPaymentRow[]>(() => (overview.value?.payments ?? []).filter((row: FundingCaseAgreementPaymentRow) => {
  if (!normalizedSearch.value) {
    return true
  }

  return [
    t(`enums.payment_type.${row.egcs_fc_paymenttype}`),
    getStatusLabel(row.egcs_fc_status),
    row.fiscal_year_display,
    row.egcs_fc_comment,
    row.egcs_fc_paymentamount,
    row.line_count
  ].some(value => String(value ?? '').toLowerCase().includes(normalizedSearch.value))
}))

const formatMoney = (value: Money, currency = 'CAD') => formatMoneyText(value, locale.value, currency)
const getMonthLabel = (month: number) => t(`agreement.payments.months.${MONTH_KEYS[month]}`)
const getPeriodLabel = (periodStart: number, periodEnd: number) => `${getMonthLabel(periodStart)} - ${getMonthLabel(periodEnd)}`

const warnRecordPrerequisite = () => toast.add({
  title: toast.localized('common.warning'),
  description: toast.localized('agreement.child_records.work_prerequisite'),
  color: 'warning'
})
const loadWorkableRecord = async (recordId: string, action: 'update' | 'delete', isCurrent: () => boolean = () => true): Promise<FundingCaseAgreementPaymentRow | null> => {
  const owner = agreementId
  const generation = recordActionGeneration
  const current = tableRows.value.find(row => String(row.id) === recordId)
  if (current && !statusCatalog.getById(current.egcs_fc_status)) await statusCatalog.load()
  if (disposed || owner !== agreementId || generation !== recordActionGeneration || !isCurrent()) return null
  if (!current || isRecordLocked(current)) {
    warnRecordPrerequisite()
    return null
  }
  try {
    const [parent, overview, roster] = await Promise.all([
      $fetch<FundingCaseAgreementProfileRow, string>(`/api/agreements/${owner}`),
      $fetch<{ payments: FundingCaseAgreementPaymentRow[] }, string>(`/api/agreements/${owner}/payments-overview`),
      $fetch<{ is_assigned: boolean }, string>(`/api/entity-assignments/fundingcasepayment/${recordId}`)
    ])
    if (disposed || owner !== agreementId || generation !== recordActionGeneration || !isCurrent()) return null
    const record = overview.payments.find(row => String(row.id) === recordId)
    if (!statusCatalog.getById(parent.egcs_fc_status) || (record && !statusCatalog.getById(record.egcs_fc_status))) await statusCatalog.load()
    if (disposed || owner !== agreementId || generation !== recordActionGeneration || !isCurrent()) return null
    const permitted = action === 'update' ? parent.can_update_child_records_role : parent.can_delete_child_records_role
    if (permitted !== true || roster.is_assigned !== true || isRecordLocked(parent) || !record || isRecordLocked(record)) {
      warnRecordPrerequisite()
      return null
    }
    const commitment = await $fetch<FundingCaseAgreementCommitmentRow, string>(`/api/agreements/${owner}/commitments/${record.egcs_fc_fundingagreementcommitment}`)
    if (disposed || owner !== agreementId || generation !== recordActionGeneration || !isCurrent()) return null
    if (!getDefinition(commitment.egcs_fc_status)) await statusCatalog.load()
    if (disposed || owner !== agreementId || generation !== recordActionGeneration || !isCurrent()) return null
    // Commitment completion/read-only activates downstream Payment work; terminal status still blocks.
    if (!getDefinition(commitment.egcs_fc_status) || isTerminalStatus(commitment.egcs_fc_status)) {
      warnRecordPrerequisite()
      return null
    }
    return record
  } catch {
    if (!disposed && owner === agreementId && generation === recordActionGeneration && isCurrent()) warnRecordPrerequisite()
    return null
  }
}
const runRecordAction = async (recordId: string, action: 'update' | 'delete', work: (record: FundingCaseAgreementPaymentRow) => void | Promise<void>) => {
  if (pendingRecordActions.value.has(recordId)) return
  const intent = action === 'update' ? ++modalIntent : modalIntent
  const session = paymentModal.captureSession()
  const isCurrent = () => action === 'delete' || (intent === modalIntent && paymentModal.captureSession() === session)
  const token = Symbol(recordId)
  pendingRecordActions.value = new Map(pendingRecordActions.value).set(recordId, token)
  try {
    const record = await loadWorkableRecord(recordId, action, isCurrent)
    if (record && isCurrent()) await work(record)
  } finally {
    if (pendingRecordActions.value.get(recordId) === token) {
      const remaining = new Map(pendingRecordActions.value)
      remaining.delete(recordId)
      pendingRecordActions.value = remaining
    }
  }
}

const checkCreationPrerequisites = async (isCurrent: () => boolean = () => true): Promise<boolean> => {
  const owner = agreementId
  const generation = recordActionGeneration
  try {
    const parent = await $fetch<FundingCaseAgreementProfileRow, string>(`/api/agreements/${owner}`)
    if (!statusCatalog.getById(parent.egcs_fc_status)) await statusCatalog.load()
    if (disposed || owner !== agreementId || generation !== recordActionGeneration || !isCurrent()) return false
    if (parent.can_create_child_records_role === true && parent.can_create_child_records === true && !isRecordLocked(parent)) return true
  } catch {
    if (disposed || owner !== agreementId || generation !== recordActionGeneration || !isCurrent()) return false
  }
  toast.add({ title: toast.localized('common.warning'), description: toast.localized('agreement.child_records.create_prerequisite'), color: 'warning' })
  return false
}
const openCreatePayment = async () => {
  if (isOpeningCreate.value) return
  const intent = ++modalIntent
  const session = paymentModal.captureSession()
  const isCurrent = () => intent === modalIntent && paymentModal.captureSession() === session
  isOpeningCreate.value = true
  const generation = recordActionGeneration
  try {
    if (!await checkCreationPrerequisites(isCurrent) || !isCurrent()) return
    paymentCalculatorResult.value = null
    paymentModal.openCreate()
  } finally {
    if (generation === recordActionGeneration) isOpeningCreate.value = false
  }
}

const handleExtensionCreated = async () => {
  await refreshOverview()
  toast.add({
    title: toast.localized('common.success'),
    description: toast.localized('common.added_success'),
    color: 'success'
  })
}

const openUpdatePayment = (record: FundingCaseAgreementPaymentRow) => runRecordAction(String(record.id), 'update', freshRecord => {
  paymentCalculatorResult.value = null
  paymentModal.openUpdate(freshRecord)
})

const paymentCalculatorModel = computed(() => ({
  agreementId,
  commitmentType: selectedPayment.value?.egcs_fc_commitmenttype,
  fiscalYear: selectedPayment.value?.egcs_fc_fiscalyear,
  paymentType: selectedPayment.value?.egcs_fc_paymenttype,
  periodStart: selectedPayment.value?.egcs_fc_periodstart,
  periodEnd: selectedPayment.value?.egcs_fc_periodend,
  currency: agreementCurrency,
  amount: selectedPayment.value?.egcs_fc_paymentamount
}))

const paymentCalculatorCeiling = computed(() => {
  const ceiling = paymentCalculatorResult.value?.ceilingAmount
  if (typeof ceiling !== 'string') {
    return null
  }
  return ceiling
})
const paymentCalculatorCeilingMoney = computed<Money | null>(() => {
  const ceiling = paymentCalculatorCeiling.value
  if (ceiling === null) return null
  try {
    return parseMoney(ceiling)
  } catch {
    return null
  }
})
const paymentCalculatorCurrency = computed(() => agreementCurrency.toUpperCase())

const isPaymentAboveCalculatorCeiling = computed(() => {
  const ceiling = paymentCalculatorCeilingMoney.value
  const amount = selectedPayment.value?.egcs_fc_paymentamount
  if (!ceiling || typeof amount !== 'string') return false
  try {
    return compareMoney(parseMoney(amount), ceiling) > 0
  } catch {
    return false
  }
})

watch(
  () => paymentCalculatorResult.value?.suggestedAmount,
  suggestedAmount => {
    if (!selectedPayment.value || selectedPayment.value.id || hasManualPaymentAmount.value) {
      return
    }
    if (typeof suggestedAmount !== 'string') {
      return
    }
    try {
      const suggestion = parseMoney(suggestedAmount)
      const currentAmount = selectedPayment.value.egcs_fc_paymentamount
      let useSuggestion = currentAmount === undefined || currentAmount === ''
      if (!useSuggestion && lastSuggestedPaymentAmount !== null && typeof currentAmount === 'string') {
        try {
          useSuggestion = compareMoney(parseMoney(currentAmount), lastSuggestedPaymentAmount) === 0
        } catch {
          // Keep invalid manual input visible for form validation.
        }
      }
      if (useSuggestion) selectedPayment.value.egcs_fc_paymentamount = suggestion
      lastSuggestedPaymentAmount = suggestion
    } catch {
      // The extension result remains visible, but invalid money never enters the host form contract.
    }
  }
)

const handlePaymentCalculatorResult = (result: Record<string, unknown>) => {
  if (typeof result.currency === 'string' && result.currency.toLowerCase() !== agreementCurrency) {
    return
  }
  paymentCalculatorResult.value = result as PaymentCalculatorResult
}

const handlePaymentAmountInput = (amount: string) => {
  if (!selectedPayment.value) return
  hasManualPaymentAmount.value = true
  selectedPayment.value.egcs_fc_paymentamount = amount
}

const handlePaymentCalculatorExtensionPayload = (extensionKey: string, value: Record<string, unknown>) => {
  if (!selectedPayment.value) {
    return
  }
  selectedPayment.value.extensions = {
    ...selectedPayment.value.extensions,
    [extensionKey]: value
  }
}

const savePayment = async () => {
  if (!selectedPayment.value) {
    return
  }
  if (isPaymentAboveCalculatorCeiling.value) {
    return
  }
  const paymentState = selectedPayment.value
  const isUpdate = Boolean(paymentState.id)
  if (currentStep.value !== 'review' || !offsetPreview.value || paymentCalculatorResult.value?.loading) {
    await nextPaymentStep()
    return
  }
  const session = paymentModal.captureSession()
  if (!paymentPending.begin(session)) return

  try {
    if (isUpdate && !await loadWorkableRecord(String(paymentState.id), 'update',
      () => isPaymentModalOpen.value && paymentModal.captureSession() === session)) return
    if (!isUpdate && !await checkCreationPrerequisites(
      () => isPaymentModalOpen.value && paymentModal.captureSession() === session)) return
    if (disposed || paymentModal.captureSession() !== session) return
    await saveJson(
      isUpdate
        ? `/api/agreements/${agreementId}/payments/${paymentState.id}`
        : `/api/agreements/${agreementId}/payments`,
      isUpdate ? 'PATCH' : 'POST',
      paymentState
    )

    if (!paymentModal.closeSession(session)) return
    await refreshOverview()
    if (overviewStatus.value === 'error') return
    toast.add({
      title: toast.localized('common.success'),
      description: isUpdate ? toast.localized('common.updated_success') : toast.localized('common.added_success'),
      color: 'success'
    })
  } catch (error: unknown) {
    if (!disposed && isPaymentModalOpen.value && paymentModal.captureSession() === session) showError(error)
  } finally {
    paymentPending.end(session)
  }
}

const { confirmDeleteRequest } = useConfirmDeleteRequest()
const confirmDelete = useDeleteConfirm()
const deletePayment = (recordId: string) => runRecordAction(recordId, 'delete', async () => {
  const owner = agreementId
  const generation = recordActionGeneration
  const shouldProceed = () => !disposed && owner === agreementId && generation === recordActionGeneration
  try {
    const deleted = await confirmDeleteRequest(`/api/agreements/${owner}/payments/${recordId}`, {
      shouldProceed,
      confirm: async () => {
        if (!await confirmDelete() || !shouldProceed()) return false
        return Boolean(await loadWorkableRecord(recordId, 'delete')) && shouldProceed()
      }
    })
    if (!deleted || !shouldProceed()) return
    await refreshOverview()
    if (!shouldProceed()) return
    toast.add({ title: toast.localized('common.success'), description: toast.localized('common.deleted_success'), color: 'success' })
  } catch (error: unknown) {
    if (shouldProceed()) showError(error)
  }
})
</script>

<template>
  <div class="w-full">
    <CommonResourceLayoutCard
      v-model:search="search"
      v-model:pagination="pagination"
      :data="tableRows"
      :columns="columns"
      :total-records="tableRows.length"
      :loading="overviewStatus === 'pending'"
      :request-status="overviewStatus"
      table-class="w-full max-w-full"
      :ui="{ base: 'w-full min-w-[56rem] table-fixed', th: 'whitespace-normal', td: 'whitespace-normal' }"
      :button-label="t('agreement.payments.add')"
      :show-button="(canCreateRole ?? canCreate) && (!canCreate || (!hasExtensionCreateReplacement && !hasExtensionCreateConflict && !hasPaymentAmountCalculatorConflict))"
      :button-disabled="isOpeningCreate"
      :search-placeholder="t('agreement.payments.search')"
      @add="openCreatePayment"
      @retry="refreshOverview">
      <template #actions>
        <div
          v-if="canCreate && hasExtensionCreateConflict"
          role="status"
          tabindex="0"
          :aria-label="t('extensions.create_operation_conflict')"
          class="flex max-w-sm items-start gap-2 rounded-md border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">
          <UIcon name="i-lucide-alert-triangle" aria-hidden="true" class="mt-0.5 size-4 shrink-0" />
          <span>{{ t('extensions.create_operation_conflict') }}</span>
        </div>
        <div
          v-if="canCreate && hasPaymentAmountCalculatorConflict"
          role="status"
          tabindex="0"
          :aria-label="t('extensions.payment_amount_calculator_conflict')"
          class="flex max-w-sm items-start gap-2 rounded-md border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">
          <UIcon name="i-lucide-alert-triangle" aria-hidden="true" class="mt-0.5 size-4 shrink-0" />
          <span>{{ t('extensions.payment_amount_calculator_conflict') }}</span>
        </div>
        <ExtensionCreateActionHost
          v-if="canCreate && extensionReplacementCreateAction && !hasExtensionCreateConflict"
          :item="extensionReplacementCreateAction"
          @created="handleExtensionCreated" />
        <template v-if="canCreate">
          <ExtensionCreateActionHost
            v-for="action in extensionAppendCreateActions"
            :key="action.value"
            :item="action"
            @created="handleExtensionCreated" />
        </template>
      </template>

      <template #type-cell="{ row }">
        <div class="flex flex-col gap-1">
          <ULink
            :to="localePath(appRouteLocations.agreementPaymentDetail(agreementId, String(row.original.id)))"
            class="font-bold text-zinc-900 transition-colors hover:text-primary dark:text-white">
            {{ t(`enums.payment_type.${row.original.egcs_fc_paymenttype}`) }}
          </ULink>
          <span class="text-xs font-bold tracking-widest text-zinc-400 uppercase">
            {{ row.original.line_count ?? 0 }} {{ t('agreement.payments.lines') }}
          </span>
        </div>
      </template>

      <template #payee-cell="{ row }">
        {{ (locale === 'fr' ? row.original.egcs_fc_payeename_fr : row.original.egcs_fc_payeename_en) || t('agreement.payments.payee_unattributed') }}
      </template>

      <template #status-cell="{ row }">
        <CommonRecordState
          :status-id="row.original.egcs_fc_status"
          :is-completed="row.original.isCompleted" />
      </template>

      <template #schedule-cell="{ row }">
        <div class="flex flex-col gap-1">
          <span class="font-medium text-zinc-700 dark:text-zinc-200">
            {{ row.original.fiscal_year_display }}
          </span>
          <span class="text-xs font-bold tracking-widest text-zinc-400 uppercase">
            {{ t('agreement.payments.period') }} {{ getPeriodLabel(row.original.egcs_fc_periodstart, row.original.egcs_fc_periodend) }}
          </span>
        </div>
      </template>

      <template #amount-cell="{ row }">
        <dl class="space-y-1 text-xs">
          <div>
            <dt class="inline text-muted">
              {{ t('agreement.payments.gross') }}:
            </dt><dd class="ml-1 inline font-medium tabular-nums">
              {{ formatMoney(row.original.egcs_fc_paymentamount, row.original.egcs_fc_currency.toUpperCase()) }}
            </dd>
          </div>
          <div v-if="hasPaymentOffset(row.original.egcs_fc_offsetamount)">
            <dt class="inline text-muted">
              {{ t('agreement.payments.offset') }}:
            </dt><dd class="ml-1 inline tabular-nums">
              {{ formatMoney(row.original.egcs_fc_offsetamount ?? ZERO_MONEY, row.original.egcs_fc_currency.toUpperCase()) }}
            </dd>
          </div>
          <div>
            <dt class="inline text-muted">
              {{ t('agreement.payments.net') }}:
            </dt><dd class="ml-1 inline font-semibold tabular-nums">
              {{ formatMoney(row.original.egcs_fc_netamount ?? row.original.egcs_fc_paymentamount, row.original.egcs_fc_currency.toUpperCase()) }}
            </dd>
          </div>
        </dl>
        <span v-if="row.original.egcs_fc_recoverycontrol === 'direct_repayment_hold'" class="text-xs text-warning">{{ t('agreement.payments.hold_title') }}</span>
      </template>

      <template #comment-cell="{ row }">
        <p
          v-if="row.original.egcs_fc_comment"
          class="line-clamp-2 max-w-full break-words text-sm leading-5 text-zinc-600 dark:text-zinc-300">
          {{ row.original.egcs_fc_comment }}
        </p>
        <span v-else class="text-sm text-zinc-400 dark:text-zinc-500">
          {{ t('common.none') }}
        </span>
      </template>

      <template #actions-cell="{ row }">
        <div class="flex items-center justify-end gap-2">
          <CommonActionButton
            icon="i-lucide-arrow-right"
            color="neutral"
            variant="ghost"
            :aria-label="t('common.view_details')"
            :to="localePath(appRouteLocations.agreementPaymentDetail(agreementId, String(row.original.id)))" />
          <CommonActionButton
            v-if="canUpdate && !row.getIsGrouped?.()"
            icon="i-lucide-pencil"
            :disabled="pendingRecordActions.has(String(row.original.id))"
            color="neutral"
            variant="ghost"
            class="cursor-default"
            :aria-label="t('common.edit')"
            @click="openUpdatePayment(row.original)" />
          <CommonActionButton
            v-if="canDelete && !row.getIsGrouped?.()"
            icon="i-lucide-trash"
            :disabled="pendingRecordActions.has(String(row.original.id))"
            color="error"
            variant="ghost"
            class="cursor-default"
            :aria-label="t('common.delete')"
            :loading="pendingRecordActions.has(String(row.original.id))"
            @click="deletePayment(String(row.original.id))" />
        </div>
      </template>
    </CommonResourceLayoutCard>

    <UModal
      v-if="selectedPayment"
      v-model:open="isPaymentModalOpen"
      :title="selectedPayment.id ? t('agreement.payments.edit') : t('agreement.payments.add')"
      fullscreen
      :ui="{ content: 'rounded-none shadow-none ring-0' }"
      :description="t('common.form_dialog_description')">
      <template #body>
        <UForm :state="selectedPayment" :validate="validatePayment" :validate-on="[]" class="flex h-full flex-col" @submit="savePayment">
          <CommonWizardShell
            data-testid="payment-create-wizard"
            :current-step="currentStep" :steps="steps" :is-first-step="isFirstStep" :is-last-step="isLastStep"
            :guidance="t(`agreement.payments.wizard.steps.${currentStep}.guidance`)"
            :errors="wizardErrors" :errors-by-step="errorsByStep" :current-step-errors="currentStepErrors"
            :cancel-label="t('common.cancel')" :previous-label="t('common.previous')" :next-label="t('common.next')"
            :submit-label="selectedPayment.id ? t('common.update') : t('common.add')" :guidance-title="t('common.guidance')"
            :error-summary-label="t('agreement.payments.wizard.errors_summary', { count: wizardErrors.length })"
            :error-steps-label="t('agreement.payments.wizard.errors_steps')"
            :error-current-step-label="t('agreement.payments.wizard.errors_current_step')"
            :pending="isSavingPayment || isPaymentAboveCalculatorCeiling || paymentCalculatorResult?.loading === true"
            @update:current-step="changePaymentStep" @jump-to-step="changePaymentStep"
            @next="nextPaymentStep" @previous="prevStep" @cancel="paymentModal.close()">
            <AgreementPaymentFields
              v-show="currentStep === 'payment'"
              v-model:state="selectedPayment"
              :agreement-id="agreementId" :currency="agreementCurrency"
              :payment-amount-calculator="paymentAmountCalculator" :payment-calculator-model="paymentCalculatorModel"
              :ceiling-error="isPaymentAboveCalculatorCeiling ? t('agreement.payments.amount_exceeds_calculated_ceiling', { amount: formatMoney(paymentCalculatorCeilingMoney ?? ZERO_MONEY, paymentCalculatorCurrency) }) : null"
              :pending="isSavingPayment"
              @amount="handlePaymentAmountInput" @calculator-result="handlePaymentCalculatorResult" @calculator-payload="handlePaymentCalculatorExtensionPayload"
              @resolved-items="(field, items) => resolvedPaymentLabels[field] = items" />
            <div v-if="currentStep !== 'payment' && offsetPreview" class="space-y-6">
              <section v-if="currentStep === 'review'" class="space-y-4" :aria-label="t('agreement.payments.wizard.steps.payment.title')">
                <h3 class="text-lg font-semibold">
                  {{ t('agreement.payments.wizard.steps.payment.title') }}
                </h3>
                <dl class="grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt class="text-sm text-muted">
                      {{ t('agreement.payments.payee') }}
                    </dt><dd>{{ paymentLabel('egcs_fc_applicantrecipient') }}</dd>
                  </div>
                  <div>
                    <dt class="text-sm text-muted">
                      {{ t('agreement.payments.commitment_type') }}
                    </dt><dd>{{ paymentLabel('egcs_fc_commitmenttype') }}</dd>
                  </div>
                  <div>
                    <dt class="text-sm text-muted">
                      {{ t('agreement.payments.fiscal_year') }}
                    </dt><dd>{{ paymentLabel('egcs_fc_fiscalyear') }}</dd>
                  </div>
                  <div>
                    <dt class="text-sm text-muted">
                      {{ t('agreement.payments.type') }}
                    </dt><dd>{{ t(`enums.payment_type.${selectedPayment.egcs_fc_paymenttype}`) }}</dd>
                  </div>
                  <div>
                    <dt class="text-sm text-muted">
                      {{ t('agreement.payments.period') }}
                    </dt><dd>{{ getPeriodLabel(selectedPayment.egcs_fc_periodstart ?? 0, selectedPayment.egcs_fc_periodend ?? 0) }}</dd>
                  </div>
                  <div v-if="selectedPayment.egcs_fc_comment">
                    <dt class="text-sm text-muted">
                      {{ t('common.comment') }}
                    </dt><dd class="whitespace-pre-wrap">
                      {{ selectedPayment.egcs_fc_comment }}
                    </dd>
                  </div>
                </dl>
              </section>
              <dl class="grid gap-4 sm:grid-cols-3" data-testid="payment-offset-preview-totals">
                <div>
                  <dt class="text-sm text-muted">
                    {{ t('agreement.payments.gross') }}
                  </dt><dd class="font-semibold tabular-nums">
                    {{ formatMoney(offsetPreview.egcs_fc_grossamount, agreementCurrency.toUpperCase()) }}
                  </dd>
                </div>
                <div>
                  <dt class="text-sm text-muted">
                    {{ t('agreement.payments.offset') }}
                  </dt><dd class="font-semibold tabular-nums">
                    {{ formatMoney(offsetPreview.egcs_fc_offsetamount, agreementCurrency.toUpperCase()) }}
                  </dd>
                </div>
                <div>
                  <dt class="text-sm text-muted">
                    {{ t('agreement.payments.net') }}
                  </dt><dd class="font-semibold tabular-nums">
                    {{ formatMoney(offsetPreview.egcs_fc_netamount, agreementCurrency.toUpperCase()) }}
                  </dd>
                </div>
              </dl>
              <p v-if="!offsetPreview.egcs_fc_creditmemos.length" role="status" class="text-muted">
                {{ t('agreement.payments.wizard.no_offsets') }}
              </p>
              <fieldset
                v-for="(memo, memoIndex) in selectedPayment.egcs_fc_offsetcreditmemos"
                :key="memo.egcs_fc_key" class="space-y-4 rounded-lg border border-default p-4"
                :data-testid="`payment-offset-memo-${memoIndex}`">
                <legend class="px-2 font-semibold">
                  {{ t('agreement.payments.wizard.memo_number', { number: memoIndex + 1 }) }}
                </legend>
                <p class="font-semibold tabular-nums">
                  {{ formatMoney(offsetPreview.egcs_fc_creditmemos[memoIndex]?.egcs_fc_amount ?? ZERO_MONEY, agreementCurrency.toUpperCase()) }}
                </p>
                <p class="text-sm text-muted">
                  {{ t(offsetPreview.egcs_fc_creditmemos[memoIndex]?.egcs_fc_allocationmode === 'allocator' ? 'agreement.payments.wizard.allocated_coding' : 'agreement.payments.wizard.manual_coding') }}
                </p>
                <UAlert v-if="!memoCodingOptions(memoIndex).length" color="warning" :description="t('agreement.payments.wizard.no_coding_accounts')" />
                <div
                  v-for="(line, lineIndex) in memo.egcs_fc_lines" :key="lineIndex"
                  :data-testid="`payment-offset-line-${memoIndex}-${lineIndex}`"
                  class="grid items-start gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)_auto]">
                  <template v-if="currentStep === 'credit-memos' && offsetPreview.egcs_fc_creditmemos[memoIndex]?.egcs_fc_allocationmode === 'manual'">
                    <UFormField :label="t('account_receivable.credit_memo_coding')" :name="`egcs_fc_offsetcreditmemos.${memoIndex}.egcs_fc_lines.${lineIndex}.egcs_fc_codingaccount`">
                      <USelectMenu
                        v-model="line.egcs_fc_codingaccount" :items="memoCodingOptions(memoIndex)" value-key="value"
                        :disabled="isSavingPayment" :placeholder="t('common.select')" class="w-full" />
                    </UFormField>
                    <UFormField :label="t('account_receivable.credit_memo_amount')" :name="`egcs_fc_offsetcreditmemos.${memoIndex}.egcs_fc_lines.${lineIndex}.egcs_fc_amount`">
                      <CommonCurrencyInput v-model="line.egcs_fc_amount" :currency="agreementCurrency" :disabled="isSavingPayment" class="w-full" />
                    </UFormField>
                    <CommonActionButton
                      icon="i-lucide-trash" color="error" variant="ghost" type="button" class="mt-6"
                      :aria-label="t('agreement.payments.wizard.remove_coding_line', { number: lineIndex + 1 })"
                      :disabled="isSavingPayment || memo.egcs_fc_lines.length === 1" @click="memo.egcs_fc_lines.splice(lineIndex, 1)" />
                  </template>
                  <template v-else>
                    <span class="break-words text-sm">{{ selectedMemoCodingLabel(memoIndex, line.egcs_fc_codingaccount) }}</span>
                    <span class="font-semibold tabular-nums">{{ formatMoney(parseMoney(line.egcs_fc_amount), agreementCurrency.toUpperCase()) }}</span>
                  </template>
                </div>
                <UButton
                  v-if="currentStep === 'credit-memos' && offsetPreview.egcs_fc_creditmemos[memoIndex]?.egcs_fc_allocationmode === 'manual'"
                  type="button" icon="i-lucide-plus" color="neutral" variant="outline"
                  :label="t('account_receivable.credit_memo_add_line')" :disabled="isSavingPayment" @click="addMemoCodingLine(memoIndex)" />
                <p v-if="wizardErrors.some(error => error.name === `egcs_fc_offsetcreditmemos.${memoIndex}.egcs_fc_lines`)" role="alert" class="text-sm text-error">
                  {{ wizardErrors.find(error => error.name === `egcs_fc_offsetcreditmemos.${memoIndex}.egcs_fc_lines`)?.message }}
                </p>
              </fieldset>
              <p v-if="offsetPreview.egcs_fc_creditmemos.length" class="text-sm text-muted">
                {{ t('agreement.payments.offset_approval_description') }}
              </p>
              <UButton type="button" icon="i-lucide-refresh-cw" color="neutral" variant="outline" :label="t('agreement.payments.wizard.recheck')" :disabled="isSavingPayment" @click="() => void preparePaymentOffset()" />
            </div>
          </CommonWizardShell>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
