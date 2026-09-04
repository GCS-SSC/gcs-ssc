<script setup lang="ts">
import type { FetchError } from 'ofetch'
import { useBusinessStatusState } from '~/composables/useBusinessStatusState'
/* eslint-disable jsdoc/require-jsdoc -- page-local callbacks use self-descriptive signatures */
import { computed, ref, triggerRef, watch } from 'vue'
import type { Ref } from 'vue'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { useGroupedTableExpansion, type GroupedTableRow } from '~/composables/useGroupedTableExpansion'
import CommonCompletionSection from '~/components/Common/Completions/Section.vue'
import CommonCompletionWorkflowPreAction from '~/components/Common/Completions/WorkflowPreAction.vue'
import CommonSelectableTable from '~/components/Common/SelectableTable.vue'
import AgreementClaimReconciliationLinesTable from '~/components/Agreement/AgreementClaimReconciliationLinesTable.vue'
import { useCrudModal, useCrudModalPending } from '~/composables/useCrudModal'
import { useExtensionEntityTabs } from '~/composables/useExtensionEntityTabs'
import { appRouteLocations, authorizedRouteLocation } from '~/utils/route-locations'
import type { EntityAssignmentContext } from '~~/shared/types/schemas/entity-assignment'
import type { AgreementClaimReconciliationTableLine } from '~~/shared/types/agreement-claim-reconciliation-ui'
import type {
  FundingCaseAgreementBudgetLineItemRow,
  FundingCaseAgreementClaimLineItemRow,
  FundingCaseAgreementClaimOverviewRow,
  FundingCaseAgreementClaimReconcileRow,
  FundingCaseAgreementClaimReconcileLineItemRow
} from '~~/shared/types/funding-case-agreement-ui'
import { compareMoney, formatMoneyText, parseMoney, subtractMoney, sumMoney, type Money } from '~~/shared/utils/money'

type ClaimSubmissionTableRow = {
  id: string
  costCategoryGroup: string
  costSubsectionGroup: string
  costCategoryLabel: string
  costSubsectionLabel: string
  lineItemNameEn: string
  lineItemNameFr: string
  description: string
  submittedAmount: Money
  reconciledAmount: Money
  balance: Money
  budgetLineId?: string
  claimLineId?: string
  claimLine?: FundingCaseAgreementClaimLineItemRow
  isUnallocated: boolean
}

type GroupedClaimSubmissionRow = GroupedTableRow<ClaimSubmissionTableRow>
type ReconciliationEditorLine = {
  claim_line_id: string
  reconcile_line_id: string | null
  description: string
  submitted_line_item: string | null
  submitted_amount: Money
  egcs_fc_reconciled: Money | null
  egcs_fc_sampled: Money | null
  egcs_fc_rationale: string | null
}
type ReconciliationEditorDetail = {
  reconciliation: { id: string, egcs_fc_isopen: boolean }
  lines: ReconciliationEditorLine[]
  can_update: boolean
  can_cancel: boolean
  is_assigned: boolean
}
const fetchReconciliationEditorDetail = $fetch as unknown as (url: string) => Promise<ReconciliationEditorDetail>

definePageMeta({
  key: route => route.fullPath,
  i18n: {
    paths: {
      en: '/agreements/[id]/claims/[claimId]',
      fr: '/ententes/[id]/reclamations/[claimId]'
    }
  }
})

const MONTH_KEYS = ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar'] as const
const ACTIVE_CLAIM_WORKFLOW_STATES = new Set(['pending', 'active', 'awaiting_action', 'paused'])
const COST_CATEGORY_GROUP_COLUMN_ID = 'costCategoryGroup'
const COST_SUBSECTION_GROUP_COLUMN_ID = 'costSubsectionGroup'

const { t, locale } = useI18n()
const { getGroupedDisclosureControlsId, getGroupedDisclosureContentId } = useGroupedDisclosureIds()
const route = useRoute()
const localePath = useLocalePath()
const toast = useToast()
const { getHeroCollapsed } = useDashboard()
const { showError } = useApiErrorToast()
const { getBilingualValue } = useBilingualValue()
const { sendJson } = useJsonRequest()
const { getDefinition, isRecordLocked, isDraftStatus, isTerminalStatus } = useBusinessStatusState()

const agreementId = route.params.id as string
const claimId = route.params.claimId as string
const {
  data: profile,
  error: profileError,
  status: profileStatus,
  refresh: refreshProfile
} = useFetch<EntityAssignmentContext, FetchError, string>(`/api/entity-assignments/fundingcaseagreementclaim/${claimId}/context`)

const draftClaimAmounts: Ref<Record<string, string>> = ref({})
const draftReconciledAmounts: Ref<Record<string, string>> = ref({})
const draftSampledAmounts: Ref<Record<string, string>> = ref({})
const draftRationales: Ref<Record<string, string>> = ref({})
const draftAllocations: Ref<Record<string, string | null>> = ref({})
const submissionSearch: Ref<string> = ref('')
const submissionPagination: Ref<{ pageIndex: number, pageSize: number }> = ref({
  pageIndex: 0,
  pageSize: 50
})
const selectedReconcileId: Ref<string | null> = ref(null)
const isSavingSubmission: Ref<boolean> = ref(false)
const allocatingClaimLineId: Ref<string | null> = ref(null)
const isSavingReconcileFinal: Ref<boolean> = ref(false)
const isStartingReconcile: Ref<boolean> = ref(false)
const isWithdrawingClaim: Ref<boolean> = ref(false)
const isCancellingClaim: Ref<boolean> = ref(false)
const isCancellingReconcile: Ref<boolean> = ref(false)
const approvalsRefreshKey: Ref<number> = ref(0)
const selectedReconcileDetail: Ref<ReconciliationEditorDetail | null> = ref(null)
const isSavingReconcile: Ref<boolean> = ref(false)
const draftReconcileIsFinal: Ref<boolean> = ref(false)
const reconcileLineModal = useCrudModal<AgreementClaimReconciliationTableLine, AgreementClaimReconciliationTableLine>({
  updateState: line => ({ ...line })
})
const selectedReconcileLine = reconcileLineModal.selected
const isReconcileLineModalOpen = reconcileLineModal.isOpen
const reconcileLinePending = useCrudModalPending(reconcileLineModal.captureSession)
const isSavingReconcileLine = reconcileLinePending.isPending
let reconcileDetailGeneration = 0
const isHeroCollapsed = getHeroCollapsed('agreement-claim-detail')
const selectedClaimTab: Ref<string> = ref('submission')
const authorizedClaimId = computed(() => profileStatus.value === 'success' ? claimId : undefined)
const {
  tabs: extensionTabs,
  getExtensionTabItem
} = useExtensionEntityTabs({
  target: 'claim',
  claimId: authorizedClaimId
})

const {
  data: overview,
  error: overviewError,
  status: overviewStatus,
  refresh: refreshOverview
} = useFetch<FundingCaseAgreementClaimOverviewRow, FetchError, string>(`/api/agreements/${agreementId}/claims-overview?claimId=${claimId}`)
const { isAssigned } = useEntityAssignmentRoster(
  'fundingcaseagreementclaim',
  claimId,
  { enabled: computed(() => overviewStatus.value === 'success') }
)

