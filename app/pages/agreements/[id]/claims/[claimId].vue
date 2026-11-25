<script setup lang="ts">
import { useSubmissionAnswerContexts, useSubmissionAnswerEditor } from '~/composables/useSubmissionAnswerEditor'
import AgreementSubmissionAdditional from '~/components/Agreement/Submission/Additional.vue'
import { useCommittedSettlement } from '~/composables/useCommittedSettlement'
import type { CapturedActionContext } from '~/composables/useActionContext'
import { useEditorSettlement } from '~/composables/useEditorSettlement'
import { useOperationLane } from '~/composables/useOperationLane'
import { useFieldTooltipProvider } from '~/composables/useFieldTooltipProvider'
import type { LocalizedToastText } from '~/composables/useLocalizedToast'
import { usePageResourceError } from '~/composables/usePageResourceError'
import { parseOptionalMoneyInput } from '~/utils/optional-money-input'
import { FundingCaseAgreementClaimLineItemBaseSchema, FundingCaseAgreementClaimReconcileLineItemBaseSchema, SUBMISSION_EDIT_COMMENT_MAX_LENGTH, SubmissionEditCommentSchema } from '~~/shared/types/schemas/funding-case-agreement'
import type { FetchError } from 'ofetch'
import { useBusinessStatusState } from '~/composables/useBusinessStatusState'
import { useLinkedAgreementSubmissionReview } from '~/composables/useLinkedAgreementSubmissionReview'
import { useNativeSubmissionReads } from '~/composables/useNativeSubmissionReads'
/* eslint-disable jsdoc/require-jsdoc -- page-local callbacks use self-descriptive signatures */
import { computed, onScopeDispose, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { useGroupedTableExpansion, type GroupedTableRow } from '~/composables/useGroupedTableExpansion'
import CommonCompletionSection from '~/components/Common/Completions/Section.vue'
import CommonCompletionWorkflowPreAction from '~/components/Common/Completions/WorkflowPreAction.vue'
import CommonSelectableTable from '~/components/Common/SelectableTable.vue'
import AgreementClaimReconciliationLinesTable from '~/components/Agreement/AgreementClaimReconciliationLinesTable.vue'
import { useCrudModal, useCrudModalPending } from '~/composables/useCrudModal'
import { useActionContext } from '~/composables/useActionContext'
import { useFormSession } from '~/composables/useFormSession'
import { useReconcileAllAmounts } from '~/composables/useReconcileAllAmounts'
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
import { addMoney, compareMoney, formatMoneyText, parseMoney, zeroMoney, subtractMoney, sumMoney, type Money, type MoneyInput } from '~~/shared/utils/money'

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
  isHistorical?: boolean
}

type GroupedClaimSubmissionRow = GroupedTableRow<ClaimSubmissionTableRow>
type ReconciliationEditorLine = {
  claim_line_id: string
  reconcile_line_id: string | null
  description: string
  submitted_line_item: string | null
  submitted_amount: Money
  previously_reconciled_amount: Money
  egcs_fc_reconciled: Money | null
  egcs_fc_sampled: Money | null
  egcs_fc_rationale: string | null
}
type ReconciliationEditorDetail = {
  reconciliation: { id: string, egcs_fc_isopen: boolean }
  lines: ReconciliationEditorLine[]
  can_update: boolean
  can_update_role: boolean
  can_cancel: boolean
  is_assigned: boolean
}
const fetchReconciliationEditorDetail = $fetch as unknown as (url: string) => Promise<ReconciliationEditorDetail>