const claims = computed<FundingCaseAgreementClaimOverviewRow['claims']>(() => overview.value?.claims ?? [])
const budgetLineItems = computed<FundingCaseAgreementClaimOverviewRow['budgetLineItems']>(() => overview.value?.budgetLineItems ?? [])
const claimLineItems = computed<FundingCaseAgreementClaimOverviewRow['lineItems']>(() => overview.value?.lineItems ?? [])
const reconciles = computed<FundingCaseAgreementClaimOverviewRow['reconciles']>(() => overview.value?.reconciles ?? [])
const reconcileLineItems = computed<FundingCaseAgreementClaimOverviewRow['reconcileLineItems']>(() => overview.value?.reconcileLineItems ?? [])
const activeClaim = computed(() => claims.value.find((claim: FundingCaseAgreementClaimOverviewRow['claims'][number]) => String(claim.id) === claimId) ?? null)
const activeBudgetLineItems = computed(() => {
  if (!activeClaim.value) {
    return []
  }

  return budgetLineItems.value.filter((line: FundingCaseAgreementBudgetLineItemRow) => String(line.fiscal_year_id) === String(activeClaim.value?.egcs_fc_fiscalyear))
})
const activeClaimLineItems = computed(() => claimLineItems.value.filter((line: FundingCaseAgreementClaimLineItemRow) => String(line.egcs_fc_fundingagreementclaim) === claimId))
const activeUnallocatedClaimLineItems = computed(() => activeClaimLineItems.value.filter((line: FundingCaseAgreementClaimLineItemRow) =>
  line.egcs_fc_fundingagreementbudgetlineitem === null || line.egcs_fc_fundingagreementbudgetlineitem === undefined
))
const activeClaimReconciles = computed(() =>
  reconciles.value
    .filter((reconcile: FundingCaseAgreementClaimReconcileRow) => String(reconcile.egcs_fc_fundingagreementclaim) === claimId)
    .slice()
    .sort((left: FundingCaseAgreementClaimReconcileRow, right: FundingCaseAgreementClaimReconcileRow) => Number(right.id) - Number(left.id))
)
const successfulReconcileIds = computed(() => new Set(
  activeClaimReconciles.value
    .filter((reconcile: FundingCaseAgreementClaimReconcileRow) => reconcile.lifecycleTerminus === 'positive')
    .map((reconcile: FundingCaseAgreementClaimReconcileRow) => String(reconcile.id))
))
const activeReconcile = computed(() =>
  activeClaimReconciles.value.find((reconcile: FundingCaseAgreementClaimReconcileRow) => String(reconcile.id) === selectedReconcileId.value)
  ?? activeClaimReconciles.value[0]
  ?? null
)
const activeReconcileLineItems = computed(() => {
  if (!activeReconcile.value) {
    return []
  }

  return reconcileLineItems.value.filter((line: FundingCaseAgreementClaimReconcileLineItemRow) => String(line.egcs_fc_fundingagreementclaimreconcile) === String(activeReconcile.value?.id))
})
const activeClaimStatus = computed(() => getDefinition(activeClaim.value?.egcs_fc_status))
const activeClaimIsLocked = computed(() => isRecordLocked(activeClaim.value))
const canCreateClaimLineItems = computed(() =>
  isAssigned.value && !activeClaimIsLocked.value
)
const canUpdateClaim = computed(() =>
  isAssigned.value && !activeClaimIsLocked.value
)
const canAllocateClaimLines = computed(() =>
  isAssigned.value
  && !activeClaimIsLocked.value
)
const claimHasActiveWorkflow = computed(() =>
  ACTIVE_CLAIM_WORKFLOW_STATES.has(activeClaim.value?.workflowRuntimeState ?? '')
  || ACTIVE_CLAIM_WORKFLOW_STATES.has(activeClaim.value?.approvalRuntimeState ?? ''))
const canWithdrawClaim = computed(() => isAssigned.value
  && activeClaim.value !== null
  && claimHasActiveWorkflow.value
  && activeClaimStatus.value?.readOnly === true
  && !isTerminalStatus(activeClaim.value.egcs_fc_status)
  && activeClaimReconciles.value.length === 0)
const approvedFinalReconcile = computed(() =>
  activeClaimReconciles.value.find((reconcile: FundingCaseAgreementClaimReconcileRow) =>
    reconcile.egcs_fc_isfinal === true && reconcile.approvalRuntimeState === 'approved'
  ) ?? null
)
const claimHasApprovedFinalReconcile = computed(() => Boolean(approvedFinalReconcile.value))
const canCancelClaim = computed(() =>
  isAssigned.value
  && Boolean(activeClaim.value)
  && claimHasActiveWorkflow.value
  && !isDraftStatus(activeClaim.value?.egcs_fc_status)
  && !isTerminalStatus(activeClaim.value?.egcs_fc_status)
)
const claimIsReadyForReconcile = computed(() => activeClaim.value?.hasPositiveCompletionTerminus === true)
const canStartReconcile = computed(() =>
  isAssigned.value
  && claimIsReadyForReconcile.value
  && activeUnallocatedClaimLineItems.value.length === 0
  && !claimHasApprovedFinalReconcile.value
)
const canUpdateReconcile = computed(() => selectedReconcileDetail.value?.can_update === true)
const canWorkReconcileWorkflow = computed(() => selectedReconcileDetail.value?.is_assigned === true)
const canCancelReconcile = computed(() => selectedReconcileDetail.value?.can_cancel === true)
const canCreateReconcileLineItems = canUpdateReconcile
const showReconcileCompletion = computed(() => Boolean(activeReconcile.value))
const hasLoadError = computed(() =>
  Boolean(profileError.value)
  || Boolean(overviewError.value)
  || profileStatus.value === 'error'
  || overviewStatus.value === 'error'
)
const isLoadingDetail = computed(() => profileStatus.value === 'pending' || overviewStatus.value === 'pending')
const retryLoad = async () => {
  await Promise.all([refreshProfile(), refreshOverview()])
}

const breadcrumbItems = computed(() => [
  { label: t('agreement.title'), to: localePath(appRouteLocations.agreements()) },
  {
    label: getBilingualValue(profile.value, 'egcs_fc_title', agreementId),
    to: authorizedRouteLocation(profile.value?.can_read_agreement, localePath(appRouteLocations.agreementDetail(agreementId)))
  },
  { label: activeClaim.value ? t('agreement.claims.claim_label', { id: activeClaim.value.id }) : claimId }
])

const claimTabs = computed(() => [
  {
    key: 'agreement.claims.submission_title',
    value: 'submission',
    icon: 'i-lucide-file-input'
  },
  {
    key: 'agreement.claims.reconcile_title',
    value: 'reconciliation',
    icon: 'i-lucide-list-checks'
  },
  {
    key: 'workflow.title',
    value: 'workflows',
    icon: 'i-lucide-workflow'
  },
  {
    key: 'attachments.title',
    value: 'attachments',
    icon: 'i-lucide-paperclip'
  },
  {
    key: 'assignments.title',
    value: 'assignments',
    icon: 'i-lucide-users'
  },
  ...extensionTabs.value
])
const selectedExtensionTab = computed(() => getExtensionTabItem(selectedClaimTab.value))

const claimLinesByBudgetId = computed(() => {
  const byId = new Map<string, FundingCaseAgreementClaimLineItemRow[]>()
  for (const line of activeClaimLineItems.value) {
    if (line.egcs_fc_fundingagreementbudgetlineitem === null || line.egcs_fc_fundingagreementbudgetlineitem === undefined) {
      continue
    }

    const budgetLineId = String(line.egcs_fc_fundingagreementbudgetlineitem)
    const lines = byId.get(budgetLineId) ?? []
    lines.push(line)
    byId.set(budgetLineId, lines)
  }
  return byId
})

const activeClaimLineIds = computed(() => new Set(activeClaimLineItems.value.map((line: FundingCaseAgreementClaimLineItemRow) => String(line.id))))

const reconcileLineByClaimLineId = computed(() => {
  const byId = new Map<string, FundingCaseAgreementClaimReconcileLineItemRow>()
  for (const line of activeReconcileLineItems.value) {
    byId.set(String(line.egcs_fc_lineitem), line)
  }
  return byId
})

const canEditClaimSubmissionAmount = (budgetLineId: string): boolean => {
  const existing = claimLinesByBudgetId.value.get(budgetLineId)?.[0]
  return existing ? canUpdateClaim.value : canCreateClaimLineItems.value
}

const canEditReconcileLineItem = (claimLineId: string): boolean => {
  const existing = reconcileLineByClaimLineId.value.get(claimLineId)
  return existing ? canUpdateReconcile.value : canCreateReconcileLineItems.value
}

const canEditClaimSubmission = computed(() => activeBudgetLineItems.value.some((line: FundingCaseAgreementBudgetLineItemRow) =>
  canEditClaimSubmissionAmount(String(line.id))
))

const ZERO_MONEY = parseMoney('0')
const readDraftMoney = (value: string | null | undefined): Money => {
  try {
    return value == null || value === '' ? ZERO_MONEY : parseMoney(value)
  } catch {
    return ZERO_MONEY
  }
}
const totalSubmitted = computed(() => sumMoney(activeClaimLineItems.value.map(line => line.egcs_fc_amount)))
const totalReconciled = computed(() => sumMoney(activeClaimLineItems.value.map(line => readDraftMoney(getDraftReconciledAmount(String(line.id))))))
const totalReconciledAll = computed(() => sumMoney(reconcileLineItems.value
  .filter((line: FundingCaseAgreementClaimReconcileLineItemRow) => successfulReconcileIds.value.has(String(line.egcs_fc_fundingagreementclaimreconcile)))
  .filter((line: FundingCaseAgreementClaimReconcileLineItemRow) => activeClaimLineIds.value.has(String(line.egcs_fc_lineitem)))
  .map(line => line.egcs_fc_reconciled)))
const totalSampled = computed(() => sumMoney(activeClaimLineItems.value.map(line => readDraftMoney(getDraftSampledAmount(String(line.id))))))
const reconciliationTableLines = computed<AgreementClaimReconciliationTableLine[]>(() => activeClaimLineItems.value.map(line => {
  const id = String(line.id)
  const persisted = reconcileLineByClaimLineId.value.get(id)
  const selectedDraftAmount = getDraftReconciledAmount(id)
  return {
    id,
    name: line.egcs_fc_submittedlineitem?.trim()
      || getBilingualValue(line, 'line_item_name', line.egcs_fc_description || t('common.unavailable')),
    description: line.egcs_fc_description,
    costCategory: line.egcs_fc_submittedcostcategory?.trim() || getCostCategoryLabel(line),
    costSubsection: getCostSubsectionLabel(line.egcs_fc_submittedcostsubsection || line.egcs_fc_costsubsection),
    submittedAmount: line.egcs_fc_amount,
    reconciledAmount: selectedDraftAmount,
    sampledAmount: getDraftSampledAmount(id),
    balance: getProjectedReconciliationLineBalance(id, line.egcs_fc_amount, readDraftMoney(selectedDraftAmount)),
    rationale: getDraftRationale(id) || persisted?.egcs_fc_rationale || '',
    editable: canEditReconcileLineItem(id)
  }
}))
const balanceAll = computed(() => subtractMoney(totalSubmitted.value, totalReconciledAll.value))

watch(activeClaimLineItems, () => {
  const nextAmounts: Record<string, string> = {}
  for (const budgetLine of activeBudgetLineItems.value) {
    const existing = claimLinesByBudgetId.value.get(String(budgetLine.id))?.[0]
    nextAmounts[String(budgetLine.id)] = existing?.egcs_fc_amount ?? '0.00'
  }
  draftClaimAmounts.value = nextAmounts
}, { immediate: true })

watch(activeClaimReconciles, reconcilesForClaim => {
  const selectedStillExists = selectedReconcileId.value
    ? reconcilesForClaim.some(reconcile => String(reconcile.id) === selectedReconcileId.value)
    : false

  if (!selectedStillExists) {
    selectedReconcileId.value = reconcilesForClaim[0] ? String(reconcilesForClaim[0].id) : null
  }
}, { immediate: true })

const loadSelectedReconcileDetail = async (reconcile: FundingCaseAgreementClaimReconcileRow | null = activeReconcile.value) => {
  const generation = ++reconcileDetailGeneration
  selectedReconcileDetail.value = null
  if (!reconcile) return

  try {
    const detail = await fetchReconciliationEditorDetail(`/api/claim-reconciliations/${reconcile.id}`)
    if (generation !== reconcileDetailGeneration || String(detail.reconciliation.id) !== String(activeReconcile.value?.id)) return
    selectedReconcileDetail.value = detail
    draftReconciledAmounts.value = Object.fromEntries(detail.lines.map(line => [line.claim_line_id, line.egcs_fc_reconciled ?? '0.00']))
    draftSampledAmounts.value = Object.fromEntries(detail.lines.map(line => [line.claim_line_id, line.egcs_fc_sampled ?? '0.00']))
    draftRationales.value = Object.fromEntries(detail.lines.map(line => [line.claim_line_id, line.egcs_fc_rationale ?? '']))
  } catch (error: unknown) {
    if (generation === reconcileDetailGeneration) showError(error)
  }
}

watch(activeReconcile, async reconcile => {
  await loadSelectedReconcileDetail(reconcile)
}, { immediate: true })

watch(() => activeReconcile.value?.id, () => {
  draftReconcileIsFinal.value = activeReconcile.value?.egcs_fc_isfinal === true
}, { immediate: true })

watch(activeReconcileLineItems, () => {
  const nextReconciled: Record<string, string> = {}
  const nextSampled: Record<string, string> = {}
  const nextRationales: Record<string, string> = {}
  for (const claimLine of activeClaimLineItems.value) {
    const existing = reconcileLineByClaimLineId.value.get(String(claimLine.id))
    nextReconciled[String(claimLine.id)] = existing?.egcs_fc_reconciled ?? '0.00'
    nextSampled[String(claimLine.id)] = existing?.egcs_fc_sampled ?? '0.00'
    nextRationales[String(claimLine.id)] = existing?.egcs_fc_rationale ?? ''
  }
  draftReconciledAmounts.value = nextReconciled
  draftSampledAmounts.value = nextSampled
  draftRationales.value = nextRationales
}, { immediate: true })

watch(activeUnallocatedClaimLineItems, lines => {
  const nextAllocations: Record<string, string | null> = {}
  for (const line of lines) {
    nextAllocations[String(line.id)] = draftAllocations.value[String(line.id)] ?? null
  }
  draftAllocations.value = nextAllocations
}, { immediate: true })

const refreshPage = async () => {
  await refreshOverview()
  approvalsRefreshKey.value += 1
}

const displayValue = (value: string | number | boolean | null | undefined) => {
  if (value === undefined || value === null || value === '') {
    return '-'
  }

  if (typeof value === 'boolean') {
    return value ? t('common.yes') : t('common.no')
  }

  return String(value)
}

const formatMoney = (value: Money) => formatMoneyText(value, locale.value, 'CAD')
const joinLabelParts = (parts: Array<string | number | null | undefined>) =>
  parts
    .map(part => part === null || part === undefined ? '' : String(part).trim())
    .filter(part => part.length > 0)
    .join(' / ')
const getCostCategoryLabel = (line: FundingCaseAgreementBudgetLineItemRow | FundingCaseAgreementClaimLineItemRow) =>
  getBilingualValue(line, 'organization_cost_category_name', t('common.all'))
const getCostSubsectionLabel = (value: string | null | undefined) => {
  const trimmed = String(value ?? '').trim()
  return trimmed.length > 0 ? trimmed : t('common.all')
}
const getReconcileLabel = (reconcile: FundingCaseAgreementClaimReconcileRow) => t('agreement.claims.reconcile_label_with_id', { id: reconcile.id })
const getReconcileReviewerLabel = (reconcile: FundingCaseAgreementClaimReconcileRow) =>
  t('agreement.claims.reviewer_with_reconcile_id', { reviewer: displayValue(reconcile.user_name), id: reconcile.id })
const getMonthLabel = (month: number) => t(`agreement.claims.months.${MONTH_KEYS[month]}`)

const activeClaimFiscalYearLabel = computed(() => activeClaim.value?.fiscal_year_display ?? t('common.unavailable'))
const activeClaimPeriodLabel = computed(() => activeClaim.value
  ? `${getMonthLabel(activeClaim.value.egcs_fc_periodstart)} - ${getMonthLabel(activeClaim.value.egcs_fc_periodend)}`
  : '-'
)
const claimHeroTitle = computed(() => activeClaim.value ? t('agreement.claims.claim_label', { id: activeClaim.value.id }) : '')
const claimHeroMetaItems = computed(() => [
  displayValue(profile.value?.egcs_fc_agreementnumber),
  getBilingualValue(profile.value, 'egcs_fc_title', agreementId),
  `${t('agreement.claims.fiscal_year')}: ${activeClaimFiscalYearLabel.value}`,
  `${t('agreement.claims.period')}: ${activeClaimPeriodLabel.value}`
])
const claimHeroBadges = computed(() => activeClaim.value
  ? [{
      statusId: activeClaim.value.egcs_fc_status,
      isCompleted: activeClaim.value.isCompleted
    }]
  : []
)

const getDraftClaimAmount = (budgetLineId: string) => draftClaimAmounts.value[budgetLineId] ?? '0.00'
const setDraftClaimAmount = (budgetLineId: string, value: string | null | undefined) => {
  draftClaimAmounts.value = { ...draftClaimAmounts.value, [budgetLineId]: value ?? '' }
}
const getDraftReconciledAmount = (claimLineId: string) => draftReconciledAmounts.value[claimLineId] ?? '0.00'
const getDraftSampledAmount = (claimLineId: string) => draftSampledAmounts.value[claimLineId] ?? '0.00'
const getDraftRationale = (claimLineId: string) => draftRationales.value[claimLineId] ?? ''
const setDraftAllocation = (claimLineId: string, value: string | number | null | undefined) => {
  draftAllocations.value = { ...draftAllocations.value, [claimLineId]: value === null || value === undefined ? null : String(value) }
}

const allocationOptions = computed(() =>
  activeBudgetLineItems.value.map(line => ({
    id: String(line.id),
    label_en: joinLabelParts([
      line.organization_cost_category_name_en,
      line.egcs_fc_costsubsection,
      line.line_item_name_en ?? line.egcs_fc_description
    ]),
    label_fr: joinLabelParts([
      line.organization_cost_category_name_fr,
      line.egcs_fc_costsubsection,
      line.line_item_name_fr ?? line.egcs_fc_description
    ])
  }))
)

const getTotalSuccessfulReconciledForClaimLineId = (claimLineId: string | number | null | undefined) => {
  if (claimLineId === undefined || claimLineId === null) {
    return ZERO_MONEY
  }

  return sumMoney(reconcileLineItems.value
    .filter((item: FundingCaseAgreementClaimReconcileLineItemRow) => successfulReconcileIds.value.has(String(item.egcs_fc_fundingagreementclaimreconcile)))
    .filter((item: FundingCaseAgreementClaimReconcileLineItemRow) => String(item.egcs_fc_lineitem) === String(claimLineId))
    .map(item => item.egcs_fc_reconciled))
}