definePageMeta({
  key: route => route.path,
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
const toast = useLocalizedToast()
const { getHeroCollapsed } = useDashboard()
const { showError } = useApiErrorToast()
const { getBilingualValue } = useBilingualValue()
const { sendJson } = useJsonRequest()
const { getDefinition, isRecordLocked, isDraftStatus, isTerminalStatus } = useBusinessStatusState()
const statusCatalog = useStatusCatalog()

const agreementId = route.params.id as string
const claimId = route.params.claimId as string
const { user: claimPageActor, permissionRevision: claimPermissionRevision } = useAuth()
const {
  data: contextProfile,
  error: profileError,
  status: profileStatus,
  refresh: refreshProfile,
  clear: clearProfile
} = useFetch<EntityAssignmentContext, FetchError, string>(`/api/entity-assignments/fundingcaseagreementclaim/${claimId}/context`)
const profile = computed(() => contextProfile.value?.can_read_agreement === false ? null : contextProfile.value)
const canUpdateClaim = computed(() => profile.value?.can_update_agreement_role === true)
const getCurrency = (): string => {
  const currency = profile.value?.egcs_fc_currency
  if (!currency) throw new Error('Agreement currency is unavailable.')
  return currency
}
const receivableEntry = useAccountReceivableSourceEntry(agreementId, 'claim', claimId,
  computed(() => profile.value?.can_create_account_receivable === true))

const { createValidator } = useZodI18n()
const submissionAmountSchema = FundingCaseAgreementClaimLineItemBaseSchema.pick({ egcs_fc_amount: true })
const validateSubmissionAmount = computed(() => createValidator(submissionAmountSchema.extend({
  editComment: needsSubmissionEditComment.value ? SubmissionEditCommentSchema : SubmissionEditCommentSchema.optional()
})))
type SubmissionTarget = { budgetLineId: string; claimLineId: string | null }
const submissionTarget: Ref<SubmissionTarget | null> = ref(null)
const submissionModal = useCrudModal<ClaimSubmissionTableRow, ClaimSubmissionTableRow & { egcs_fc_amount: MoneyInput; editComment?: string }>({
  updateState: row => {
    submissionTarget.value = row.budgetLineId ? { budgetLineId: row.budgetLineId, claimLineId: row.claimLineId ?? null } : null
    return { ...row, egcs_fc_amount: row.submittedAmount }
  }
})
const selectedSubmissionLine = submissionModal.selected
const isSubmissionModalOpen = submissionModal.isOpen
watch([() => claimPageActor.value?.id, claimPermissionRevision], () => {
  submissionModal.close()
  submissionTarget.value = null
}, { flush: 'sync' })
type FundingDraft = {
  line: FundingCaseAgreementClaimLineItemRow
  owner: CapturedActionContext
  mode: 'edit' | 'clear'
  comment: string
  programAmount: MoneyInput
  totalAmount: MoneyInput
  sources: Array<{ egcs_fc_fundingsubtype: string, egcs_fc_amount: MoneyInput }>
}
const fundingEditor = useCrudModal<FundingDraft, FundingDraft>({ updateState: draft => draft })
const { isOpen: fundingEditorOpen, selected: fundingDraft } = fundingEditor
const prepareFundingWrite = useEditorSettlement(fundingEditor)
const submissionWrites = useOperationLane<'amount' | 'funding'>()
const isSavingFunding = computed(() => submissionWrites.isPending('funding'))
const isSavingSubmission = computed(() => submissionWrites.isPending('amount'))
const allocationComments = ref<Record<string, string>>({})
const draftAllocations: Ref<Record<string, string | null>> = ref({})
const submissionSearch: Ref<string> = ref('')
const submissionPagination: Ref<{ pageIndex: number, pageSize: number }> = ref({
  pageIndex: 0,
  pageSize: 50
})
const selectedReconcileId: Ref<string | null> = ref(null)
const allocatingClaimLineId: Ref<string | null> = ref(null)
const isStartingReconcile: Ref<boolean> = ref(false)
const isWithdrawingClaim: Ref<boolean> = ref(false)
const isCancellingClaim: Ref<boolean> = ref(false)
const isCancellingReconcile: Ref<boolean> = ref(false)
const approvalsRefreshKey: Ref<number> = ref(0)
const selectedReconcileDetail: Ref<ReconciliationEditorDetail | null> = ref(null)
const selectedReconcileReadError = ref(false)
const selectedReconcileRole: Ref<{ id: string, allowed: boolean } | null> = ref(null)
type ReconciliationWrite = { kind: 'idle' | 'line' | 'bulk' } | { kind: 'final', value: boolean }
const reconciliationWrite: Ref<ReconciliationWrite> = ref({ kind: 'idle' })
const reconcileAll = useReconcileAllAmounts()
type ReconciliationLineDraft = AgreementClaimReconciliationTableLine & {
  egcs_fc_reconciled: MoneyInput
  egcs_fc_sampled: MoneyInput
  egcs_fc_rationale: string
}
const reconcileLineModal = useCrudModal<AgreementClaimReconciliationTableLine, ReconciliationLineDraft>({
  updateState: line => ({
    ...line,
    egcs_fc_reconciled: line.reconciledAmount,
    egcs_fc_sampled: line.sampledAmount,
    egcs_fc_rationale: line.rationale
  })
})
const validateReconcileLine = createValidator(FundingCaseAgreementClaimReconcileLineItemBaseSchema.pick({
  egcs_fc_reconciled: true,
  egcs_fc_sampled: true,
  egcs_fc_rationale: true
}))
const selectedReconcileLine = reconcileLineModal.selected
const isReconcileLineModalOpen = reconcileLineModal.isOpen
const reconcileLinePending = useCrudModalPending(reconcileLineModal.captureSession)
const isSavingReconcileLine = reconcileLinePending.isPending
let reconcileDetailGeneration = 0
let claimPageState: 'active' | 'disposed' = 'active'
const disposeClaimPage = () => {
  claimPageState = 'disposed'
  reconcileDetailGeneration += 1
}
const isCurrentPage = () => claimPageState === 'active'
  && route.params.id === agreementId && route.params.claimId === claimId
watch(() => route.path, disposeClaimPage, { flush: 'sync' })
onScopeDispose(disposeClaimPage)
const isHeroCollapsed = getHeroCollapsed('agreement-claim-detail')
const authorizedClaimId = computed(() => profileStatus.value === 'success' && profile.value ? claimId : undefined)
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
  refresh: refreshOverview,
  clear: clearOverview
} = useFetch<FundingCaseAgreementClaimOverviewRow, FetchError, string>(`/api/agreements/${agreementId}/claims-overview?claimId=${claimId}`)
const { isAssigned, status: assignmentStatus, clear: clearAssignmentRoster } = useEntityAssignmentRoster(
  'fundingcaseagreementclaim',
  claimId,
  { enabled: computed(() => overviewStatus.value === 'success') }
)
const submissionReview = useLinkedAgreementSubmissionReview(agreementId, 'claim', claimId, {
  read: () => overview.value ? overview.value.linkedReview ?? null : undefined,
  status: () => overviewStatus.value,
  refresh: refreshOverview,
  canReviewRole: () => canUpdateClaim.value,
  isAssigned: () => isAssigned.value
})
const needsSubmissionEditComment = computed(() => Boolean(overview.value?.linkedReview))
const submissionEditWarningKey = () => {
  if (submissionReview.state.value === 'returned') return 'submission.waiting'
  if (submissionReview.state.value === 'proponent_editing') return 'submission.proponent_editing'
  return 'submission.review_to_edit'
}

const { readback: readbackSubmissionEdit } = useNativeSubmissionReads({
  actorId: () => claimPageActor.value?.id,
  permissionRevision: claimPermissionRevision,
  overview: {
    isLinked: () => needsSubmissionEditComment.value,
    refreshLinked: submissionReview.refresh,
    refresh: refreshOverview,
    status: () => overviewStatus.value,
    error: () => overviewError.value
  },
  reads: [
    { clear: clearProfile, refresh: refreshProfile },
    { clear: clearOverview, refresh: refreshOverview },
    { clear: clearAssignmentRoster }
  ]
})
usePageResourceError({
  identity: () => JSON.stringify([route.path, claimPageActor.value?.id, claimPermissionRevision.value]),
  errors: [profileError, overviewError],
  pending: () => profileStatus.value === 'pending' || overviewStatus.value === 'pending',
  hasContent: () => Boolean(profile.value && overview.value)
})

const claims = computed<FundingCaseAgreementClaimOverviewRow['claims']>(() => overview.value?.claims ?? [])
const budgetLineItems = computed<FundingCaseAgreementClaimOverviewRow['budgetLineItems']>(() => overview.value?.budgetLineItems ?? [])
const claimLineItems = computed<FundingCaseAgreementClaimOverviewRow['lineItems']>(() => overview.value?.lineItems ?? [])
const reconciles = computed<FundingCaseAgreementClaimOverviewRow['reconciles']>(() => overview.value?.reconciles ?? [])
const reconcileLineItems = computed<FundingCaseAgreementClaimOverviewRow['reconcileLineItems']>(() => overview.value?.reconcileLineItems ?? [])
const activeClaim = computed(() => claims.value.find((claim: FundingCaseAgreementClaimOverviewRow['claims'][number]) => String(claim.id) === claimId) ?? null)
const additionalInformationFields = computed(() => activeClaim.value?.egcs_fc_customfielddefinitions?.filter(field => field.egcs_tp_active) ?? [])
const additionalInformationValues = computed(() => activeClaim.value?.egcs_fc_customfields ?? {})
const claimFundingMode = computed(() => overview.value?.budgetManagement?.egcs_tp_budgetfundingmode ?? 'manual')
const isHistoricalClaim = computed(() => Boolean(activeClaim.value?.isCompleted || activeClaim.value?.hasPositiveCompletionTerminus
  || getDefinition(activeClaim.value?.egcs_fc_status)?.readOnly || isTerminalStatus(activeClaim.value?.egcs_fc_status)))
const showClaimFunding = computed(() => claimFundingMode.value !== 'program_only' || isHistoricalClaim.value)
const hideClaimCostCategory = computed(() => overview.value?.budgetManagement?.egcs_tp_hidecostcategory === true)
const hideClaimCostSubsection = computed(() => overview.value?.budgetManagement?.egcs_tp_hidecostsubsection === true)

const activeBudgetLineItems = computed(() => {
  if (!activeClaim.value) {
    return []
  }

  return budgetLineItems.value.filter((line: FundingCaseAgreementBudgetLineItemRow) => String(line.fiscal_year_id) === String(activeClaim.value?.fiscal_year_id ?? activeClaim.value?.egcs_fc_fiscalyear))
})
const activeClaimLineItems = computed(() => claimLineItems.value.filter((line: FundingCaseAgreementClaimLineItemRow) => String(line.egcs_fc_fundingagreementclaim) === claimId))
const isHistoricalClaimLine = (line: FundingCaseAgreementClaimLineItemRow): boolean =>
  line.egcs_fc_fundingagreementbudgetlineitem != null
  && !activeBudgetLineItems.value.some(choice => String(choice.id) === String(line.budget_line_item_id ?? line.egcs_fc_fundingagreementbudgetlineitem))
const warnHistoricalClaimLine = (line: FundingCaseAgreementClaimLineItemRow): boolean => {
  if (!isHistoricalClaimLine(line)) return false
  toast.add({ title: toast.localized('common.warning'), description: toast.localized('agreement.claims.historical_budget_line_read_only'), color: 'warning' })
  return true
}
watch(() => {
  const draft = fundingDraft.value
  if (!draft?.owner.isCurrent()) return false
  const current = activeClaimLineItems.value.find(line => String(line.id) === String(draft.line.id))
  return Boolean(current && (draft.mode === 'clear' || !isHistoricalClaimLine(current)))
}, available => {
  if (available || !fundingEditorOpen.value) return
  fundingEditor.close()
  allocationComments.value = {}
}, { flush: 'sync' })
const openFundingEditor = (line: FundingCaseAgreementClaimLineItemRow, clearOnly = false) => {
  if (claimFundingMode.value === 'program_only') return
  if (isLoadingDetail.value || isSavingFunding.value || !guardClaimAction(canUpdateClaim.value, claimSubmissionEditWarning.value)) return
  if (!clearOnly && warnHistoricalClaimLine(line)) return
  const owner = submissionCollectionUpdateContext.capture()
  if (!owner?.canDispatch()) return
  fundingEditor.openUpdate({
    line, owner, mode: clearOnly ? 'clear' : 'edit', comment: '',
    programAmount: line.egcs_fc_amount,
    totalAmount: line.egcs_fc_totalamount,
    sources: line.egcs_fc_fundingsources.map(source => ({ ...source }))
  })
}
const automaticClaimTotal = computed(() => {
  const draft = fundingDraft.value
  if (!draft) return null
  try {
    return sumMoney([parseMoney(draft.programAmount),
      ...draft.sources.map(source => parseMoney(source.egcs_fc_amount))], getCurrency())
  } catch {
    return null
  }
})
const saveFundingEditor = async () => {
  if (!isCurrentPage()) return
  const draft = fundingDraft.value
  const mode = claimFundingMode.value
  if (mode === 'program_only' || !draft?.owner.isCurrent() || isLoadingDetail.value || isSavingFunding.value
    || !guardClaimAction(canUpdateClaim.value, claimSubmissionEditWarning.value)) return
  const { line, mode: draftMode } = draft
  const editComment = needsSubmissionEditComment.value ? draft.comment.trim() : undefined
  if (needsSubmissionEditComment.value && !editComment) return
  if (draftMode === 'edit' && warnHistoricalClaimLine(line)) return
  const write = prepareFundingWrite(submissionCollectionUpdateContext, captureFundingCommitted)
  if (!write?.canDispatch()) return
  const release = submissionWrites.acquire('funding')
  if (!release) return
  try {
    if (draftMode === 'clear') {
      await sendJson(`/api/agreements/${agreementId}/claim-line-items/${line.id}`, 'PATCH', { egcs_fc_fundingsources: [], editComment })
    } else {
      const amount = parseMoney(draft.programAmount)
      const totalAmount = mode === 'manual' ? parseMoney(draft.totalAmount) : undefined
      const sources = draft.sources.map(source => ({
        egcs_fc_fundingsubtype: source.egcs_fc_fundingsubtype,
        egcs_fc_amount: parseMoney(source.egcs_fc_amount)
      }))
      if (sources.some(source => !source.egcs_fc_fundingsubtype)
        || new Set(sources.map(source => source.egcs_fc_fundingsubtype)).size !== sources.length
        || (totalAmount && (compareMoney(totalAmount, amount) < 0
          || (sources.length > 0 && compareMoney(sumMoney([amount, ...sources.map(source => source.egcs_fc_amount)], getCurrency()), totalAmount) !== 0)))) {
        toast.add({ title: toast.localized('common.error'), description: toast.localized('agreement.completion_blockers.funding_breakdown_required'), color: 'error' })
        return
      }
      await sendJson(`/api/agreements/${agreementId}/claim-line-items/${line.id}`, 'PATCH', {
        egcs_fc_amount: amount,
        ...(totalAmount ? { egcs_fc_totalamount: totalAmount } : {}),
        egcs_fc_fundingsources: sources,
        editComment
      })
    }
    await write.acknowledge()
  } catch (error: unknown) {
    if (write.isCurrent()) showError(error)
  } finally {
    release()
  }
}
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
const canCreateClaimLineItems = computed(() => profile.value?.can_create_agreement_role === true)
const canAllocateClaimLines = canUpdateClaim
const claimSourcePrerequisiteWarning = computed(() => {
  if (!isAssigned.value) return toast.localized('assignments.read_only_description')
  if (!activeClaim.value) return toast.localized('agreement.claims.action_unavailable')
  return undefined
})
const claimWorkflowPrerequisiteWarning = computed(() => claimSourcePrerequisiteWarning.value
  ?? (isTerminalStatus(activeClaim.value?.egcs_fc_status) ? toast.localized('agreement.claims.action_unavailable') : undefined))
const claimEditPrerequisiteWarning = computed(() => claimWorkflowPrerequisiteWarning.value
  ?? (activeClaimIsLocked.value ? toast.localized('agreement.claims.action_unavailable') : undefined))
const submissionLifecycleWarning = computed(() => submissionReview.canAdvanceLifecycle.value
  ? undefined
  : toast.localized(submissionReview.warning.value ?? 'submission.errors.acceptance_required'))
const claimCompletionWarning = computed(() => claimEditPrerequisiteWarning.value ?? submissionLifecycleWarning.value)
const claimSubmissionEditWarning = computed(() => claimEditPrerequisiteWarning.value
  ?? (!submissionReview.canEdit.value
    ? toast.localized(submissionReview.warning.value ?? submissionEditWarningKey())
    : undefined))
const claimEditReady = computed(() => canUpdateClaim.value && !claimEditPrerequisiteWarning.value)
const guardClaimAction = (roleAllowed: boolean, warning: LocalizedToastText | undefined): boolean => {
  if (!isCurrentPage()) return false
  if (!roleAllowed) return false
  if (warning) {
    toast.add({ title: toast.localized('common.warning'), description: warning, color: 'warning' })
    return false
  }
  return true
}
const claimHasActiveWorkflow = computed(() =>
  ACTIVE_CLAIM_WORKFLOW_STATES.has(activeClaim.value?.workflowRuntimeState ?? '')
  || ACTIVE_CLAIM_WORKFLOW_STATES.has(activeClaim.value?.approvalRuntimeState ?? ''))
const withdrawClaimReady = computed(() => isAssigned.value
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
const cancelClaimReady = computed(() =>
  isAssigned.value
  && Boolean(activeClaim.value)
  && claimHasActiveWorkflow.value
  && !isDraftStatus(activeClaim.value?.egcs_fc_status)
  && !isTerminalStatus(activeClaim.value?.egcs_fc_status)
)
const claimIsReadyForReconcile = computed(() => activeClaim.value?.hasPositiveCompletionTerminus === true)
const startReconcileReady = computed(() =>
  isAssigned.value
  && claimIsReadyForReconcile.value
  && activeUnallocatedClaimLineItems.value.length === 0
  && !claimHasApprovedFinalReconcile.value
)
const canWithdrawClaim = canUpdateClaim
const canCancelClaim = canUpdateClaim
const canStartReconcile = canCreateClaimLineItems
const canUpdateReconcile = computed(() => selectedReconcileDetail.value?.can_update === true)
const canWorkReconcileWorkflow = computed(() => selectedReconcileDetail.value?.is_assigned === true)
const canCancelReconcile = computed(() => selectedReconcileDetail.value?.can_cancel === true)
const canUpdateReconcileRole = computed(() => selectedReconcileDetail.value?.can_update_role
  ?? (selectedReconcileRole.value?.id === String(activeReconcile.value?.id) && selectedReconcileRole.value?.allowed === true))
const reconcileWorkflowPrerequisiteWarning = computed(() => {
  if (!selectedReconcileDetail.value) return undefined
  if (!selectedReconcileDetail.value.is_assigned) return toast.localized('assignments.read_only_description')
  if (!activeReconcile.value || isTerminalStatus(activeReconcile.value.egcs_fc_status)
    || selectedReconcileDetail.value.reconciliation.egcs_fc_isopen === false
    || activeClaimReconciles.value.some(reconcile => reconcile.egcs_fc_isfinal && reconcile.isCompleted)) return toast.localized('agreement.claims.action_unavailable')
  return undefined
})
const reconcileEditPrerequisiteWarning = computed(() => reconcileWorkflowPrerequisiteWarning.value
  ?? (!canUpdateReconcile.value || isRecordLocked(activeReconcile.value) ? toast.localized('agreement.claims.action_unavailable') : undefined))
const isReconcileActionPending = computed(() => !selectedReconcileDetail.value || isLoadingDetail.value
  || (!getDefinition(activeReconcile.value?.egcs_fc_status) && statusCatalog.state.value.status === 'pending'))
const guardReconcileAction = (warning: LocalizedToastText | undefined): boolean => {
  if (!isCurrentPage()) return false
  if (isReconcileActionPending.value) return false
  if (!canUpdateReconcileRole.value || warning) {
    toast.add({ title: toast.localized('common.warning'), description: warning ?? toast.localized('agreement.claims.action_unavailable'), color: 'warning' })
    return false
  }
  return true
}
const reconcileActionContext = useActionContext({
  identity: [() => route.params.id, () => route.params.claimId, () => activeReconcile.value?.id],
  authority: canUpdateReconcileRole,
  eligible: () => isCurrentPage() && !isReconcileActionPending.value && !reconcileEditPrerequisiteWarning.value
})
const showReconcileCompletion = computed(() => Boolean(activeReconcile.value))
const hasLoadError = computed(() =>
  contextProfile.value?.can_read_agreement === false
  || Boolean(profileError.value)
  || Boolean(overviewError.value)
  || profileStatus.value === 'error'
  || overviewStatus.value === 'error'
)
const isLoadingDetail = computed(() => profileStatus.value === 'pending' || overviewStatus.value === 'pending'
  || assignmentStatus.value === 'pending'
  || (!activeClaimStatus.value && statusCatalog.state.value.status === 'pending'))
const retryLoad = async () => {
  if (!isCurrentPage()) return
  await Promise.all([refreshProfile(), submissionReview.refresh()])
}

const breadcrumbItems = computed(() => [
  { label: t('agreement.title'), to: localePath(appRouteLocations.agreements()) },
  {
    label: getBilingualValue(profile.value, 'egcs_fc_title', agreementId),
    to: authorizedRouteLocation(profile.value?.can_read_agreement, localePath(appRouteLocations.agreementDetail(agreementId)))
  },
  { label: activeClaim.value ? t('agreement.claims.claim_label', { id: activeClaim.value.id }) : claimId }
])

const submissionReviewBusy = computed(() =>
  isLoadingDetail.value || isSavingSubmission.value || isSavingAdditionalInformation.value || isSavingFunding.value || allocatingClaimLineId.value !== null)
const submissionReviewActionsBlocked = computed(() => submissionReviewBusy.value || additionalInformationDirty.value)
const claimHeroActions = computed(() => [
  ...(isClaimSubmissionSection.value && submissionReview.state.value === 'submitted' && canUpdateClaim.value
    ? [{
        label: t('submission.start'), icon: 'i-lucide-play', loading: submissionReview.pending.value,
        disabled: submissionReviewActionsBlocked.value || !submissionReview.actionReady.value,
        onClick: () => submissionReview.run({ action: 'start' })
      }]
    : []),
  ...(receivableEntry.canCreate.value
    ? [{ label: t('account_receivable.create'), icon: 'i-lucide-receipt-text', loading: receivableEntry.starting.value, onClick: receivableEntry.start }]
    : [])
])

const claimSubmissionTabStyle = 'ps-12 hover:bg-transparent data-[state=active]:bg-transparent'
const claimTabs = computed(() => [
  {
    key: 'agreement.claims.amounts_tab',
    value: 'submission',
    ui: { trigger: claimSubmissionTabStyle }
  },
  {
    key: 'agreement.claims.additional_tab',
    value: 'additional',
    ui: { trigger: claimSubmissionTabStyle }
  },
  { key: 'agreement_requests.title', value: 'requests', ui: { trigger: claimSubmissionTabStyle } },
  {
    key: 'agreement.claims.reconcile_title',
    value: 'reconciliation',
    icon: 'i-lucide-list-checks'
  },
  ...(submissionReview.detail.value || (submissionReview.status.value !== 'success'
    && ['history', 'historique'].some(section => section === route.query.section))
    ? [{ key: 'submission.history_tab', value: 'history', icon: 'i-lucide-history' }]
    : []),
  { key: 'reviews.title', value: 'reviews', icon: 'i-lucide-clipboard-check' },
  {
    key: 'workflow.title',
    value: 'workflows',
    icon: 'i-lucide-workflow'
  },
  { key: 'supplementary_information.title', value: 'supplementary-information', icon: 'i-lucide-clipboard-list' },
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
const { selectedTab: selectedClaimTab } = useUrlTabState({ tabs: claimTabs, defaultTab: 'submission' })
const isClaimSubmissionSection = computed(() => ['submission', 'additional'].includes(selectedClaimTab.value))
const selectedExtensionTab = computed(() => getExtensionTabItem(selectedClaimTab.value))

const claimLinesByBudgetId = computed(() => {
  const byId = new Map<string, FundingCaseAgreementClaimLineItemRow[]>()
  for (const line of activeClaimLineItems.value) {
    if (line.egcs_fc_fundingagreementbudgetlineitem === null || line.egcs_fc_fundingagreementbudgetlineitem === undefined) {
      continue
    }

    const budgetLineId = String(line.budget_line_item_id ?? line.egcs_fc_fundingagreementbudgetlineitem)
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
  if (!activeBudgetLineItems.value.some(line => String(line.id) === budgetLineId)) return false
  const existing = claimLinesByBudgetId.value.get(budgetLineId)?.[0]
  return existing ? canUpdateClaim.value : canCreateClaimLineItems.value
}

const hasSelectedSubmissionLine = () => {
  const target = submissionTarget.value
  return Boolean(target && claimLinesByBudgetId.value.get(target.budgetLineId)?.some(line => String(line.id) === target.claimLineId))
}
const ownsSubmissionAdmission = () => isCurrentPage() && activeClaim.value?.id === claimId
  && !claimSubmissionEditWarning.value
  && activeBudgetLineItems.value.some(line => String(line.id) === submissionTarget.value?.budgetLineId)
const submissionCollectionCreateContext = useActionContext({
  identity: [() => route.params.id, () => route.params.claimId],
  authority: canCreateClaimLineItems,
  eligible: () => isCurrentPage() && activeClaim.value?.id === claimId && !claimSubmissionEditWarning.value
})
const submissionCollectionUpdateContext = useActionContext({
  identity: [() => route.params.id, () => route.params.claimId],
  authority: canUpdateClaim,
  eligible: () => isCurrentPage() && activeClaim.value?.id === claimId && !claimSubmissionEditWarning.value
})
const submissionCreateContext = useActionContext({
  identity: [() => route.params.id, () => route.params.claimId, () => submissionTarget.value?.budgetLineId, () => submissionTarget.value?.claimLineId],
  authority: canCreateClaimLineItems,
  eligible: () => ownsSubmissionAdmission() && submissionTarget.value?.claimLineId === null
    && !claimLinesByBudgetId.value.get(submissionTarget.value.budgetLineId)?.length
})
const submissionUpdateContext = useActionContext({
  identity: [() => route.params.id, () => route.params.claimId, () => submissionTarget.value?.budgetLineId, () => submissionTarget.value?.claimLineId],
  authority: canUpdateClaim,
  eligible: () => ownsSubmissionAdmission() && hasSelectedSubmissionLine()
})

const zeroAmount = () => zeroMoney(getCurrency())
const readDraftMoney = (value: MoneyInput): Money => {
  try {
    return value == null ? zeroAmount() : parseMoney(value)
  } catch {
    return zeroAmount()
  }
}
const totalSubmitted = computed(() => sumMoney(activeClaimLineItems.value.map(line => line.egcs_fc_amount), getCurrency()))
const totalReconciled = computed(() => sumMoney(reconciliationTableLines.value.map(line => readDraftMoney(line.reconciledAmount)), getCurrency()))
const totalReconciledAll = computed(() => sumMoney(reconcileLineItems.value
  .filter((line: FundingCaseAgreementClaimReconcileLineItemRow) => successfulReconcileIds.value.has(String(line.egcs_fc_fundingagreementclaimreconcile)))
  .filter((line: FundingCaseAgreementClaimReconcileLineItemRow) => activeClaimLineIds.value.has(String(line.egcs_fc_lineitem)))
  .map(line => line.egcs_fc_reconciled), getCurrency()))
const totalSampled = computed(() => sumMoney(reconciliationTableLines.value.map(line => readDraftMoney(line.sampledAmount)), getCurrency()))
const selectedReconcileLinesByClaimLineId = computed(() => new Map(
  selectedReconcileDetail.value?.lines.map(line => [line.claim_line_id, line])
))
const reconciliationTableLines = computed<AgreementClaimReconciliationTableLine[]>(() => activeClaimLineItems.value.map(line => {
  const id = String(line.id)
  const persisted = selectedReconcileLinesByClaimLineId.value.get(id) ?? reconcileLineByClaimLineId.value.get(id)
  const previouslyReconciledAmount = selectedReconcileLinesByClaimLineId.value.get(id)?.previously_reconciled_amount
    ?? getSuccessfulReconciledExcludingReconcile(id, activeReconcile.value?.id)
  const reconciledAmount = persisted?.egcs_fc_reconciled ?? zeroAmount()
  return {
    id,
    name: line.egcs_fc_submittedlineitem?.trim()
      || getBilingualValue(line, 'line_item_name', line.egcs_fc_description || t('common.unavailable')),
    description: line.egcs_fc_description,
    costCategory: line.egcs_fc_submittedcostcategory?.trim() || getCostCategoryLabel(line),
    costSubsection: getCostSubsectionLabel(line.egcs_fc_submittedcostsubsection || line.egcs_fc_costsubsection),
    submittedAmount: line.egcs_fc_amount,
    previouslyReconciledAmount,
    reconciledAmount,
    sampledAmount: persisted?.egcs_fc_sampled ?? undefined,
    rationale: persisted?.egcs_fc_rationale ?? '',
    editable: canUpdateReconcileRole.value
  }
}))
const balanceAll = computed(() => subtractMoney(totalSubmitted.value, totalReconciledAll.value))

watch(activeClaimReconciles, reconcilesForClaim => {
  const selectedStillExists = selectedReconcileId.value
    ? reconcilesForClaim.some(reconcile => String(reconcile.id) === selectedReconcileId.value)
    : false

  if (!selectedStillExists) {
    selectedReconcileId.value = reconcilesForClaim[0] ? String(reconcilesForClaim[0].id) : null
  }
}, { immediate: true })

const loadSelectedReconcileDetail = async (reconcile: FundingCaseAgreementClaimReconcileRow | null = activeReconcile.value) => {
  if (!isCurrentPage()) return
  const generation = ++reconcileDetailGeneration
  selectedReconcileDetail.value = null
  selectedReconcileReadError.value = false
  if (!reconcile) return

  try {
    const detail = await fetchReconciliationEditorDetail(`/api/claim-reconciliations/${reconcile.id}`)
    if (!isCurrentPage() || generation !== reconcileDetailGeneration || String(detail.reconciliation.id) !== String(activeReconcile.value?.id)) return
    selectedReconcileDetail.value = detail
    selectedReconcileRole.value = { id: String(detail.reconciliation.id), allowed: detail.can_update_role }
  } catch (error: unknown) {
    if (isCurrentPage() && generation === reconcileDetailGeneration) {
      selectedReconcileReadError.value = true
      showError(error)
    }
  }
}

watch([() => activeReconcile.value?.id, () => claimPageActor.value?.id, claimPermissionRevision], () => {
  selectedReconcileRole.value = null
  reconcileLineModal.close()
  return loadSelectedReconcileDetail()
}, { immediate: true })

watch(activeUnallocatedClaimLineItems, lines => {
  const nextAllocations: Record<string, string | null> = {}
  for (const line of lines) {
    nextAllocations[String(line.id)] = draftAllocations.value[String(line.id)] ?? null
  }
  draftAllocations.value = nextAllocations
}, { immediate: true })

const refreshPage = async () => {
  if (!isCurrentPage()) return
  await Promise.all([refreshOverview(), receivableEntry.refresh()])
  if (isCurrentPage()) approvalsRefreshKey.value += 1
}

const refreshAfterSubmissionEdit = async () => {
  if (!isCurrentPage()) return
  const [readback] = await Promise.all([readbackSubmissionEdit(), receivableEntry.refresh()])
  if (isCurrentPage()) approvalsRefreshKey.value += 1
  return readback
}

const captureFundingCommitted = useCommittedSettlement({
  context: submissionCollectionUpdateContext,
  settle: async () => await refreshAfterSubmissionEdit() ?? { kind: 'unavailable', error: overviewError.value }
})

const displayValue = (value: string | number | boolean | null | undefined) => {
  if (value === undefined || value === null || value === '') {
    return '-'
  }

  if (typeof value === 'boolean') {
    return value ? t('common.yes') : t('common.no')
  }

  return String(value)
}

const formatMoney = (value: Money) => formatMoneyText(value, locale.value)
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
  profile.value?.egcs_fc_currency?.toUpperCase() ?? '',
  getBilingualValue(profile.value, 'egcs_fc_title', agreementId),
  `${t('agreement.claims.submitting_proponent')}: ${getBilingualValue(activeClaim.value, 'submitting_proponent_name', t('common.unavailable'))}`,
  `${t('agreement.claims.fiscal_year')}: ${activeClaimFiscalYearLabel.value}`,
  `${t('agreement.claims.period')}: ${activeClaimPeriodLabel.value}`
])
const claimHeroBadges = computed(() => [
  ...(activeClaim.value
    ? [{
        statusId: activeClaim.value.egcs_fc_status,
        isCompleted: activeClaim.value.isCompleted
      }]
    : []),
  ...(submissionReview.state.value
    ? [{
        variant: 'code',
        label: t(`submission.state.${submissionReview.state.value}`),
        prefixLabel: t('agreement.claims.submission_title')
      }]
    : [])
])

const setDraftAllocation = (claimLineId: string, value: string | number | null | undefined) => {
  draftAllocations.value = { ...draftAllocations.value, [claimLineId]: value === null || value === undefined ? null : String(value) }
}

const allocationOptions = computed(() =>
  activeBudgetLineItems.value.map(line => ({
    id: String(line.id),
    label_en: joinLabelParts([
      hideClaimCostCategory.value ? null : line.organization_cost_category_name_en,
      hideClaimCostSubsection.value ? null : line.egcs_fc_costsubsection,
      line.line_item_name_en ?? line.egcs_fc_description
    ]),
    label_fr: joinLabelParts([
      hideClaimCostCategory.value ? null : line.organization_cost_category_name_fr,
      hideClaimCostSubsection.value ? null : line.egcs_fc_costsubsection,
      line.line_item_name_fr ?? line.egcs_fc_description
    ])
  }))
)

const getTotalSuccessfulReconciledForClaimLineId = (claimLineId: string | number | null | undefined) => {
  if (claimLineId === undefined || claimLineId === null) {
    return zeroAmount()
  }

  return sumMoney(reconcileLineItems.value
    .filter((item: FundingCaseAgreementClaimReconcileLineItemRow) => successfulReconcileIds.value.has(String(item.egcs_fc_fundingagreementclaimreconcile)))
    .filter((item: FundingCaseAgreementClaimReconcileLineItemRow) => String(item.egcs_fc_lineitem) === String(claimLineId))
    .map(item => item.egcs_fc_reconciled), getCurrency())
}

const getSuccessfulReconciledExcludingReconcile = (
  claimLineId: string | number,
  reconcileId: string | number | null | undefined
) => sumMoney(reconcileLineItems.value
  .filter((item: FundingCaseAgreementClaimReconcileLineItemRow) => successfulReconcileIds.value.has(String(item.egcs_fc_fundingagreementclaimreconcile)))
  .filter((item: FundingCaseAgreementClaimReconcileLineItemRow) => String(item.egcs_fc_fundingagreementclaimreconcile) !== String(reconcileId))
  .filter((item: FundingCaseAgreementClaimReconcileLineItemRow) => String(item.egcs_fc_lineitem) === String(claimLineId))
  .map(item => item.egcs_fc_reconciled), getCurrency())

const selectedReconcileLineBalance = computed(() => {
  const line = selectedReconcileLine.value
  return line
    ? subtractMoney(subtractMoney(line.submittedAmount, line.previouslyReconciledAmount), readDraftMoney(line.egcs_fc_reconciled))
    : zeroAmount()
})

const submissionColumns = computed<TableColumnInput<ClaimSubmissionTableRow>[]>(() => [
  { id: COST_CATEGORY_GROUP_COLUMN_ID, accessorKey: COST_CATEGORY_GROUP_COLUMN_ID, headerKey: 'agreement.claims.cost_category' },
  { id: COST_SUBSECTION_GROUP_COLUMN_ID, accessorKey: COST_SUBSECTION_GROUP_COLUMN_ID, headerKey: 'agreement.budget.cost_subsection' },
  { id: 'name', accessorKey: 'lineItemNameEn', headerKey: 'agreement.budget.line_item' },
  { id: 'submittedAmount', accessorKey: 'submittedAmount', headerKey: 'agreement.claims.submitted_amount' },
  { id: 'reconciledAmount', accessorKey: 'reconciledAmount', headerKey: 'agreement.claims.reconciled_amount' },
  { id: 'balance', accessorKey: 'balance', headerKey: 'agreement.claims.balance' },
  { id: 'actions', headerKey: 'common.actions' }
].filter(column => (column.id !== COST_CATEGORY_GROUP_COLUMN_ID || !hideClaimCostCategory.value)
  && (column.id !== COST_SUBSECTION_GROUP_COLUMN_ID || !hideClaimCostSubsection.value)))

const normalizedSubmissionSearch = computed(() => submissionSearch.value.trim().toLowerCase())
const unallocatedGroupLabel = computed(() => t('agreement.claims.unallocated'))

const claimSubmissionRows = computed<ClaimSubmissionTableRow[]>(() => {
  if (!profile.value?.egcs_fc_currency) return []
  const budgetRows = activeBudgetLineItems.value.flatMap((budgetLine: FundingCaseAgreementBudgetLineItemRow) => {
    const budgetLineId = String(budgetLine.id)
    const claimLines = claimLinesByBudgetId.value.get(budgetLineId) ?? []
    const costCategoryLabel = getCostCategoryLabel(budgetLine)
    const costSubsectionLabel = getCostSubsectionLabel(budgetLine.egcs_fc_costsubsection)

    if (claimLines.length > 1) {
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
    const submittedAmount = claimLine?.egcs_fc_amount ?? zeroAmount()
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

  const historicalRows = activeClaimLineItems.value.filter(isHistoricalClaimLine).map(line => {
    const reconciledAmount = getTotalSuccessfulReconciledForClaimLineId(line.id)
    const categoryLabel = getCostCategoryLabel(line)
    const subsectionLabel = getCostSubsectionLabel(line.egcs_fc_costsubsection)
    return {
      id: `claim:${line.id}`,
      costCategoryGroup: categoryLabel,
      costSubsectionGroup: subsectionLabel,
      costCategoryLabel: categoryLabel,
      costSubsectionLabel: subsectionLabel,
      lineItemNameEn: line.line_item_name_en || line.egcs_fc_submittedlineitem?.trim() || line.egcs_fc_description || t('common.unavailable'),
      lineItemNameFr: line.line_item_name_fr || line.egcs_fc_submittedlineitem?.trim() || line.egcs_fc_description || t('common.unavailable'),
      description: line.egcs_fc_description,
      submittedAmount: line.egcs_fc_amount,
      reconciledAmount,
      balance: subtractMoney(line.egcs_fc_amount, reconciledAmount),
      budgetLineId: String(line.budget_line_item_id ?? line.egcs_fc_fundingagreementbudgetlineitem),
      claimLineId: String(line.id),
      claimLine: line,
      isUnallocated: false,
      isHistorical: true
    }
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

  return [...budgetRows, ...historicalRows, ...unallocatedRows]
})

const filteredClaimSubmissionRows = computed(() => {
  if (normalizedSubmissionSearch.value.length === 0) {
    return claimSubmissionRows.value
  }

  return claimSubmissionRows.value.filter(row => [
    hideClaimCostCategory.value ? '' : row.costCategoryLabel,
    hideClaimCostSubsection.value ? '' : row.costSubsectionLabel,
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
  groups: () => ([
    {
      id: COST_CATEGORY_GROUP_COLUMN_ID,
      getValue: (row: ClaimSubmissionTableRow) => row.costCategoryGroup
    },
    {
      id: COST_SUBSECTION_GROUP_COLUMN_ID,
      getValue: (row: ClaimSubmissionTableRow) => row.costSubsectionGroup
    }
  ]).filter(group => (group.id !== COST_CATEGORY_GROUP_COLUMN_ID || !hideClaimCostCategory.value)
    && (group.id !== COST_SUBSECTION_GROUP_COLUMN_ID || !hideClaimCostSubsection.value)),
  defaultExpanded: true
})

const isSubmissionCostCategoryGroupRow = (row: GroupedClaimSubmissionRow) => isSubmissionGroupRow(row, COST_CATEGORY_GROUP_COLUMN_ID)
const isSubmissionCostSubsectionGroupRow = (row: GroupedClaimSubmissionRow) => isSubmissionGroupRow(row, COST_SUBSECTION_GROUP_COLUMN_ID)
const getSubmissionGroupedTotal = (row: GroupedClaimSubmissionRow, key: 'submittedAmount' | 'reconciledAmount' | 'balance') =>
  sumMoney(getSubmissionLeafRows(row).map(leafRow => leafRow.original[key]), getCurrency())

const isReconcileMutationPending = computed(() =>
  reconciliationWrite.value.kind !== 'idle' || isCancellingReconcile.value
)

const isReconcileLineActionPending = computed(() => isReconcileActionPending.value || isSavingReconcileLine.value
  || (isReconcileMutationPending.value && reconciliationWrite.value.kind !== 'line'))

const selectReconcile = (reconcileId: string | number) => {
  if (isReconcileMutationPending.value) return
  selectedReconcileId.value = String(reconcileId)
}

const getReconcileTotal = (reconcileId: string | number, key: 'egcs_fc_reconciled' | 'egcs_fc_sampled') =>
  sumMoney(reconcileLineItems.value
    .filter((line: FundingCaseAgreementClaimReconcileLineItemRow) => String(line.egcs_fc_fundingagreementclaimreconcile) === String(reconcileId))
    .flatMap(line => line[key] == null ? [] : [line[key]]), getCurrency())

const getReconcileBalance = (reconcile: FundingCaseAgreementClaimReconcileRow) => subtractMoney(
  sumMoney(activeClaimLineItems.value.map(line => subtractMoney(
    line.egcs_fc_amount,
    getSuccessfulReconciledExcludingReconcile(line.id, reconcile.id)
  )), getCurrency()),
  getReconcileTotal(reconcile.id, 'egcs_fc_reconciled')
)

const activeReconcileIsFinal = computed(() => activeReconcile.value?.egcs_fc_isfinal === true)
const reconcileFinalCheckboxValue = computed(() => reconciliationWrite.value.kind === 'final'
  ? reconciliationWrite.value.value
  : activeReconcileIsFinal.value)
const otherFinalReconcile = computed(() =>
  activeClaimReconciles.value.find((reconcile: FundingCaseAgreementClaimReconcileRow) =>
    reconcile.egcs_fc_isfinal === true && String(reconcile.id) !== String(activeReconcile.value?.id)
  ) ?? null
)
const canEditActiveReconcileFinal = computed(() =>
  Boolean(activeReconcile.value)
  && canUpdateReconcileRole.value
  && !isReconcileMutationPending.value
  && !isReconcileActionPending.value
)

const openSubmissionEditor = (line: ClaimSubmissionTableRow) => {
  if (isLoadingDetail.value || isSavingSubmission.value || !line.budgetLineId
    || !guardClaimAction(canEditClaimSubmissionAmount(line.budgetLineId), claimSubmissionEditWarning.value)) return
  submissionModal.openUpdate(line)
}

const saveSubmission = async () => {
  if (!isCurrentPage()) return
  const line = selectedSubmissionLine.value
  const session = submissionModal.captureSession()
  const target = submissionTarget.value
  const budgetLine = activeBudgetLineItems.value.find(item => String(item.id) === target?.budgetLineId)
  if (!activeClaim.value || !line || !target || !budgetLine || isLoadingDetail.value || isSavingSubmission.value) {
    return
  }

  if (!guardClaimAction(canEditClaimSubmissionAmount(String(budgetLine.id)), claimSubmissionEditWarning.value)) return
  const operation = (target.claimLineId !== null ? submissionUpdateContext : submissionCreateContext).capture()
  if (!operation?.canDispatch()) return
  const settlement = (target.claimLineId !== null ? submissionCollectionUpdateContext : submissionCollectionCreateContext).capture()
  if (!settlement?.canDispatch()) return

  const release = submissionWrites.acquire('amount')
  if (!release) return
  const ownsEditor = () => isCurrentPage() && operation.isCurrent() && submissionModal.isCurrentSession(session)
  try {
    const { egcs_fc_amount: amount } = submissionAmountSchema.parse(line)
    const editComment = needsSubmissionEditComment.value ? SubmissionEditCommentSchema.parse(line.editComment) : undefined
    const existing = activeClaimLineItems.value.find(item => String(item.id) === target.claimLineId)
    let didMutate = false
    if (existing && compareMoney(existing.egcs_fc_amount, amount) !== 0) {
      const totalAmount = claimFundingMode.value === 'manual'
        ? addMoney(existing.egcs_fc_totalamount, subtractMoney(amount, existing.egcs_fc_amount))
        : undefined
      await sendJson(`/api/agreements/${agreementId}/claim-line-items/${existing.id}`, 'PATCH', {
        egcs_fc_amount: amount,
        ...(totalAmount ? { egcs_fc_totalamount: totalAmount } : {}),
        egcs_fc_description: existing.egcs_fc_description,
        editComment
      })
      didMutate = true
    }
    if (!existing && compareMoney(amount, zeroAmount()) !== 0) {
      await sendJson(`/api/agreements/${agreementId}/claim-line-items`, 'POST', {
        egcs_fc_fundingagreementclaim: claimId,
        egcs_fc_fundingagreementbudgetlineitem: String(budgetLine.id),
        egcs_fc_description: budgetLine.egcs_fc_description,
        egcs_fc_amount: amount,
        ...(claimFundingMode.value === 'manual' ? { egcs_fc_totalamount: amount } : {}),
        egcs_fc_currency: budgetLine.egcs_fc_currency,
        editComment
      })
      didMutate = true
    }
    if (!isCurrentPage() || !settlement.isCurrent()) return
    if (didMutate) {
      await refreshAfterSubmissionEdit()
      if (!isCurrentPage() || !settlement.isCurrent()) return
      if (ownsEditor()) toast.add({ title: toast.localized('common.success'), description: toast.localized('agreement.claims.saved_submission'), color: 'success' })
    }
    submissionModal.closeSession(session)
  } catch (error: unknown) {
    if (ownsEditor()) showError(error)
  } finally {
    release()
  }
}
const submissionFormSession = useFormSession({ owner: submissionModal, action: { kind: 'remote', context: () => submissionTarget.value?.claimLineId != null ? submissionUpdateContext : submissionCreateContext }, submit: saveSubmission, onDenied: () => guardClaimAction(submissionTarget.value?.budgetLineId ? canEditClaimSubmissionAmount(submissionTarget.value.budgetLineId) : false, claimSubmissionEditWarning.value) })

const additionalInformationContexts = useSubmissionAnswerContexts({
  identity: [() => route.params.id, () => route.params.claimId],
  profile: () => ({ status: profileStatus.value, error: profileError.value, canUpdate: canUpdateClaim.value }),
  record: () => ({ status: overviewStatus.value, error: overviewError.value, matches: activeClaim.value?.id === claimId }),
  eligible: () => isCurrentPage() && !claimSubmissionEditWarning.value
})
const additionalInformationEditor = useSubmissionAnswerEditor({
  ...additionalInformationContexts,
  readAnswers: () => additionalInformationValues.value,
  readSubmissionRevision: () => overview.value?.linkedReview?.revision ?? null,
  readDefinitions: () => additionalInformationFields.value,
  readComments: () => submissionReview.sectionComments.value,
  isBlocked: () => submissionReviewBusy.value || submissionReview.pending.value,
  persist: async (changes, customFieldPrecondition, customFieldComments) => {
    const result = await sendJson<{ customFieldsChanged: boolean }>(`/api/agreements/${agreementId}/claims/${claimId}`, 'PATCH', {
      egcs_fc_customfields: changes,
      customFieldPrecondition,
      customFieldComments
    })
    return result.customFieldsChanged
  },
  readback: readbackSubmissionEdit,
  onDenied: () => { guardClaimAction(canUpdateClaim.value, claimSubmissionEditWarning.value) },
  isConflict: error => {
    const payload = error && typeof error === 'object' && 'data' in error ? error.data : undefined
    const data = payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload
    const code = data && typeof data === 'object' && 'code' in data ? data.code : undefined
    return code === 'CLAIM_ANSWERS_STALE' || code === 'SUBMISSION_STALE' || code === 'SUBMISSION_REVIEW_REQUIRED'
  },
  onError: showError,
  onSaved: () => toast.add({ title: toast.localized('common.success'), description: toast.localized('agreement.claims.saved_additional_information'), color: 'success' })
})
const { isDirty: additionalInformationDirty, isSaving: isSavingAdditionalInformation, discardStaleDraft: discardStaleAdditionalInformation } = additionalInformationEditor

const reloadStaleAdditionalInformation = async () => {
  if (discardStaleAdditionalInformation()) await submissionReview.refresh()
}

const isAdditionalInformationLoading = computed(() => assignmentStatus.value === 'idle'
  || submissionReview.status.value === 'idle' || submissionReview.reloading.value)

const allocateClaimLine = async (line: FundingCaseAgreementClaimLineItemRow) => {
  if (!isCurrentPage()) return
  const lineId = String(line.id)
  const budgetLineItemId = draftAllocations.value[lineId]
  const editComment = needsSubmissionEditComment.value ? allocationComments.value[lineId]?.trim() : undefined
  if (needsSubmissionEditComment.value && !editComment) return

  if (isLoadingDetail.value || allocatingClaimLineId.value !== null) {
    return
  }

  if (!guardClaimAction(canAllocateClaimLines.value, claimSubmissionEditWarning.value
    ?? (!budgetLineItemId ? toast.localized('agreement.claims.action_unavailable') : undefined))) return

  const operation = submissionCollectionUpdateContext.capture()
  if (!operation?.canDispatch()) return
  const isCurrent = () => isCurrentPage() && operation.isCurrent()
  try {
    allocatingClaimLineId.value = lineId
    await sendJson(`/api/agreements/${agreementId}/claim-line-items/${lineId}`, 'PATCH', {
      egcs_fc_fundingagreementbudgetlineitem: budgetLineItemId,
      editComment
    })
    if (!isCurrent()) return
    allocationComments.value[lineId] = ''
    await refreshAfterSubmissionEdit()
    if (!isCurrent()) return
    toast.add({ title: toast.localized('common.success'), description: toast.localized('agreement.claims.allocation_saved'), color: 'success' })
  } catch (error: unknown) {
    if (isCurrent()) showError(error)
  } finally {
    allocatingClaimLineId.value = null
  }
}

const transitionClaim = async (
  action: 'withdraw' | 'cancel',
  loadingRef: Ref<boolean>,
  successKey: string
) => {
  if (!isCurrentPage() || !activeClaim.value || loadingRef.value) {
    return
  }

  try {
    loadingRef.value = true
    await sendJson(`/api/agreements/${agreementId}/claims/${claimId}/${action}`, 'POST')
    if (!isCurrentPage()) return
    await refreshPage()
    if (!isCurrentPage()) return
    toast.add({ title: toast.localized('common.success'), description: toast.localized(successKey), color: 'success' })
  } catch (error: unknown) {
    if (isCurrentPage()) showError(error)
  } finally {
    loadingRef.value = false
  }
}

const withdrawClaim = async () => {
  if (isLoadingDetail.value || isWithdrawingClaim.value || isCancellingClaim.value || !guardClaimAction(canWithdrawClaim.value,
    claimWorkflowPrerequisiteWarning.value ?? (!withdrawClaimReady.value ? toast.localized('agreement.claims.action_unavailable') : undefined))) {
    return
  }

  await transitionClaim('withdraw', isWithdrawingClaim, 'agreement.claims.withdraw_success')
}

const cancelClaim = async () => {
  if (isLoadingDetail.value || isCancellingClaim.value || isWithdrawingClaim.value || !guardClaimAction(canCancelClaim.value,
    claimWorkflowPrerequisiteWarning.value ?? (!cancelClaimReady.value ? toast.localized('agreement.claims.action_unavailable') : undefined))) {
    return
  }

  await transitionClaim('cancel', isCancellingClaim, 'agreement.claims.cancel_success')
}

const startReconcile = async () => {
  if (!isCurrentPage()) return
  if (isLoadingDetail.value || isStartingReconcile.value || !guardClaimAction(canStartReconcile.value,
    claimSourcePrerequisiteWarning.value ?? (!startReconcileReady.value ? toast.localized('agreement.claims.reconcile_prerequisites') : undefined))) {
    return
  }

  try {
    isStartingReconcile.value = true
    const created = await sendJson<FundingCaseAgreementClaimReconcileRow>(`/api/agreements/${agreementId}/claim-reconciles`, 'POST', {
      egcs_fc_fundingagreementclaim: claimId,
      egcs_fc_isfinal: false
    })
    if (!isCurrentPage()) return
    await refreshPage()
    if (!isCurrentPage()) return
    selectedReconcileId.value = String(created.id)
  } catch (error: unknown) {
    if (isCurrentPage()) showError(error)
  } finally {
    isStartingReconcile.value = false
  }
}

const setActiveReconcileFinal = async (value: boolean | 'indeterminate') => {
  const reconcile = activeReconcile.value
  if (!reconcile || !canEditActiveReconcileFinal.value || value === 'indeterminate' || value === activeReconcileIsFinal.value) return
  if (!guardReconcileAction(reconcileEditPrerequisiteWarning.value
    ?? (value && otherFinalReconcile.value ? toast.localized('agreement.claims.final_reconcile_exists', { id: otherFinalReconcile.value.id }) : undefined))) return
  const context = reconcileActionContext.capture()
  if (!context?.canDispatch()) return

  reconciliationWrite.value = { kind: 'final', value }
  try {
    await sendJson(`/api/claim-reconciliations/${reconcile.id}`, 'PATCH', { egcs_fc_isfinal: value })
    if (!isCurrentPage()) return
    await refreshReconcileWorkspace()
  } catch (error: unknown) {
    if (context.isCurrent()) showError(error)
  } finally {
    reconciliationWrite.value = { kind: 'idle' }
  }
}

const reconcileAllAmounts = async () => {
  const reconcile = activeReconcile.value
  if (!reconcile || isReconcileMutationPending.value || isReconcileLineModalOpen.value
    || !guardReconcileAction(reconcileEditPrerequisiteWarning.value)) return
  const context = reconcileActionContext.capture()
  if (!context?.canDispatch()) return

  reconciliationWrite.value = { kind: 'bulk' }
  try {
    const changed = await reconcileAll(String(reconcile.id), context.canDispatch)
    if (!changed || !isCurrentPage()) return
    await refreshReconcileWorkspace()
    if (isCurrentPage() && context.isCurrent()) toast.add({
      title: toast.localized('common.success'),
      description: toast.localized('agreement.claims.saved_reconcile'),
      color: 'success'
    })
  } catch (error: unknown) {
    if (context.isCurrent()) showError(error)
  } finally {
    reconciliationWrite.value = { kind: 'idle' }
  }
}

const openReconcileLineEditor = (line: AgreementClaimReconciliationTableLine) => {
  if (!isCurrentPage()) return
  if (line.editable && (isReconcileLineActionPending.value || !guardReconcileAction(reconcileEditPrerequisiteWarning.value))) return
  reconcileLineModal.openUpdate(line)
}

const saveReconcileLine = async () => {
  if (!isCurrentPage()) return
  const line = selectedReconcileLine.value
  const reconcile = activeReconcile.value
  const detailLine = selectedReconcileLinesByClaimLineId.value.get(line?.id ?? '')
  const session = reconcileLineModal.captureSession()
  if (!line || !reconcile || !detailLine || isReconcileMutationPending.value || !reconcileLineModal.isCurrentSession(session)
    || !guardReconcileAction(reconcileEditPrerequisiteWarning.value)) return
  const context = reconcileActionContext.capture()
  if (!context?.canDispatch() || !reconcileLinePending.begin(session)) return
  reconciliationWrite.value = { kind: 'line' }

  try {
    const base = `/api/claim-reconciliations/${reconcile.id}/lines`
    const amounts = {
      egcs_fc_reconciled: parseMoney(line.egcs_fc_reconciled),
      egcs_fc_sampled: parseOptionalMoneyInput(line.egcs_fc_sampled),
      egcs_fc_rationale: line.egcs_fc_rationale.trim() || null
    }
    if (detailLine.reconcile_line_id) {
      await sendJson(`${base}/${detailLine.reconcile_line_id}`, 'PATCH', amounts)
    } else {
      await sendJson(base, 'POST', {
        ...amounts,
        egcs_fc_fundingagreementclaimreconcile: String(reconcile.id),
        egcs_fc_lineitem: detailLine.claim_line_id
      })
    }
    if (!isCurrentPage()) return
    try {
      await refreshReconcileWorkspace()
    } catch (error: unknown) {
      if (context.isCurrent()) showError(error)
    }
    if (isCurrentPage() && context.isCurrent() && reconcileLineModal.closeSession(session)) {
      toast.add({ title: toast.localized('common.success'), description: toast.localized('agreement.claims.saved_reconcile_line'), color: 'success' })
    }
  } catch (error: unknown) {
    if (context.isCurrent() && reconcileLineModal.isCurrentSession(session)) showError(error)
  } finally {
    reconciliationWrite.value = { kind: 'idle' }
    reconcileLinePending.end(session)
  }
}
const reconcileLineFormSession = useFormSession({
  owner: reconcileLineModal,
  action: { kind: 'remote', context: reconcileActionContext },
  submit: saveReconcileLine,
  onDenied: () => guardReconcileAction(reconcileEditPrerequisiteWarning.value)
})
const refreshReconcileWorkspace = async () => {
  await refreshPage()
  await loadSelectedReconcileDetail()
}
const cancelReconciliation = async () => {
  if (!isCurrentPage()) return
  const reconcile = activeReconcile.value
  if (!reconcile || isReconcileMutationPending.value || isCancellingReconcile.value
    || !guardReconcileAction(reconcileWorkflowPrerequisiteWarning.value
      ?? (!canCancelReconcile.value ? toast.localized('agreement.claims.action_unavailable') : undefined))) return
  if (!window.confirm(t('agreement.claims.cancel_reconcile_confirmation'))) return
  try {
    isCancellingReconcile.value = true
    await sendJson(`/api/agreements/${agreementId}/claim-reconciles/${reconcile.id}/cancel`, 'POST')
    if (!isCurrentPage()) return
    await refreshReconcileWorkspace()
    if (!isCurrentPage()) return
    toast.add({
      title: toast.localized('common.success'),
      description: toast.localized('agreement.claims.cancel_reconcile_success'),
      color: 'success'
    })
  } catch (error: unknown) {
    if (isCurrentPage()) showError(error)
  } finally {
    isCancellingReconcile.value = false
  }
}

useFieldTooltipProvider(() => activeClaim.value && String(activeClaim.value.id) === String(route.params.claimId) ? { entityType: 'fundingcaseagreementclaim', entityId: activeClaim.value.id } : null)
</script>

<template>
  <div data-field-tooltip-context="agreement" data-field-scope="agreements.claims" data-scope-label-en="Agreements > Claims > Reconciliation" data-scope-label-fr="Ententes > Demandes de remboursement > Rapprochement" class="flex w-full flex-col">
    <CommonErrorNotice v-if="hasLoadError" :title="t('common.resource_table_load_failed')" :description="t('common.resource_table_load_failed_description')">
      <template #actions>
        <UButton :label="t('common.retry')" :loading="isLoadingDetail" @click="retryLoad" />
      </template>
    </CommonErrorNotice>
    <div v-else-if="isLoadingDetail && (!profile || !activeClaim)" role="status" aria-live="polite" class="sr-only">
      <span>{{ t('common.loading_records') }}</span>
    </div>
    <CommonDetailPage v-if="profile && activeClaim" id="agreement-claim-detail" v-model:collapsed="isHeroCollapsed" data-help-view="casework.claims.detail" :breadcrumb-items="breadcrumbItems" class="w-full">
      <template #body>
        <div class="flex flex-1 flex-col">
          <CommonEntityHero
            :is-collapsed="isHeroCollapsed"
            icon="i-lucide-receipt-text"
            :actions="claimHeroActions"
            :title="claimHeroTitle"
            :meta-items="claimHeroMetaItems"
            :badges="claimHeroBadges" />

          <CommonDetailWorkspace v-model="selectedClaimTab" help-navigation-group-target="casework.claims.detail.section-navigation" data-field-container="Page navigation state, not a business input field." :items="claimTabs" :priority-values="['submission', 'additional', 'requests']" content-test-id="agreement-claim-detail-content">
            <template #navigation-leading>
              <div class="flex items-center gap-2 px-3 py-2 text-xs font-black uppercase tracking-widest text-zinc-600 dark:text-zinc-400">
                <UIcon name="i-lucide-file-input" class="size-4 shrink-0" aria-hidden="true" />
                {{ t('agreement.claims.submission_title') }}
              </div>
            </template>
            <template v-if="isClaimSubmissionSection" #notices>
              <AgreementSubmissionLinkedReview
                :review="submissionReview"
                :busy="submissionReviewActionsBlocked"
                :start-in-hero="!isHeroCollapsed" />
            </template>
            <template v-else-if="selectedClaimTab === 'reconciliation' || selectedClaimTab === 'workflows'" #notices>
              <AgreementSubmissionLinkedReview :review="submissionReview" :busy="submissionReviewActionsBlocked" notice-only />
            </template>
            <AgreementSubmissionRequests
              v-show="selectedClaimTab === 'requests'"
              :active="selectedClaimTab === 'requests'"
              :agreement-id="agreementId"
              entity-type="fundingcaseagreementclaim"
              :entity-id="claimId" />
            <div v-if="selectedClaimTab === 'submission'" data-help-target="casework.claims.submission.content" data-help-kind="section" data-help-view="casework.claims.submission" class="w-full min-w-0">
              <div class="space-y-8">
                <div class="space-y-4">
                  <section data-help-target="casework.claims.submission.records">
                    <CommonResourceLayout
                      v-model:search="submissionSearch"
                      v-model:pagination="submissionPagination"
                      help-search-target="casework.claims.submission.search"
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
                            <p v-if="row.original.isHistorical" class="text-sm text-muted">
                              {{ t('agreement.claims.historical_budget_line_read_only') }}
                            </p>
                            <p v-if="row.original.description" class="min-w-0 max-w-full whitespace-normal break-words text-sm text-zinc-500 dark:text-zinc-400">
                              {{ row.original.description }}
                            </p>
                            <dl v-if="showClaimFunding && row.original.claimLine" :data-testid="row.original.isHistorical ? 'claim-historical-funding' : undefined" class="space-y-1 text-sm text-muted">
                              <div v-for="source in row.original.claimLine.egcs_fc_fundingsources" :key="source.egcs_fc_fundingsubtype" class="flex flex-wrap gap-x-2">
                                <dt>{{ t('agreement.funding_sources.title') }}: {{ getBilingualValue(source, 'funding_subtype_name', t('common.unavailable')) }}</dt>
                                <dd>{{ formatMoney(source.egcs_fc_amount) }}</dd>
                              </div>
                              <div class="flex flex-wrap gap-x-2">
                                <dt>{{ t('agreement.funding_sources.total_cost') }}</dt>
                                <dd>{{ formatMoney(row.original.claimLine.egcs_fc_totalamount) }}</dd>
                              </div>
                            </dl>
                            <UButton
                              v-if="showClaimFunding && !isHistoricalClaim && !row.original.isHistorical && row.original.claimLine && canUpdateClaim"

                              color="neutral"
                              variant="link"
                              size="xs"
                              :label="t('agreement.funding_sources.edit_line')"
                              :disabled="isLoadingDetail || isSavingFunding"
                              @click="openFundingEditor(row.original.claimLine)" />
                            <UButton
                              v-if="showClaimFunding && !isHistoricalClaim && row.original.isHistorical && row.original.claimLine?.egcs_fc_fundingsources.length && canUpdateClaim"
                              color="error"
                              variant="link"
                              size="xs"
                              :label="t('agreement.funding_sources.clear')"
                              :disabled="isLoadingDetail || isSavingFunding"
                              @click="openFundingEditor(row.original.claimLine, true)" />
                            <div v-if="row.original.isUnallocated && row.original.claimLine && canAllocateClaimLines" class="flex flex-wrap items-end gap-2 pt-1">
                              <UFormField data-ui-target="agreements.claims.claims.allocate_to_budget_line" :label="t('agreement.claims.allocate_to_budget_line')" :name="`allocation-${row.original.claimLine.id}`" required class="min-w-72">
                                <CommonBilingualSelectMenu
                                  :model-value="draftAllocations[String(row.original.claimLine.id)]"
                                  :items="allocationOptions"
                                  value-key="id"
                                  label-en-key="label_en"
                                  label-fr-key="label_fr"
                                  searchable
                                  :disabled="Boolean(claimSubmissionEditWarning)"
                                  @update:model-value="value => setDraftAllocation(String(row.original.claimLine!.id), value)" />
                              </UFormField>
                              <UFormField v-if="needsSubmissionEditComment" :label="t('submission.edit_comment')" :name="`editComment-${row.original.claimLine.id}`" data-ui-target="agreements.claims.allocation.edit-comment" required>
                                <UInput v-model="allocationComments[String(row.original.claimLine.id)]" :maxlength="SUBMISSION_EDIT_COMMENT_MAX_LENGTH" required aria-required="true" :disabled="allocatingClaimLineId !== null" />
                              </UFormField>
                              <UButton
                                color="primary"
                                icon="i-lucide-link"
                                class="cursor-default"
                                :loading="allocatingClaimLineId === String(row.original.claimLine.id)"
                                :disabled="isLoadingDetail || allocatingClaimLineId !== null || (needsSubmissionEditComment && !allocationComments[String(row.original.claimLine.id)]?.trim())"
                                @click="allocateClaimLine(row.original.claimLine)">
                                {{ t('agreement.claims.allocate') }}
                              </UButton>
                            </div>
                          </div>
                        </div>
                      </template>

                      <template #submittedAmount-cell="{ row }">
                        <span class="font-medium text-zinc-700 dark:text-zinc-200">
                          {{ formatMoney(isGroupedSubmissionRow(row as GroupedClaimSubmissionRow) ? getSubmissionGroupedTotal(row as GroupedClaimSubmissionRow, 'submittedAmount') : row.original.submittedAmount) }}
                        </span>
                      </template>

                      <template #actions-cell="{ row }">
                        <div class="flex justify-end gap-2">
                          <CommonActionButton
                            v-if="!isGroupedSubmissionRow(row as GroupedClaimSubmissionRow) && row.original.budgetLineId && canEditClaimSubmissionAmount(row.original.budgetLineId)"

                            icon="i-lucide-pencil"
                            color="neutral"
                            variant="ghost"
                            size="sm"
                            :aria-label="t('agreement.claims.edit_submitted_amount_for', { name: locale === 'fr' ? row.original.lineItemNameFr : row.original.lineItemNameEn })"
                            :disabled="isLoadingDetail || isSavingSubmission"
                            @click="openSubmissionEditor(row.original)" />
                        </div>
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
                    </CommonResourceLayout>
                  </section>
                </div>

                <div class="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
                  <p class="text-sm text-zinc-500 dark:text-zinc-400">
                    {{ t('agreement.claims.review_readiness_description') }}
                  </p>
                  <div class="flex flex-wrap justify-end gap-2">
                    <UButton
                      v-if="canWithdrawClaim"
                      data-help-target="casework.claims.detail.withdraw-claim"
                      color="neutral"
                      variant="outline"
                      icon="i-lucide-undo-2"
                      class="cursor-default"
                      :loading="isWithdrawingClaim"
                      :disabled="isLoadingDetail || isWithdrawingClaim || isCancellingClaim"
                      @click="withdrawClaim">
                      {{ t('agreement.claims.withdraw') }}
                    </UButton>
                    <UButton
                      v-if="canCancelClaim"
                      data-help-target="casework.claims.detail.cancel-claim"
                      color="error"
                      variant="outline"
                      icon="i-lucide-ban"
                      class="cursor-default"
                      :loading="isCancellingClaim"
                      :disabled="isLoadingDetail || isCancellingClaim || isWithdrawingClaim"
                      @click="cancelClaim">
                      {{ t('agreement.claims.cancel') }}
                    </UButton>
                  </div>
                </div>
              </div>
            </div>

            <AgreementSubmissionAdditional
              v-else-if="selectedClaimTab === 'additional'"
              :editor="additionalInformationEditor"
              :fields="additionalInformationFields"
              :answers="additionalInformationValues"
              :latest-received="submissionReview.latestReceived.value"
              :saved-comments="submissionReview.sectionComments.value"
              :currency="profile?.egcs_fc_currency"
              :can-update="canUpdateClaim"
              :blocked="submissionReviewBusy || submissionReview.pending.value"
              :loading="isAdditionalInformationLoading"
              :ready="profileStatus === 'success' && overviewStatus === 'success'"
              stale-message="apiErrors.agreement.claim_answers_stale"
              empty-message="agreement.claims.no_additional_information"
              @reload="reloadStaleAdditionalInformation" />

            <div v-else-if="selectedClaimTab === 'history'" class="space-y-4">
              <AgreementSubmissionLinkedReview
                v-if="submissionReview.error.value || submissionReview.stale.value || submissionReview.failed.value"
                :review="submissionReview"
                :busy="submissionReviewActionsBlocked"
                notice-only />
              <AgreementSubmissionHistory
                v-if="submissionReview.detail.value"
                :events="submissionReview.detail.value.events"
                target="claim"
                :source="submissionReview.detail.value.submission.egcs_fc_sourcesystem" />
            </div>

            <CommonReviewsTab
              v-else-if="selectedClaimTab === 'reviews'"
              data-help-view="casework.claims.reviews"
              entity-type="fundingcaseagreementclaim"
              :entity-id="claimId"
              :can-update="isAssigned && !activeClaimIsLocked"
              @changed="refreshPage" />

            <CommonWorkflowSection
              v-else-if="selectedClaimTab === 'workflows'"
              :mutation-role-allowed="canUpdateClaim"
              data-help-view="casework.claims.workflows"
              entity-type="fundingcaseagreementclaim"
              :entity-id="claimId"
              purpose="standard"
              :can-edit="isAssigned"
              :action-role-allowed="canUpdateClaim"
              :action-prerequisite-warning="claimWorkflowPrerequisiteWarning"
              :start-prerequisite-warning="submissionLifecycleWarning"
              :refresh-key="approvalsRefreshKey"
              @changed="refreshPage" />

            <section v-else-if="selectedClaimTab === 'supplementary-information'" data-help-view="casework.claims.supplementary-information" data-help-target="casework.claims.supplementary-information.content">
              <CommonWorkflowSupplementaryInformation

                :show-header="false"
                entity-type="fundingcaseagreementclaim"
                :entity-id="claimId" />
            </section>

            <div v-else-if="selectedClaimTab === 'reconciliation'" data-help-view="casework.claims.reconciliation" data-help-target="casework.claims.detail.reconciliation" data-help-kind="section" class="w-full min-w-0">
              <div v-if="claimIsReadyForReconcile && canStartReconcile" class="mb-6 flex justify-end">
                <UButton
                  data-help-target="casework.claims.detail.claims-new-reconcile-with-context"
                  color="primary"
                  icon="i-lucide-plus"
                  class="cursor-default"
                  :loading="isStartingReconcile"
                  :disabled="isLoadingDetail || isStartingReconcile"
                  :aria-label="t('agreement.claims.new_reconcile_with_context')"
                  @click="startReconcile">
                  {{ t('agreement.claims.new_reconcile') }}
                </UButton>
              </div>
              <CommonCompletionWorkflowPreAction
                v-if="!claimIsReadyForReconcile"
                :mutation-role-allowed="canUpdateClaim"
                mode="completion"
                entity-type="fundingcaseagreementclaim"
                :entity-id="claimId"
                :can-edit="isAssigned"
                :is-locked="!claimEditReady"
                :action-role-allowed="canUpdateClaim"
                :action-prerequisite-warning="claimWorkflowPrerequisiteWarning"
                :completion-prerequisite-warning="claimCompletionWarning"
                show-when-unconfigured
                title-key="agreement.claims.completion.title"
                description-key="agreement.claims.completion.description"
                action-label-key="agreement.claims.start_reconcile"
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
                          v-if="canUpdateReconcileRole"
                          data-help-target="casework.claims.detail.claims-cancel-reconcile"
                          color="error"
                          variant="outline"
                          icon="i-lucide-ban"
                          :label="t('agreement.claims.cancel_reconcile')"
                          :loading="isCancellingReconcile"
                          :disabled="isCancellingReconcile || isReconcileActionPending"
                          @click="cancelReconciliation" />
                        <UButton
                          v-if="canUpdateReconcileRole"
                          data-help-target="casework.claims.detail.claims-reconcile-all-amounts"
                          type="button"
                          icon="i-lucide-list-checks"
                          :label="t('agreement.claims.reconcile_all_amounts')"
                          :loading="reconciliationWrite.kind === 'bulk'"
                          :disabled="isReconcileMutationPending || isReconcileActionPending || isReconcileLineModalOpen"
                          @click="reconcileAllAmounts" />
                      </div>
                    </div>
                    <div class="rounded-sm border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                      <UCheckbox
                        data-ui-target="agreements.claims.claims.mark_reconcile_final"
                        :model-value="reconcileFinalCheckboxValue"
                        :label="t('agreement.claims.mark_reconcile_final')"
                        :description="t('agreement.claims.mark_reconcile_final_description')"
                        :disabled="!canEditActiveReconcileFinal"
                        @update:model-value="setActiveReconcileFinal" />
                      <p v-if="otherFinalReconcile && !activeReconcileIsFinal" class="mt-2 text-sm text-amber-700 dark:text-amber-300">
                        {{ t('agreement.claims.final_reconcile_exists', { id: otherFinalReconcile.id }) }}
                      </p>
                    </div>
                    <CommonErrorNotice
                      v-if="selectedReconcileReadError"
                      :title="t('common.resource_table_load_failed')"
                      :description="t('common.resource_table_load_failed_description')">
                      <template #actions>
                        <UButton type="button" :label="t('common.retry')" @click="loadSelectedReconcileDetail()" />
                      </template>
                    </CommonErrorNotice>
                    <AgreementClaimReconciliationLinesTable
                      v-if="profile.egcs_fc_currency"
                      :currency="profile.egcs_fc_currency"
                      :lines="reconciliationTableLines"
                      :hide-cost-category="overview?.budgetManagement?.egcs_tp_hidecostcategory"
                      :hide-cost-subsection="overview?.budgetManagement?.egcs_tp_hidecostsubsection"
                      :total-submitted="totalSubmitted"
                      :total-reconciled="totalReconciled"
                      :total-sampled="totalSampled"
                      edit-mode="action"
                      :action-pending="isReconcileLineActionPending"
                      @edit="openReconcileLineEditor" />
                  </div>
                </CommonSection>

                <CommonSection v-if="activeReconcile" :title="t('agreement.claims.workflow.title')" badge="03" :grid-cols="1">
                  <div class="space-y-8">
                    <CommonNotice
                      v-if="activeReconcile.egcs_fc_isfinal && canUpdateReconcile"
                      tone="warning"
                      icon="i-lucide-triangle-alert"
                      :title="t('agreement.claims.final_reconcile_warning_title')"
                      :description="t('agreement.claims.final_reconcile_warning_description')" />

                    <CommonCompletionSection
                      v-if="showReconcileCompletion"
                      :key="`reconcile-completion:${activeReconcile.id}`"
                      entity-type="fundingclaimreconcile"
                      :entity-id="String(activeReconcile.id)"
                      :is-locked="!canUpdateReconcile" :show-header="false"
                      :action-role-allowed="canUpdateReconcileRole"
                      :action-prerequisite-warning="reconcileEditPrerequisiteWarning"
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
                      :mutation-role-allowed="canUpdateReconcileRole"
                      entity-type="fundingclaimreconcile"
                      :entity-id="String(activeReconcile.id)"
                      purpose="approval_submission"
                      :can-edit="canWorkReconcileWorkflow"
                      :action-role-allowed="canUpdateReconcileRole"
                      :action-prerequisite-warning="reconcileWorkflowPrerequisiteWarning"
                      :refresh-key="approvalsRefreshKey"
                      @changed="refreshReconcileWorkspace" />
                  </div>
                </CommonSection>
                <div v-else class="text-sm text-zinc-500 dark:text-zinc-400">
                  {{ t('agreement.claims.no_reconciliations') }}
                </div>
              </div>
            </div>

            <CommonAssignedUsers
              v-else-if="selectedClaimTab === 'assignments'"
              data-help-view="casework.claims.assignments"
              :show-header="false"
              entity-type="fundingcaseagreementclaim"
              :entity-id="claimId"
              @changed="submissionReview.refresh" />

            <CommonAttachmentsTab
              v-else-if="selectedClaimTab === 'attachments'"
              data-help-view="casework.claims.attachments"
              entity-type="fundingcaseagreementclaim"
              :entity-id="claimId" />

            <ExtensionEntityTabPanel
              v-else-if="selectedExtensionTab"
              :item="selectedExtensionTab" />
          </CommonDetailWorkspace>
        </div>
      </template>
    </CommonDetailPage>

    <UModal
      v-if="selectedSubmissionLine"
      v-model:open="isSubmissionModalOpen"
      data-help-view="casework.claims.detail.is-submission-modal-open" data-field-scope="agreements.claims" data-scope-label-en="Agreements > Claims > Submission > Budget line" data-scope-label-fr="Ententes > Demandes de remboursement > Présentation > Ligne budgétaire"
      :title="t('agreement.claims.edit_submitted_amount')"
      :description="locale === 'fr' ? selectedSubmissionLine.lineItemNameFr : selectedSubmissionLine.lineItemNameEn"
      :dismissible="!isSavingSubmission">
      <template #body>
        <UForm v-bind="submissionFormSession" data-testid="claim-submission-form" :state="selectedSubmissionLine" :validate="validateSubmissionAmount" class="space-y-4">
          <UFormField :label="t('agreement.claims.submitted_amount')" name="egcs_fc_amount" required>
            <CommonCurrencyInput
              v-model="selectedSubmissionLine.egcs_fc_amount"
              :currency="profile?.egcs_fc_currency"
              required
              aria-required="true"
              :aria-label="t('agreement.claims.submitted_amount_for', { name: locale === 'fr' ? selectedSubmissionLine.lineItemNameFr : selectedSubmissionLine.lineItemNameEn })"
              :disabled="isLoadingDetail || isSavingSubmission"
              class="w-full" />
          </UFormField>
          <UFormField v-if="needsSubmissionEditComment" :label="t('submission.edit_comment')" name="editComment" data-ui-target="agreements.claims.submission.edit-comment" required>
            <UTextarea v-model="selectedSubmissionLine.editComment" class="w-full" :maxlength="SUBMISSION_EDIT_COMMENT_MAX_LENGTH" required aria-required="true" :disabled="isSavingSubmission" />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton data-help-target="casework.claims.detail.is-submission-modal-open.common-cancel" type="button" color="neutral" variant="ghost" :label="t('common.cancel')" :disabled="isLoadingDetail || isSavingSubmission" @click="submissionModal.close" />
            <CommonSaveButton data-help-target="casework.claims.detail.is-submission-modal-open.common-save" type="submit" :label="t('common.save')" :loading="isSavingSubmission" :disabled="isLoadingDetail || isSavingSubmission" />
          </div>
        </UForm>
      </template>
    </UModal>

    <UModal
      v-if="selectedReconcileLine"
      v-model:open="isReconcileLineModalOpen"
      data-help-view="casework.claims.detail.is-reconcile-line-modal-open"
      :title="t('agreement.claims.reconcile_line_details')"
      :description="selectedReconcileLine.name"
      :ui="{ content: 'sm:max-w-2xl' }">
      <template #body>
        <UForm
          v-bind="reconcileLineFormSession"
          data-testid="reconcile-line-form"
          :state="selectedReconcileLine"
          :validate="validateReconcileLine"
          class="space-y-5">
          <p v-if="selectedReconcileLine.description && selectedReconcileLine.description !== selectedReconcileLine.name" class="text-sm text-muted">
            {{ selectedReconcileLine.description }}
          </p>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField data-ui-target="agreements.claims.claims.submitted_amount" :label="t('agreement.claims.submitted_amount')">
              <div class="w-full rounded-md bg-muted px-3 py-2">
                {{ formatMoney(selectedReconcileLine.submittedAmount) }}
              </div>
            </UFormField>
            <UFormField data-ui-target="agreements.claims.claims.balance" :label="t('agreement.claims.balance')">
              <div class="w-full rounded-md bg-muted px-3 py-2">
                {{ formatMoney(selectedReconcileLineBalance) }}
              </div>
            </UFormField>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField data-ui-target="agreements.claims.claims.reconciled_amount" :label="t('agreement.claims.reconciled_amount')" name="egcs_fc_reconciled" required>
              <CommonCurrencyInput
                v-model="selectedReconcileLine.egcs_fc_reconciled"
                :currency="profile?.egcs_fc_currency"
                :disabled="!selectedReconcileLine.editable || isSavingReconcileLine"
                required
                aria-required="true"
                class="w-full" />
            </UFormField>
            <UFormField data-ui-target="agreements.claims.claims.sampled_amount" :label="t('agreement.claims.sampled_amount')" name="egcs_fc_sampled">
              <CommonCurrencyInput
                v-model="selectedReconcileLine.egcs_fc_sampled"
                :currency="profile?.egcs_fc_currency"
                :disabled="!selectedReconcileLine.editable || isSavingReconcileLine"
                class="w-full" />
            </UFormField>
          </div>

          <UFormField data-ui-target="agreements.claims.claims.rationale" :label="t('agreement.claims.rationale')" name="egcs_fc_rationale">
            <CommonTextarea
              v-model="selectedReconcileLine.egcs_fc_rationale"
              :rows="6"
              :placeholder="t('agreement.claims.rationale_for', { name: selectedReconcileLine.name })"
              :readonly="!selectedReconcileLine.editable"
              :disabled="isSavingReconcileLine"
              class="w-full" />
          </UFormField>

          <div class="flex justify-end gap-2 pt-2">
            <UButton
              data-help-target="casework.claims.detail.is-reconcile-line-modal-open.common-cancel"
              type="button"
              color="neutral"
              variant="ghost"
              :label="t('common.cancel')"
              :disabled="isSavingReconcileLine"
              @click="reconcileLineModal.close" />
            <CommonSaveButton
              v-if="selectedReconcileLine.editable"
              data-help-target="casework.claims.detail.is-reconcile-line-modal-open.common-save"
              type="submit"
              :label="t('common.save')"
              :loading="isSavingReconcileLine"
              :disabled="isReconcileMutationPending || isReconcileActionPending" />
          </div>
        </UForm>
      </template>
    </UModal>
    <UModal v-if="fundingDraft && profile?.egcs_fc_currency" v-model:open="fundingEditorOpen" data-help-view="casework.claims.detail.funding-editor-open" data-field-scope="agreements.claims" data-scope-label-en="Agreements > Claims > Submission > Funding sources" data-scope-label-fr="Ententes > Demandes de remboursement > Présentation > Sources de financement" :title="t(fundingDraft.mode === 'clear' ? 'agreement.funding_sources.clear' : 'agreement.funding_sources.edit_line')" :ui="{ content: 'sm:max-w-2xl' }">
      <template #body>
        <div class="space-y-4">
          <p v-if="fundingDraft.mode === 'clear'">
            {{ t('agreement.funding_sources.clear_description') }}
          </p>
          <template v-else>
            <UFormField data-ui-target="agreements.claims.funding-source.program-amount" :label="t('agreement.claims.submitted_amount')" name="egcs_fc_amount" required>
              <CommonCurrencyInput v-model="fundingDraft.programAmount" :currency="profile?.egcs_fc_currency" :disabled="isSavingFunding" required aria-required="true" class="w-full" />
            </UFormField>
            <UFormField v-if="claimFundingMode === 'manual'" :label="t('agreement.funding_sources.total_cost')" name="egcs_fc_totalamount" required>
              <CommonCurrencyInput v-model="fundingDraft.totalAmount" :currency="profile?.egcs_fc_currency" :disabled="isSavingFunding" required aria-required="true" class="w-full" />
            </UFormField>
            <AgreementFundingSourcesEditor v-if="claimFundingMode !== 'program_only'" v-model="fundingDraft.sources" :disabled="isSavingFunding" data-field-container="Composite editor; its individual field declarations own their identities." :agreement-id="agreementId" :currency="profile.egcs_fc_currency" :identity="`${fundingDraft.line.id}:${fundingEditor.captureSession()}`" />
            <dl v-if="claimFundingMode === 'automatic'" class="flex flex-wrap gap-x-2">
              <dt>{{ t('agreement.funding_sources.total_cost') }}</dt>
              <dd>{{ automaticClaimTotal ? formatMoney(automaticClaimTotal) : t('common.unavailable') }}</dd>
            </dl>
          </template>
          <UFormField v-if="needsSubmissionEditComment" :label="t('submission.edit_comment')" name="editComment" data-ui-target="agreements.claims.funding-source.edit-comment" required>
            <UTextarea v-model="fundingDraft.comment" class="w-full" :maxlength="SUBMISSION_EDIT_COMMENT_MAX_LENGTH" required aria-required="true" :disabled="isSavingFunding" />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton data-help-target="casework.claims.detail.funding-editor-open.common-cancel" color="neutral" variant="ghost" :label="t('common.cancel')" @click="fundingEditorOpen = false" />
            <UButton v-if="fundingDraft.mode === 'clear'" color="error" :label="t('agreement.funding_sources.clear')" :loading="isSavingFunding" :disabled="isLoadingDetail || isSavingFunding || (needsSubmissionEditComment && !fundingDraft.comment.trim())" @click="saveFundingEditor" />
            <CommonSaveButton v-else data-help-target="casework.claims.detail.funding-editor-open.funding-sources-save" :label="t('agreement.funding_sources.save')" :loading="isSavingFunding" :disabled="isLoadingDetail || isSavingFunding || (needsSubmissionEditComment && !fundingDraft.comment.trim())" @click="saveFundingEditor" />
          </div>
        </div>
      </template>
    </UModal>
    <AccountReceivableCreateModal v-if="receivableEntry.entry.value" v-model:open="receivableEntry.open.value" :agreement-id="agreementId" :source-entry="receivableEntry.entry.value" @created="receivableEntry.created" />
  </div>
</template>