const getSuccessfulReconciledExcludingReconcile = (
  claimLineId: string | number,
  reconcileId: string | number | null | undefined
) => sumMoney(reconcileLineItems.value
  .filter((item: FundingCaseAgreementClaimReconcileLineItemRow) => successfulReconcileIds.value.has(String(item.egcs_fc_fundingagreementclaimreconcile)))
  .filter((item: FundingCaseAgreementClaimReconcileLineItemRow) => String(item.egcs_fc_fundingagreementclaimreconcile) !== String(reconcileId))
  .filter((item: FundingCaseAgreementClaimReconcileLineItemRow) => String(item.egcs_fc_lineitem) === String(claimLineId))
  .map(item => item.egcs_fc_reconciled))

const getProjectedReconciliationLineBalance = (
  claimLineId: string | number,
  submittedAmount: Money,
  reconciledAmount: Money
) => subtractMoney(
  subtractMoney(submittedAmount, getSuccessfulReconciledExcludingReconcile(claimLineId, activeReconcile.value?.id)),
  reconciledAmount
)

const selectedReconcileLineBalance = computed(() => selectedReconcileLine.value
  ? getProjectedReconciliationLineBalance(
      selectedReconcileLine.value.id,
      selectedReconcileLine.value.submittedAmount,
      readDraftMoney(selectedReconcileLine.value.reconciledAmount)
    )
  : ZERO_MONEY
)

const updateSelectedReconciledAmount = (value: string | null | undefined): void => {
  if (!selectedReconcileLine.value) return
  selectedReconcileLine.value.reconciledAmount = value ?? ''
  triggerRef(selectedReconcileLine)
}

const submissionColumns: TableColumnInput<ClaimSubmissionTableRow>[] = [
  { id: COST_CATEGORY_GROUP_COLUMN_ID, accessorKey: COST_CATEGORY_GROUP_COLUMN_ID, headerKey: 'agreement.claims.cost_category' },
  { id: COST_SUBSECTION_GROUP_COLUMN_ID, accessorKey: COST_SUBSECTION_GROUP_COLUMN_ID, headerKey: 'agreement.budget.cost_subsection' },
  { id: 'name', accessorKey: 'lineItemNameEn', headerKey: 'agreement.budget.line_item' },
  { id: 'submittedAmount', accessorKey: 'submittedAmount', headerKey: 'agreement.claims.submitted_amount' },
  { id: 'reconciledAmount', accessorKey: 'reconciledAmount', headerKey: 'agreement.claims.reconciled_amount' },
  { id: 'balance', accessorKey: 'balance', headerKey: 'agreement.claims.balance' }
]

const normalizedSubmissionSearch = computed(() => submissionSearch.value.trim().toLowerCase())
const unallocatedGroupLabel = computed(() => t('agreement.claims.unallocated'))

const claimSubmissionRows = computed<ClaimSubmissionTableRow[]>(() => {
  const budgetRows = activeBudgetLineItems.value.flatMap((budgetLine: FundingCaseAgreementBudgetLineItemRow) => {
    const budgetLineId = String(budgetLine.id)
    const claimLines = claimLinesByBudgetId.value.get(budgetLineId) ?? []
    const costCategoryLabel = getCostCategoryLabel(budgetLine)
    const costSubsectionLabel = getCostSubsectionLabel(budgetLine.egcs_fc_costsubsection)

    if (claimLines.length > 1 && !canUpdateClaim.value) {
      return claimLines.map((claimLine: FundingCaseAgreementClaimLineItemRow) => {
        const submittedAmount = claimLine.egcs_fc_amount
        const claimLineReconciledAmount = getTotalSuccessfulReconciledForClaimLineId(claimLine.id)

        return {
          id: `claim:${claimLine.id}`,
          costCategoryGroup: costCategoryLabel,
          costSubsectionGroup: costSubsectionLabel,
          costCategoryLabel,
          costSubsectionLabel,
          lineItemNameEn: budgetLine.line_item_name_en ?? budgetLine.egcs_fc_description,
          lineItemNameFr: budgetLine.line_item_name_fr ?? budgetLine.egcs_fc_description,
          description: claimLine.egcs_fc_description,
          submittedAmount,
          reconciledAmount: claimLineReconciledAmount,
          balance: subtractMoney(submittedAmount, claimLineReconciledAmount),
          budgetLineId,
          claimLineId: String(claimLine.id),
          claimLine,
          isUnallocated: false
        }
      })
    }

    const claimLine = claimLines[0]
    const submittedAmount = canEditClaimSubmissionAmount(budgetLineId)
      ? getDraftClaimAmount(budgetLineId)
      : claimLine?.egcs_fc_amount ?? ZERO_MONEY
    const budgetLineReconciledAmount = getTotalSuccessfulReconciledForClaimLineId(claimLine?.id)

    return [{
      id: claimLine ? `claim:${claimLine.id}` : `budget:${budgetLineId}`,
      costCategoryGroup: costCategoryLabel,
      costSubsectionGroup: costSubsectionLabel,
      costCategoryLabel,
      costSubsectionLabel,
      lineItemNameEn: budgetLine.line_item_name_en ?? budgetLine.egcs_fc_description,
      lineItemNameFr: budgetLine.line_item_name_fr ?? budgetLine.egcs_fc_description,
      description: claimLine?.egcs_fc_description ?? budgetLine.egcs_fc_description,
      submittedAmount: readDraftMoney(submittedAmount),
      reconciledAmount: budgetLineReconciledAmount,
      balance: subtractMoney(readDraftMoney(submittedAmount), budgetLineReconciledAmount),
      budgetLineId,
      claimLineId: claimLine ? String(claimLine.id) : undefined,
      claimLine,
      isUnallocated: false
    }]
  })

  const unallocatedRows = activeUnallocatedClaimLineItems.value.map((line: FundingCaseAgreementClaimLineItemRow) => {
    const submittedCostCategory = line.egcs_fc_submittedcostcategory?.trim()
    const submittedCostSubsection = line.egcs_fc_submittedcostsubsection?.trim()
    const submittedLineItem = line.egcs_fc_submittedlineitem?.trim()
    const categoryLabel = submittedCostCategory && submittedCostCategory.length > 0
      ? submittedCostCategory
      : unallocatedGroupLabel.value
    const subsectionLabel = submittedCostSubsection && submittedCostSubsection.length > 0
      ? submittedCostSubsection
      : t('common.all')
    const lineItemLabel = submittedLineItem && submittedLineItem.length > 0
      ? submittedLineItem
      : line.egcs_fc_description || t('common.unavailable')
    const reconciledAmount = getTotalSuccessfulReconciledForClaimLineId(line.id)

    return {
      id: `unallocated:${line.id}`,
      costCategoryGroup: categoryLabel,
      costSubsectionGroup: subsectionLabel,
      costCategoryLabel: categoryLabel,
      costSubsectionLabel: subsectionLabel,
      lineItemNameEn: lineItemLabel,
      lineItemNameFr: lineItemLabel,
      description: line.egcs_fc_description,
      submittedAmount: line.egcs_fc_amount,
      reconciledAmount,
      balance: subtractMoney(line.egcs_fc_amount, reconciledAmount),
      claimLineId: String(line.id),
      claimLine: line,
      isUnallocated: true
    }
  })

  return [...budgetRows, ...unallocatedRows]
})

const filteredClaimSubmissionRows = computed(() => {
  if (normalizedSubmissionSearch.value.length === 0) {
    return claimSubmissionRows.value
  }

  return claimSubmissionRows.value.filter(row => [
    row.costCategoryLabel,
    row.costSubsectionLabel,
    row.lineItemNameEn,
    row.lineItemNameFr,
    row.description
  ].some(value => value.toLowerCase().includes(normalizedSubmissionSearch.value)))
})

const {
  expandedRows: submissionExpandedRows,
  grouping: submissionGrouping,
  columnVisibility: submissionColumnVisibility,
  groupingOptions: submissionGroupingOptions,
  expandedOptions: submissionExpandedOptions,
  isGroupedRow: isGroupedSubmissionRow,
  isGroupRow: isSubmissionGroupRow,
  getLeafRows: getSubmissionLeafRows,
  getGroupedRowCount: getSubmissionGroupedRowCount,
  canExpandGroupedRow: canExpandSubmissionGroupedRow,
  updateExpandedRows: updateSubmissionExpandedRows
} = useGroupedTableExpansion<ClaimSubmissionTableRow>({
  rows: filteredClaimSubmissionRows,
  groups: [
    {
      id: COST_CATEGORY_GROUP_COLUMN_ID,
      getValue: row => row.costCategoryGroup
    },
    {
      id: COST_SUBSECTION_GROUP_COLUMN_ID,
      getValue: row => row.costSubsectionGroup
    }
  ],
  defaultExpanded: true
})

const isSubmissionCostCategoryGroupRow = (row: GroupedClaimSubmissionRow) => isSubmissionGroupRow(row, COST_CATEGORY_GROUP_COLUMN_ID)
const isSubmissionCostSubsectionGroupRow = (row: GroupedClaimSubmissionRow) => isSubmissionGroupRow(row, COST_SUBSECTION_GROUP_COLUMN_ID)
const getSubmissionGroupedTotal = (row: GroupedClaimSubmissionRow, key: 'submittedAmount' | 'reconciledAmount' | 'balance') =>
  sumMoney(getSubmissionLeafRows(row).map(leafRow => leafRow.original[key]))

const isReconcileMutationPending = computed(() =>
  isSavingReconcile.value || isSavingReconcileFinal.value || isSavingReconcileLine.value
)

const selectReconcile = (reconcileId: string | number) => {
  if (isReconcileMutationPending.value) return
  selectedReconcileId.value = String(reconcileId)
}

const getReconcileTotal = (reconcileId: string | number, key: 'egcs_fc_reconciled' | 'egcs_fc_sampled') =>
  sumMoney(reconcileLineItems.value
    .filter((line: FundingCaseAgreementClaimReconcileLineItemRow) => String(line.egcs_fc_fundingagreementclaimreconcile) === String(reconcileId))
    .flatMap(line => line[key] == null ? [] : [line[key]]))

const getReconcileBalance = (reconcile: FundingCaseAgreementClaimReconcileRow) => subtractMoney(
  sumMoney(activeClaimLineItems.value.map(line => subtractMoney(
    line.egcs_fc_amount,
    getSuccessfulReconciledExcludingReconcile(line.id, reconcile.id)
  ))),
  getReconcileTotal(reconcile.id, 'egcs_fc_reconciled')
)

const activeReconcileIsFinal = computed(() => activeReconcile.value?.egcs_fc_isfinal === true)
const otherFinalReconcile = computed(() =>
  activeClaimReconciles.value.find((reconcile: FundingCaseAgreementClaimReconcileRow) =>
    reconcile.egcs_fc_isfinal === true && String(reconcile.id) !== String(activeReconcile.value?.id)
  ) ?? null
)
const canEditActiveReconcileFinal = computed(() =>
  Boolean(activeReconcile.value)
  && canUpdateReconcile.value
  && !isSavingReconcileFinal.value
  && (activeReconcileIsFinal.value || !otherFinalReconcile.value)
)

const saveSubmission = async () => {
  if (!activeClaim.value || isSavingSubmission.value || !canEditClaimSubmission.value) {
    return
  }

  try {
    isSavingSubmission.value = true
    const validatedAmounts = new Map(activeBudgetLineItems.value.map(budgetLine => {
      const budgetLineId = String(budgetLine.id)
      return [budgetLineId, parseMoney(getDraftClaimAmount(budgetLineId))] as const
    }))
    let didMutate = false
    for (const budgetLine of activeBudgetLineItems.value) {
      const budgetLineId = String(budgetLine.id)
      const amount = validatedAmounts.get(budgetLineId)!
      const existing = claimLinesByBudgetId.value.get(budgetLineId)?.[0]
      if (existing && existing.egcs_fc_amount !== amount && canUpdateClaim.value) {
        await sendJson(`/api/agreements/${agreementId}/claim-line-items/${existing.id}`, 'PATCH', { egcs_fc_amount: amount, egcs_fc_description: budgetLine.egcs_fc_description })
        didMutate = true
      }
      if (!existing && compareMoney(readDraftMoney(amount), ZERO_MONEY) !== 0 && canCreateClaimLineItems.value) {
        await sendJson(`/api/agreements/${agreementId}/claim-line-items`, 'POST', {
          egcs_fc_fundingagreementclaim: claimId,
          egcs_fc_fundingagreementbudgetlineitem: budgetLineId,
          egcs_fc_description: budgetLine.egcs_fc_description,
          egcs_fc_amount: amount,
          egcs_fc_currency: 'cad'
        })
        didMutate = true
      }
    }
    if (!didMutate) {
      return
    }

    await refreshPage()
    toast.add({ title: t('common.success'), description: t('agreement.claims.saved_submission'), color: 'success' })
  } catch (error: unknown) {
    showError(error)
  } finally {
    isSavingSubmission.value = false
  }
}

const allocateClaimLine = async (line: FundingCaseAgreementClaimLineItemRow) => {
  const lineId = String(line.id)
  const budgetLineItemId = draftAllocations.value[lineId]

  if (!budgetLineItemId || allocatingClaimLineId.value !== null || !canAllocateClaimLines.value) {
    return
  }

  try {
    allocatingClaimLineId.value = lineId
    await sendJson(`/api/agreements/${agreementId}/claim-line-items/${lineId}`, 'PATCH', {
      egcs_fc_fundingagreementbudgetlineitem: budgetLineItemId
    })
    await refreshPage()
    toast.add({ title: t('common.success'), description: t('agreement.claims.allocation_saved'), color: 'success' })
  } catch (error: unknown) {
    showError(error)
  } finally {
    allocatingClaimLineId.value = null
  }
}

const transitionClaim = async (
  action: 'withdraw' | 'cancel',
  loadingRef: Ref<boolean>,
  successKey: string
) => {
  if (!activeClaim.value || loadingRef.value) {
    return
  }

  try {
    loadingRef.value = true
    await sendJson(`/api/agreements/${agreementId}/claims/${claimId}/${action}`, 'POST')
    await refreshPage()
    toast.add({ title: t('common.success'), description: t(successKey), color: 'success' })
  } catch (error: unknown) {
    showError(error)
  } finally {
    loadingRef.value = false
  }
}

const withdrawClaim = async () => {
  if (!canWithdrawClaim.value) {
    return
  }

  await transitionClaim('withdraw', isWithdrawingClaim, 'agreement.claims.withdraw_success')
}

const cancelClaim = async () => {
  if (!canCancelClaim.value) {
    return
  }

  await transitionClaim('cancel', isCancellingClaim, 'agreement.claims.cancel_success')
}

const startReconcile = async () => {
  if (!activeClaim.value || isStartingReconcile.value || !canStartReconcile.value) {
    return
  }

  try {
    isStartingReconcile.value = true
    const created = await sendJson<FundingCaseAgreementClaimReconcileRow>(`/api/agreements/${agreementId}/claim-reconciles`, 'POST', {
      egcs_fc_fundingagreementclaim: claimId,
      egcs_fc_isfinal: false
    })
    await refreshPage()
    selectedReconcileId.value = String(created.id)
  } catch (error: unknown) {
    showError(error)
  } finally {
    isStartingReconcile.value = false
  }
}

const setActiveReconcileFinal = (value: boolean | 'indeterminate') => {
  if (!activeReconcile.value || !canEditActiveReconcileFinal.value || value === 'indeterminate') {
    return
  }

  draftReconcileIsFinal.value = value
}

const saveReconcile = async (showSuccess = true): Promise<boolean> => {
  const reconcile = activeReconcile.value
  const detail = selectedReconcileDetail.value
  if (!reconcile || !detail || !canUpdateReconcile.value || isSavingReconcile.value) return false

  const desiredIsFinal = draftReconcileIsFinal.value
  let lineRequests: Array<{
    line: ReconciliationEditorLine
    body: { egcs_fc_reconciled: Money, egcs_fc_sampled: Money, egcs_fc_rationale: string | null }
  }>
  try {
    lineRequests = detail.lines.map(line => ({
      line,
      body: {
        egcs_fc_reconciled: parseMoney(getDraftReconciledAmount(line.claim_line_id)),
        egcs_fc_sampled: parseMoney(getDraftSampledAmount(line.claim_line_id)),
        egcs_fc_rationale: getDraftRationale(line.claim_line_id) || null
      }
    }))
  } catch (error: unknown) {
    showError(error)
    return false
  }
  isSavingReconcile.value = true
  try {
    await sendJson(`/api/claim-reconciliations/${reconcile.id}/lines/bulk`, 'PATCH', {
      lines: lineRequests.map(({ line, body }) => ({
        claim_line_id: line.claim_line_id,
        reconcile_line_id: line.reconcile_line_id,
        ...body
      })),
      egcs_fc_isfinal: desiredIsFinal
    })
    await refreshPage()
    await loadSelectedReconcileDetail()
    if (showSuccess) toast.add({ title: t('common.success'), description: t('agreement.claims.saved_reconcile'), color: 'success' })
    return true
  } catch (error: unknown) {
    showError(error)
    return false
  } finally {
    isSavingReconcile.value = false
  }
}

const saveReconcileLine = async () => {
  const line = selectedReconcileLine.value
  const reconcile = activeReconcile.value
  const detailLine = selectedReconcileDetail.value?.lines.find(item => item.claim_line_id === line?.id)
  const detail = selectedReconcileDetail.value
  const session = reconcileLineModal.captureSession()
  if (!line || !reconcile || !detail || !detailLine || !line.editable || !reconcileLinePending.begin(session)) return
  const desiredIsFinal = draftReconcileIsFinal.value

  try {
    const lines = detail.lines.map(item => item.claim_line_id === line.id
      ? {
          claim_line_id: item.claim_line_id,
          reconcile_line_id: item.reconcile_line_id,
          egcs_fc_reconciled: parseMoney(line.reconciledAmount),
          egcs_fc_sampled: line.sampledAmount == null || line.sampledAmount === '' ? null : parseMoney(line.sampledAmount),
          egcs_fc_rationale: line.rationale.trim() || null
        }
      : {
          claim_line_id: item.claim_line_id,
          reconcile_line_id: item.reconcile_line_id,
          egcs_fc_reconciled: parseMoney(getDraftReconciledAmount(item.claim_line_id)),
          egcs_fc_sampled: parseMoney(getDraftSampledAmount(item.claim_line_id)),
          egcs_fc_rationale: getDraftRationale(item.claim_line_id) || null
        })
    await sendJson(`/api/claim-reconciliations/${reconcile.id}/lines/bulk`, 'PATCH', {
      lines,
      egcs_fc_isfinal: desiredIsFinal
    })
    await refreshPage()
    await loadSelectedReconcileDetail()
    reconcileLineModal.closeSession(session)
    toast.add({ title: t('common.success'), description: t('agreement.claims.saved_reconcile_line'), color: 'success' })
  } catch (error: unknown) {
    showError(error)
  } finally {
    reconcileLinePending.end(session)
  }
}
const refreshReconcileWorkspace = async () => {
  await refreshPage()
  await loadSelectedReconcileDetail()
}
const cancelReconciliation = async () => {
  const reconcile = activeReconcile.value
  if (!reconcile || !canCancelReconcile.value || isCancellingReconcile.value) return
  if (!window.confirm(t('agreement.claims.cancel_reconcile_confirmation'))) return
  try {
    isCancellingReconcile.value = true
    await sendJson(`/api/agreements/${agreementId}/claim-reconciles/${reconcile.id}/cancel`, 'POST')
    await refreshReconcileWorkspace()
    toast.add({
      title: t('common.success'),
      description: t('agreement.claims.cancel_reconcile_success'),
      color: 'success'
    })
  } catch (error: unknown) {
    showError(error)
  } finally {
    isCancellingReconcile.value = false
  }
}
</script>

<template>
  <div class="flex w-full flex-col">
    <UAlert v-if="hasLoadError" color="error" icon="i-lucide-circle-alert" :title="t('common.resource_table_load_failed')" :description="t('common.resource_table_load_failed_description')">
      <template #actions>
        <UButton color="error" variant="soft" icon="i-lucide-refresh-cw" :label="t('common.retry')" :loading="isLoadingDetail" @click="retryLoad" />
      </template>
    </UAlert>
    <div v-else-if="isLoadingDetail && (!profile || !activeClaim)" role="status" aria-live="polite" class="flex min-h-32 items-center justify-center gap-2 text-sm text-muted">
      <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" aria-hidden="true" /><span>{{ t('common.loading_records') }}</span>
    </div>
    <UDashboardPanel v-if="profile && activeClaim" id="agreement-claim-detail" class="w-full">
      <template #header>
        <UDashboardNavbar>
          <template #leading>
            <UDashboardSidebarCollapse />
            <UBreadcrumb :items="breadcrumbItems" class="ml-2" />
          </template>
          <template #right>
            <div class="flex items-center gap-2">
              <UButton
                color="neutral" variant="ghost" :icon="isHeroCollapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'"
                :aria-label="t(isHeroCollapsed ? 'common.expand' : 'common.collapse')" @click="isHeroCollapsed = !isHeroCollapsed" />
              <CommonNavbarSide />
            </div>
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div class="flex flex-1 flex-col">
          <CommonEntityHero
            :is-collapsed="isHeroCollapsed"
            icon="i-lucide-receipt-text"
            :title="claimHeroTitle"
            :meta-items="claimHeroMetaItems"
            :badges="claimHeroBadges" />

          <CommonEntityEditorWorkspace content-test-id="agreement-claim-detail-content">
            <template #sidebar>
              <CommonRouteTabs
                v-model="selectedClaimTab"
                :items="claimTabs"
                orientation="vertical"
                :ui="{
                  root: 'w-full',
                  list: 'w-full flex-col items-stretch p-0',
                  trigger: 'w-full justify-start'
                }" />
            </template>

            <div v-if="selectedClaimTab === 'submission'" class="w-full min-w-0">
              <div class="space-y-8">
                <div class="space-y-4">
                  <div class="flex justify-end">
                    <CommonSaveButton v-if="canEditClaimSubmission" type="button" :label="t('agreement.claims.save_submission')" :loading="isSavingSubmission" :disabled="isSavingSubmission" @click="saveSubmission" />
                  </div>
                  <CommonResourceLayoutCard
                    v-model:search="submissionSearch"
                    v-model:pagination="submissionPagination"
                    :data="filteredClaimSubmissionRows"
                    :columns="submissionColumns"
                    :grouping="submissionGrouping"
                    :grouping-options="submissionGroupingOptions"
                    :expanded-options="submissionExpandedOptions"
                    :column-visibility="submissionColumnVisibility"
                    :expanded="submissionExpandedRows"
                    :total-records="filteredClaimSubmissionRows.length"
                    :loading="overviewStatus === 'pending'"
                    table-class="agreement-claim-submission-table"
                    :show-button="false"
                    :show-column-toggle="false"
                    :search-placeholder="t('agreement.budget.search')"
                    @update:expanded="updateSubmissionExpandedRows">
                    <template #name-cell="{ row }">
                      <div :id="getGroupedDisclosureContentId(row as GroupedClaimSubmissionRow)" class="contents">
                        <div v-if="isSubmissionCostCategoryGroupRow(row as GroupedClaimSubmissionRow)" class="flex w-full items-center gap-3 py-1">
                          <CommonGroupedDisclosureButton
                            v-if="canExpandSubmissionGroupedRow(row as GroupedClaimSubmissionRow)"
                            class="group flex min-w-0 items-center gap-3 text-left"
                            :expanded="row.getIsExpanded?.() === true"
                            :controls="getGroupedDisclosureControlsId(row.id)"
                            :label="row.original.costCategoryLabel"
                            @toggle="row.toggleExpanded?.()">
                            <UIcon
                              :name="row.getIsExpanded?.() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                              class="size-4 text-zinc-400 transition-colors group-hover:text-primary" />
                            <span class="text-sm font-semibold text-zinc-900 dark:text-white">
                              {{ row.original.costCategoryLabel }}
                            </span>
                            <CommonStatusBadge variant="count" size="sm" :label="String(getSubmissionGroupedRowCount(row as GroupedClaimSubmissionRow))" />
                          </CommonGroupedDisclosureButton>
                        </div>

                        <div v-else-if="isSubmissionCostSubsectionGroupRow(row as GroupedClaimSubmissionRow)" class="flex w-full items-center gap-3 py-1 pl-6">
                          <CommonGroupedDisclosureButton
                            v-if="canExpandSubmissionGroupedRow(row as GroupedClaimSubmissionRow)"
                            class="group flex min-w-0 items-center gap-3 text-left"
                            :expanded="row.getIsExpanded?.() === true"
                            :controls="getGroupedDisclosureControlsId(row.id)"
                            :label="row.original.costSubsectionLabel"
                            @toggle="row.toggleExpanded?.()">
                            <UIcon
                              :name="row.getIsExpanded?.() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                              class="size-4 text-zinc-400 transition-colors group-hover:text-primary" />
                            <span class="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                              {{ row.original.costSubsectionLabel }}
                            </span>
                            <CommonStatusBadge variant="count" size="sm" :label="String(getSubmissionGroupedRowCount(row as GroupedClaimSubmissionRow))" />
                          </CommonGroupedDisclosureButton>
                        </div>

                        <div v-else class="flex min-w-0 max-w-full flex-col gap-2 pl-12">
                          <div class="flex flex-wrap items-center gap-2">
                            <CommonStatusBadge v-if="row.original.isUnallocated" variant="warning" :label="t('agreement.claims.unallocated')" />
                            <CommonBilingualName
                              :name-en="row.original.lineItemNameEn"
                              :name-fr="row.original.lineItemNameFr" />
                          </div>
                          <p v-if="row.original.description" class="min-w-0 max-w-full whitespace-normal break-words text-sm text-zinc-500 dark:text-zinc-400">
                            {{ row.original.description }}
                          </p>
                          <div v-if="row.original.isUnallocated && row.original.claimLine && canAllocateClaimLines" class="flex flex-wrap items-end gap-2 pt-1">
                            <UFormField :label="t('agreement.claims.allocate_to_budget_line')" :name="`allocation-${row.original.claimLine.id}`" class="min-w-72">
                              <CommonBilingualSelectMenu
                                :model-value="draftAllocations[String(row.original.claimLine.id)]"
                                :items="allocationOptions"
                                value-key="id"
                                label-en-key="label_en"
                                label-fr-key="label_fr"
                                searchable
                                @update:model-value="value => setDraftAllocation(String(row.original.claimLine!.id), value)" />
                            </UFormField>
                            <UButton
                              color="primary"
                              icon="i-lucide-link"
                              class="cursor-default"
                              :loading="allocatingClaimLineId === String(row.original.claimLine.id)"
                              :disabled="allocatingClaimLineId !== null || !draftAllocations[String(row.original.claimLine.id)]"
                              @click="allocateClaimLine(row.original.claimLine)">
                              {{ t('agreement.claims.allocate') }}
                            </UButton>
                          </div>
                        </div>
                      </div>
                    </template>

                    <template #submittedAmount-cell="{ row }">
                      <span v-if="isGroupedSubmissionRow(row as GroupedClaimSubmissionRow)" class="font-medium text-zinc-700 dark:text-zinc-200">
                        {{ formatMoney(getSubmissionGroupedTotal(row as GroupedClaimSubmissionRow, 'submittedAmount')) }}
                      </span>
                      <UInput
                        v-else-if="row.original.budgetLineId && canEditClaimSubmissionAmount(row.original.budgetLineId)"
                        :model-value="getDraftClaimAmount(row.original.budgetLineId)"
                        inputmode="decimal"
                        :aria-label="t('agreement.claims.submitted_amount_for', { name: row.original.lineItemNameEn })"
                        class="w-44"
                        @update:model-value="value => setDraftClaimAmount(row.original.budgetLineId!, value)" />
                      <span v-else class="font-medium text-zinc-700 dark:text-zinc-200">
                        {{ formatMoney(row.original.submittedAmount) }}
                      </span>
                    </template>

                    <template #reconciledAmount-cell="{ row }">
                      <span class="font-medium text-zinc-700 dark:text-zinc-200">
                        {{ formatMoney(isGroupedSubmissionRow(row as GroupedClaimSubmissionRow) ? getSubmissionGroupedTotal(row as GroupedClaimSubmissionRow, 'reconciledAmount') : row.original.reconciledAmount) }}
                      </span>
                    </template>

                    <template #balance-cell="{ row }">
                      <span class="font-bold text-primary">
                        {{ formatMoney(isGroupedSubmissionRow(row as GroupedClaimSubmissionRow) ? getSubmissionGroupedTotal(row as GroupedClaimSubmissionRow, 'balance') : row.original.balance) }}
                      </span>
                    </template>

                    <template #footer-left>
                      <div data-testid="claim-submission-totals" class="flex flex-wrap gap-x-5 gap-y-1">
                        <span>{{ t('agreement.claims.total') }}: {{ formatMoney(totalSubmitted) }}</span>
                        <span>{{ t('agreement.claims.reconciled_amount') }}: {{ formatMoney(totalReconciledAll) }}</span>
                        <span class="text-primary">{{ t('agreement.claims.balance') }}: {{ formatMoney(balanceAll) }}</span>
                      </div>
                    </template>
                  </CommonResourceLayoutCard>
                </div>

                <div class="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
                  <p class="text-sm text-zinc-500 dark:text-zinc-400">
                    {{ t('agreement.claims.review_readiness_description') }}
                  </p>
                  <div class="flex flex-wrap justify-end gap-2">
                    <UButton
                      v-if="canWithdrawClaim"
                      color="neutral"
                      variant="outline"
                      icon="i-lucide-undo-2"
                      class="cursor-default"
                      :loading="isWithdrawingClaim"
                      :disabled="isWithdrawingClaim || isCancellingClaim"
                      @click="withdrawClaim">
                      {{ t('agreement.claims.withdraw') }}
                    </UButton>
                    <UButton
                      v-if="canCancelClaim"
                      color="error"
                      variant="outline"
                      icon="i-lucide-ban"
                      class="cursor-default"
                      :loading="isCancellingClaim"
                      :disabled="isCancellingClaim || isWithdrawingClaim"
                      @click="cancelClaim">
                      {{ t('agreement.claims.cancel') }}
                    </UButton>
                  </div>
                </div>
              </div>
            </div>

            <CommonWorkflowSection
              v-else-if="selectedClaimTab === 'workflows'"
              entity-type="fundingcaseagreementclaim"
              :entity-id="claimId"
              purpose="standard"
              :can-edit="isAssigned"
              :refresh-key="approvalsRefreshKey"
              @changed="refreshPage" />

            <div v-else-if="selectedClaimTab === 'reconciliation'" class="w-full min-w-0">
              <CommonCompletionWorkflowPreAction
                v-if="!claimIsReadyForReconcile"
                entity-type="fundingcaseagreementclaim"
                :entity-id="claimId"
                :can-edit="isAssigned"
                :is-locked="!canUpdateClaim"
                show-when-unconfigured
                title-key="agreement.claims.completion.title"
                description-key="agreement.claims.completion.description"
                action-label-key="agreement.claims.ready_for_review"
                completed-success-key="agreement.claims.completion.completed_success"
                @changed="refreshPage" />
              <div v-else class="space-y-10">
                <CommonSection :title="t('agreement.claims.reconcile_worklist_title')" badge="01" :grid-cols="1">
                  <div class="space-y-4">
                    <div class="flex flex-wrap items-end justify-between gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-800">
                      <div class="space-y-1">
                        <div class="flex flex-wrap items-center gap-2">
                          <CommonStatusBadge variant="count" :label="t('agreement.claims.reconciliation_count', { count: activeClaimReconciles.length })" />
                          <CommonStatusBadge v-if="claimHasApprovedFinalReconcile" variant="final" label-key="agreement.claims.final_reconcile_approved" />
                        </div>
                        <p class="max-w-3xl text-sm text-zinc-500 dark:text-zinc-400">
                          {{ t(claimHasApprovedFinalReconcile ? 'agreement.claims.final_reconcile_approved_description' : 'agreement.claims.reconcile_collection_description') }}
                        </p>
                      </div>
                      <UButton
                        v-if="canStartReconcile"
                        color="primary"
                        icon="i-lucide-plus"
                        class="cursor-default"
                        :loading="isStartingReconcile"
                        :disabled="isStartingReconcile"
                        :aria-label="t('agreement.claims.new_reconcile_with_context')"
                        @click="startReconcile">
                        {{ t('agreement.claims.new_reconcile') }}
                      </UButton>
                    </div>

                    <CommonSelectableTable
                      v-if="activeClaimReconciles.length > 0"
                      :items="activeClaimReconciles"
                      :selected-id="selectedReconcileId"
                      :caption="t('agreement.claims.reconcile_table_caption')"
                      :is-selectable="() => !isReconcileMutationPending"
                      :get-row-aria-label="(reconcile, selected) => selected
                        ? t('agreement.claims.selected_reconcile_with_id', { id: reconcile.id })
                        : t('agreement.claims.view_reconcile_with_id', { id: reconcile.id })"
                      @select="reconcile => selectReconcile(reconcile.id)">
                      <template #header>
                        <th class="min-w-56 px-4 py-4">
                          {{ t('agreement.claims.reviewer') }}
                        </th>
                        <th class="min-w-56 px-4 py-4">
                          {{ t('common.status') }}
                        </th>
                        <th class="min-w-48 px-4 py-4">
                          {{ t('agreement.claims.reconciled_amount') }}
                        </th>
                        <th class="min-w-48 px-4 py-4">
                          {{ t('agreement.claims.sampled_amount') }}
                        </th>
                        <th class="min-w-40 px-4 py-4">
                          {{ t('agreement.claims.balance') }}
                        </th>
                        <th class="w-24 px-4 py-4">
                          {{ t('common.actions') }}
                        </th>
                      </template>
                      <template #row="{ item: reconcile, selected, selectable, select, actionLabel }">
                        <th scope="row" class="px-4 py-4 text-left">
                          <span class="font-semibold">{{ getReconcileReviewerLabel(reconcile) }}</span>
                        </th>
                        <td class="px-4 py-4">
                          <div class="flex flex-wrap items-center gap-2">
                            <CommonRecordState
                              :status-id="reconcile.egcs_fc_status"
                              :is-completed="reconcile.isCompleted" />
                            <CommonStatusBadge v-if="reconcile.egcs_fc_isfinal" variant="final" label-key="agreement.claims.final" />
                          </div>
                        </td>
                        <td class="px-4 py-4 font-semibold">
                          {{ formatMoney(getReconcileTotal(reconcile.id, 'egcs_fc_reconciled')) }}
                        </td>
                        <td class="px-4 py-4">
                          {{ formatMoney(getReconcileTotal(reconcile.id, 'egcs_fc_sampled')) }}
                        </td>
                        <td class="px-4 py-4 font-semibold text-primary">
                          {{ formatMoney(getReconcileBalance(reconcile)) }}
                        </td>
                        <td class="px-4 py-4 text-right">
                          <div class="flex items-center justify-end gap-1">
                            <UButton
                              v-if="selectable"
                              color="neutral"
                              variant="ghost"
                              size="sm"
                              class="cursor-default"
                              :icon="selected ? 'i-lucide-check' : 'i-lucide-panel-top-open'"
                              :aria-label="actionLabel"
                              :aria-current="selected ? 'true' : undefined"
                              @click="select">
                              {{ selected ? t('agreement.claims.selected_reconcile') : t('agreement.claims.view_reconcile') }}
                            </UButton>
                          </div>
                        </td>
                      </template>
                    </CommonSelectableTable>
                  </div>
                </CommonSection>

                <CommonSection v-if="activeReconcile" :title="t('agreement.claims.reconcile_selected_title')" badge="02" :grid-cols="1">
                  <div class="space-y-4">
                    <div class="flex flex-wrap items-start justify-between gap-4" aria-live="polite">
                      <div class="space-y-1">
                        <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
                          <span class="font-semibold text-zinc-900 dark:text-white">{{ getReconcileLabel(activeReconcile) }}</span>
                          <CommonRecordState
                            :status-id="activeReconcile.egcs_fc_status"
                            :is-completed="activeReconcile.isCompleted" />
                          <CommonStatusBadge v-if="activeReconcile.egcs_fc_isfinal" variant="final" label-key="agreement.claims.final" />
                        </div>
                        <p class="text-sm text-zinc-500 dark:text-zinc-400">
                          {{ t('agreement.claims.selected_reconcile_context') }}
                        </p>
                      </div>
                      <div class="flex flex-wrap items-center gap-2">
                        <UButton
                          v-if="canCancelReconcile"
                          color="error"
                          variant="outline"
                          icon="i-lucide-ban"
                          :label="t('agreement.claims.cancel_reconcile')"
                          :loading="isCancellingReconcile"
                          :disabled="isCancellingReconcile"
                          @click="cancelReconciliation" />
                        <CommonSaveButton
                          v-if="canUpdateReconcile"
                          type="button"
                          :label="t('agreement.claims.save_reconcile')"
                          :loading="isSavingReconcile"
                          :disabled="isSavingReconcile"
                          @click="saveReconcile" />
                      </div>
                    </div>
                    <div class="rounded-sm border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                      <UCheckbox
                        :model-value="draftReconcileIsFinal"
                        :label="t('agreement.claims.mark_reconcile_final')"
                        :description="t('agreement.claims.mark_reconcile_final_description')"
                        :disabled="!canEditActiveReconcileFinal"
                        @update:model-value="setActiveReconcileFinal" />
                      <p v-if="otherFinalReconcile && !activeReconcileIsFinal" class="mt-2 text-sm text-amber-700 dark:text-amber-300">
                        {{ t('agreement.claims.final_reconcile_exists', { id: otherFinalReconcile.id }) }}
                      </p>
                    </div>
                    <AgreementClaimReconciliationLinesTable
                      :lines="reconciliationTableLines"
                      :total-submitted="totalSubmitted"
                      :total-reconciled="totalReconciled"
                      :total-sampled="totalSampled"
                      edit-mode="action"
                      @edit="reconcileLineModal.openUpdate" />
                  </div>
                </CommonSection>

                <CommonSection v-if="activeReconcile" :title="t('agreement.claims.workflow.title')" badge="03" :grid-cols="1">
                  <div class="space-y-8">
                    <UAlert
                      v-if="activeReconcile.egcs_fc_isfinal && canUpdateReconcile"
                      color="warning"
                      variant="soft"
                      icon="i-lucide-triangle-alert"
                      :title="t('agreement.claims.final_reconcile_warning_title')"
                      :description="t('agreement.claims.final_reconcile_warning_description')" />

                    <CommonCompletionSection
                      v-if="showReconcileCompletion"
                      :key="`reconcile-completion:${activeReconcile.id}`"
                      entity-type="fundingclaimreconcile"
                      :entity-id="String(activeReconcile.id)"
                      :is-locked="!canUpdateReconcile"
                      hide-title
                      title-key="agreement.claims.reconcile_completion.title"
                      description-key="agreement.claims.reconcile_completion.description"
                      status-complete-key="agreement.claims.reconcile_completion.status_complete"
                      status-locked-key="agreement.claims.reconcile_completion.status_locked"
                      comment-placeholder-key="agreement.claims.reconcile_completion.comment_placeholder"
                      complete-action-key="agreement.claims.reconcile_completion.complete"
                      completed-success-key="agreement.claims.reconcile_completion.completed_success"
                      :confirmation-message-key="activeReconcile.egcs_fc_isfinal ? 'agreement.claims.final_reconcile_completion_confirmation' : undefined"
                      :refresh-key="approvalsRefreshKey"
                      @completed="refreshReconcileWorkspace" />

                    <CommonWorkflowSection
                      v-if="activeReconcile"
                      entity-type="fundingclaimreconcile"
                      :entity-id="String(activeReconcile.id)"
                      purpose="approval_submission"
                      :can-edit="canWorkReconcileWorkflow"
                      :refresh-key="approvalsRefreshKey"
                      @changed="refreshPage" />
                  </div>
                </CommonSection>
                <div v-else class="text-sm text-zinc-500 dark:text-zinc-400">
                  {{ t('agreement.claims.no_reconciliations') }}
                </div>
              </div>
            </div>

            <CommonAssignedUsers
              v-else-if="selectedClaimTab === 'assignments'"
              entity-type="fundingcaseagreementclaim"
              :entity-id="claimId" />

            <CommonAttachmentsTab
              v-else-if="selectedClaimTab === 'attachments'"
              entity-type="fundingcaseagreementclaim"
              :entity-id="claimId" />

            <ExtensionEntityTabPanel
              v-else-if="selectedExtensionTab"
              :item="selectedExtensionTab" />
          </CommonEntityEditorWorkspace>
        </div>
      </template>
    </UDashboardPanel>

    <UModal
      v-if="selectedReconcileLine"
      v-model:open="isReconcileLineModalOpen"
      :title="t('agreement.claims.reconcile_line_details')"
      :description="selectedReconcileLine.name"
      :ui="{ content: 'sm:max-w-2xl' }">
      <template #body>
        <form data-testid="reconcile-line-form" class="space-y-5" @submit.prevent="saveReconcileLine">
          <p v-if="selectedReconcileLine.description && selectedReconcileLine.description !== selectedReconcileLine.name" class="text-sm text-muted">
            {{ selectedReconcileLine.description }}
          </p>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField :label="t('agreement.claims.submitted_amount')">
              <div class="w-full rounded-md bg-muted px-3 py-2">
                {{ formatMoney(selectedReconcileLine.submittedAmount) }}
              </div>
            </UFormField>
            <UFormField :label="t('agreement.claims.balance')">
              <div class="w-full rounded-md bg-muted px-3 py-2">
                {{ formatMoney(selectedReconcileLineBalance) }}
              </div>
            </UFormField>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField :label="t('agreement.claims.reconciled_amount')">
              <UInput
                v-model="selectedReconcileLine.reconciledAmount"
                inputmode="decimal"
                :disabled="!selectedReconcileLine.editable"
                class="w-full"
                @update:model-value="updateSelectedReconciledAmount" />
            </UFormField>
            <UFormField :label="t('agreement.claims.sampled_amount')">
              <UInput
                v-model="selectedReconcileLine.sampledAmount"
                inputmode="decimal"
                :disabled="!selectedReconcileLine.editable"
                class="w-full" />
            </UFormField>
          </div>

          <UFormField :label="t('agreement.claims.rationale')">
            <CommonTextarea
              v-model="selectedReconcileLine.rationale"
              :rows="6"
              :placeholder="t('agreement.claims.rationale_for', { name: selectedReconcileLine.name })"
              :readonly="!selectedReconcileLine.editable"
              class="w-full" />
          </UFormField>

          <div class="flex justify-end gap-2 pt-2">
            <UButton
              type="button"
              color="neutral"
              variant="ghost"
              :label="t('common.cancel')"
              :disabled="isSavingReconcileLine"
              @click="reconcileLineModal.close" />
            <CommonSaveButton
              v-if="selectedReconcileLine.editable"
              type="submit"
              :label="t('common.save')"
              :loading="isSavingReconcileLine"
              :disabled="isSavingReconcileLine" />
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>
