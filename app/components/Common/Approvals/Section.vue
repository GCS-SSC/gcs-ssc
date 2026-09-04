<script setup lang="ts">
/* eslint-disable jsdoc/require-param-description, jsdoc/require-returns -- legacy approval helpers remain concise during request hardening */
/* eslint-disable @stylistic/comma-dangle -- generic Vue arrows need parser-disambiguating commas */
import { getGroupedRowModel } from '@tanstack/vue-table'
import type { ExpandedState } from '@tanstack/vue-table'
import type { FetchError } from 'ofetch'
import { nanoid } from 'nanoid'
import { computed, nextTick, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import type { ListResponse, UserOptionItem } from '~~/shared/types/admin'
import type {
  AddApprovalStepInput,
  ReviewApprovalApproveInput,
  ReviewApprovalDenyInput,
  ReviewApprovalReassignInput
} from '~~/shared/types/schemas/review-approval'
import CommonApprovalsActionModal from '~/components/Common/Approvals/ActionModal.vue'
import CommonApprovalsAddStepModal from '~/components/Common/Approvals/AddStepModal.vue'
import CommonApprovalsReassignModal from '~/components/Common/Approvals/ReassignModal.vue'
import CommonApprovalsViewPopover from '~/components/Common/Approvals/ViewPopover.vue'
import type {
  ApprovalLookupBehalfType,
  AddApprovalModalState,
  AddApprovalPosition,
  ApprovalRuntimeResponse,
  ApprovalRoutingSlipItem,
  ApprovalStepItem,
  ApprovalTableRow,
  ActionModalState,
  GroupedApprovalRow,
  ReassignModalState
} from './types'

const ROUTING_SLIP_GROUP_COLUMN_ID = 'routingSlipGroup'

const {
  entityType,
  entityId,
  hideTitle = false,
  routingSlipId
} = defineProps<{
  entityType: AddApprovalStepInput['entityType']
  entityId: string
  hideTitle?: boolean
  routingSlipId?: string | number | null
}>()
const emit = defineEmits<{
  changed: []
}>()

const { t } = useI18n()
const { getGroupedDisclosureControlsId, getGroupedDisclosureContentId } = useGroupedDisclosureIds()
const { formatDate } = useDateHelpers()
const toast = useToast()
const { showError } = useApiErrorToast()
const { saveJson } = useJsonRequest()
const runtimeQuery = computed(() => ({
  entityType,
  entityId
}))

/**
 *
 */
const emptyListResponse = <T,>(): ListResponse<T> => ({
  items: [],
  total: 0,
  stats: {
    total: 0,
    active: 0
  },
  page: 1,
  limit: 25
})

const {
  data: approvalResponse,
  refresh: refreshApprovals,
  status: approvalStatus
} = useFetch<ApprovalRuntimeResponse, FetchError, string>('/api/approvals/runtime', {
  query: runtimeQuery
})

const canManage = computed(() => approvalResponse.value?.can_manage === true)

const {
  data: userLookupResponse,
  refresh: refreshUserLookup
} = useFetch<ListResponse<UserOptionItem>, FetchError, string>('/api/approvals/lookups/users', {
  query: runtimeQuery,
  default: () => emptyListResponse<UserOptionItem>(),
  immediate: false
})

const {
  data: behalfTypeResponse
} = useFetch<ListResponse<ApprovalLookupBehalfType>, FetchError, string>('/api/approvals/lookups/behalf-types', {
  query: runtimeQuery,
  default: () => emptyListResponse<ApprovalLookupBehalfType>()
})

const search: Ref<string> = ref('')
const pagination: Ref<{ pageIndex: number, pageSize: number }> = ref({
  pageIndex: 0,
  pageSize: 10
})
const expandedRows: Ref<ExpandedState> = ref({})
const grouping: Ref<string[]> = ref([ROUTING_SLIP_GROUP_COLUMN_ID])
const columnVisibility: Ref<Record<string, boolean>> = ref({
  [ROUTING_SLIP_GROUP_COLUMN_ID]: false
})
const isActionModalOpen: Ref<boolean> = ref(false)
const isReassignModalOpen: Ref<boolean> = ref(false)
const isAddStepModalOpen: Ref<boolean> = ref(false)
const selectedActionStep: Ref<ApprovalStepItem | null> = ref(null)
const selectedActionState: Ref<ActionModalState | null> = ref(null)
const selectedReassignStep: Ref<ApprovalStepItem | null> = ref(null)
const selectedReassignState: Ref<ReassignModalState | null> = ref(null)
const selectedAddStep: Ref<ApprovalStepItem | null> = ref(null)
const selectedAddStepRoutingSlip: Ref<ApprovalRoutingSlipItem | null> = ref(null)
const selectedAddStepState: Ref<AddApprovalModalState | null> = ref(null)
const isSubmittingAction: Ref<boolean> = ref(false)
const isSubmittingReassign: Ref<boolean> = ref(false)
const isSubmittingAddStep: Ref<boolean> = ref(false)
const entityIdentity = computed(() => `${entityType}:${entityId}`)
let entityGeneration = 0

const columns: TableColumnInput<ApprovalTableRow>[] = [
  { id: ROUTING_SLIP_GROUP_COLUMN_ID, accessorKey: ROUTING_SLIP_GROUP_COLUMN_ID, headerKey: 'assessment.approvals.routing_slip' },
  { id: 'name', accessorKey: 'stepNameEn', headerKey: 'common.name' },
  { id: 'assignedApprover', accessorKey: 'assignedApproverLabel', headerKey: 'assessment.approvals.assigned_approver' },
  { id: 'status', accessorKey: 'routingSlipRuntimeState', headerKey: 'common.status' },
  { id: 'actions', headerKey: 'common.actions' }
]

const bilingualColumns: BilingualColumnConfig<ApprovalTableRow>[] = [
  {
    id: 'name',
    accessorKey: {
      en: 'stepNameEn',
      fr: 'stepNameFr'
    },
    headerKey: 'common.name'
  }
]

const groupingOptions = {
  getGroupedRowModel: getGroupedRowModel()
}
const expandedOptions = { autoResetExpanded: false }

const shouldRenderSection = computed(() => approvalResponse.value?.mode === 'runtime')

const routingSlips = computed<ApprovalRoutingSlipItem[]>(() => {
  const response = approvalResponse.value
  if (!response) {
    return []
  }

  const slips = response.routingSlips ?? []
  if (routingSlipId === undefined || routingSlipId === null) return slips
  return slips.filter(slip => String(slip.id) === String(routingSlipId))
})

const userOptions = computed(() => (userLookupResponse.value?.items ?? []).map(user => ({
  id: user.id,
  name: `${user.id}: ${user.name}`
})))

const selectedReassignUserOptions = computed(() => {
  const options = userOptions.value.slice()
  const step = selectedReassignStep.value

  if (!step) {
    return options
  }

  const selectedUserId = step.egcs_cn_assigneduser ?? step.egcs_cn_defaultuser
  const selectedUserName = step.assigned_user_name || step.default_user_name
  const hasSelectedUser = options.some(user => user.id === selectedUserId)

  if (!hasSelectedUser) {
    options.unshift({
      id: selectedUserId,
      name: `${selectedUserId}: ${selectedUserName}`
    })
  }

  return options
})

const behalfTypeOptions = computed(() => behalfTypeResponse.value?.items ?? [])

const tableRows = computed<ApprovalTableRow[]>(() => routingSlips.value.flatMap((routingSlip: ApprovalRoutingSlipItem) => {
  if (routingSlip.steps.length === 0) {
    const emptyRows: ApprovalTableRow[] = [{
      id: `empty:${routingSlip.id}`,
      routingSlipGroup: String(routingSlip.id),
      routingSlipId: String(routingSlip.id),
      routingSlipNameEn: routingSlip.egcs_cn_name_en,
      routingSlipNameFr: routingSlip.egcs_cn_name_fr,
      routingSlipRuntimeState: routingSlip.runtimeState,
      routingSlipIsCurrent: routingSlip.is_current,
      routingSlipIsPreview: routingSlip.is_preview,
      rowKind: 'empty',
      stepId: '',
      stepRuntimeItemId: '',
      stepRuntimeState: routingSlip.runtimeState,
      stepDisplayOrder: 0,
      stepNameEn: '',
      stepNameFr: '',
      assignedApproverLabel: '',
      sequence: 0,
      egcs_cn_defaultuser: '',
      egcs_cn_assigneduser: null,
      egcs_cn_onbehalf: null,
      egcs_cn_approvalpositiontitle: '',
      egcs_cn_approvalvalue: null,
      egcs_cn_approvaldate: null,
      egcs_cn_comment: '',
      default_user_name: '',
      default_user_position_title: '',
      assigned_user_name: '',
      assigned_user_position_title: '',
      onbehalf_name_en: '',
      onbehalf_name_fr: '',
      onbehalf_require_actual: false,
      is_current: false,
      can_action: false,
      can_reassign: false,
      can_add_before: false,
      can_add_after: false,
      certifications: []
    }]

    return emptyRows
  }

  const stepRows: ApprovalTableRow[] = routingSlip.steps.map((step: ApprovalStepItem) => ({
    id: step.id || `${routingSlip.id}:${step.display_order}`,
    routingSlipGroup: String(routingSlip.id),
    routingSlipId: String(routingSlip.id),
    routingSlipNameEn: routingSlip.egcs_cn_name_en,
    routingSlipNameFr: routingSlip.egcs_cn_name_fr,
    routingSlipRuntimeState: routingSlip.runtimeState,
    routingSlipIsCurrent: routingSlip.is_current,
    routingSlipIsPreview: routingSlip.is_preview,
    rowKind: 'step',
    stepId: step.id,
    stepRuntimeItemId: step.runtimeItemId,
    stepRuntimeState: step.runtimeState,
    stepDisplayOrder: step.display_order,
    stepNameEn: step.egcs_cn_name_en,
    stepNameFr: step.egcs_cn_name_fr,
    assignedApproverLabel: step.assigned_user_name || step.default_user_name,
    sequence: step.sequence,
    egcs_cn_defaultuser: step.egcs_cn_defaultuser,
    egcs_cn_assigneduser: step.egcs_cn_assigneduser,
    egcs_cn_onbehalf: step.egcs_cn_onbehalf,
    egcs_cn_approvalpositiontitle: step.egcs_cn_approvalpositiontitle,
    egcs_cn_approvalvalue: step.egcs_cn_approvalvalue,
    egcs_cn_approvaldate: step.egcs_cn_approvaldate,
    egcs_cn_comment: step.egcs_cn_comment,
    default_user_name: step.default_user_name,
    default_user_position_title: step.default_user_position_title,
    assigned_user_name: step.assigned_user_name,
    assigned_user_position_title: step.assigned_user_position_title,
    onbehalf_name_en: step.onbehalf_name_en,
    onbehalf_name_fr: step.onbehalf_name_fr,
    onbehalf_require_actual: step.onbehalf_require_actual,
    is_current: step.is_current,
    can_action: step.can_action,
    can_reassign: step.can_reassign,
    can_add_before: step.can_add_before,
    can_add_after: step.can_add_after,
    certifications: step.certifications
  }))

  return stepRows
}))

const filteredRows = computed(() => {
  const searchTerm = search.value.trim().toLocaleLowerCase()
  if (!searchTerm) {
    return tableRows.value
  }

  return tableRows.value.filter(row => [
    row.routingSlipNameEn,
    row.routingSlipNameFr,
    row.stepNameEn,
    row.stepNameFr,
    row.default_user_name,
    row.assigned_user_name,
    row.egcs_cn_comment
  ].some(value => value.toLocaleLowerCase().includes(searchTerm)))
})

const filteredTotalRecords = computed(() => new Set(filteredRows.value.map(row => row.routingSlipId)).size)

const getRoutingSlipGroupRowId = (routingSlipId: string) => `${ROUTING_SLIP_GROUP_COLUMN_ID}:${routingSlipId}`
/**
 *
 */
const getExpandedRowRecord = () => (
  typeof expandedRows.value === 'object' && expandedRows.value !== null
    ? expandedRows.value
    : {}
)
/**
 *
 * @param value
 * @param baseExpandedRows
 */
const buildExpandedRowsForRoutingSlips = (
  value: Array<{ id: string; is_current: boolean; runtimeState: ApprovalRoutingSlipItem['runtimeState'] }>,
  baseExpandedRows: Record<string, boolean>
) => {
  const nextExpandedRows: Record<string, boolean> = {}

  for (const routingSlip of value) {
    const rowId = getRoutingSlipGroupRowId(String(routingSlip.id))
    nextExpandedRows[rowId] = baseExpandedRows[rowId] ?? (
      routingSlip.is_current && ['active', 'awaiting_action'].includes(routingSlip.runtimeState)
    )
  }

  return nextExpandedRows
}
/**
 *
 */
const refreshApprovalsPreservingExpandedRows = async () => {
  const preservedExpandedRows = getExpandedRowRecord()

  await refreshApprovals()
  await nextTick()

  if (routingSlips.value.length === 0) {
    expandedRows.value = preservedExpandedRows
    return
  }

  expandedRows.value = buildExpandedRowsForRoutingSlips(routingSlips.value, preservedExpandedRows)
}

watch(routingSlips, value => {
  if (value.length === 0) {
    return
  }

  expandedRows.value = buildExpandedRowsForRoutingSlips(value, getExpandedRowRecord())
}, { immediate: true })

watch([canManage, approvalStatus], async ([value, currentStatus]) => {
  if (!value || currentStatus !== 'success') {
    return
  }

  await refreshUserLookup()
}, { immediate: true })

/**
 *
 * @param row
 */
const getStepStatus = (row: ApprovalTableRow) => row.stepRuntimeState

const isActionedStep = (row: ApprovalTableRow) => row.egcs_cn_approvalvalue !== null
const getApprovalActorName = (row: ApprovalTableRow) => row.assigned_user_name || row.default_user_name
const hasApprovalDecisionDetails = (row: ApprovalTableRow) => row.egcs_cn_approvalvalue !== null && Boolean(row.egcs_cn_approvaldate)
/**
 *
 * @param row
 */
const getApprovalDecisionActorLine = (row: ApprovalTableRow) => {
  if (row.egcs_cn_approvalvalue === null || !row.egcs_cn_approvaldate) {
    return ''
  }

  if (row.egcs_cn_approvalvalue === true) {
    return t('assessment.approvals.approved_by', {
      name: getApprovalActorName(row)
    })
  }

  return t('assessment.approvals.denied_by', {
    name: getApprovalActorName(row)
  })
}

/**
 *
 * @param row
 */
const getApprovalDecisionDateLine = (row: ApprovalTableRow) => {
  if (row.egcs_cn_approvalvalue === null || !row.egcs_cn_approvaldate) {
    return ''
  }

  if (row.egcs_cn_approvalvalue === true) {
    return t('assessment.approvals.approved_on', {
      date: formatDate(row.egcs_cn_approvaldate)
    })
  }

  return t('assessment.approvals.denied_on', {
    date: formatDate(row.egcs_cn_approvaldate)
  })
}

const isGroupedRow = (row: GroupedApprovalRow) => row.getIsGrouped?.() === true
const isRoutingSlipGroupRow = (row: GroupedApprovalRow) => (
  isGroupedRow(row) && row.groupingColumnId === ROUTING_SLIP_GROUP_COLUMN_ID
)
const getGroupedRowCount = (row: GroupedApprovalRow) => row.leafRows?.length ?? row.subRows?.length ?? 0

const updateExpandedRows = (value: ExpandedState) => {
  expandedRows.value = value
}

/**
 * Copies an actionable approval step and its certification values into the decision modal.
 * @param row
 */
const openActionModal = (row: ApprovalTableRow) => {
  if (row.rowKind !== 'step' || isSubmittingAction.value) {
    return
  }

  selectedActionStep.value = {
    id: row.stepId,
    runtimeItemId: row.stepRuntimeItemId,
    runtimeState: row.stepRuntimeState,
    sequence: row.sequence,
    display_order: row.stepDisplayOrder,
    egcs_cn_name_en: row.stepNameEn,
    egcs_cn_name_fr: row.stepNameFr,
    egcs_cn_defaultuser: row.egcs_cn_defaultuser,
    egcs_cn_assigneduser: row.egcs_cn_assigneduser,
    egcs_cn_onbehalf: row.egcs_cn_onbehalf,
    egcs_cn_approvalpositiontitle: row.egcs_cn_approvalpositiontitle,
    egcs_cn_approvalvalue: row.egcs_cn_approvalvalue,
    egcs_cn_approvaldate: row.egcs_cn_approvaldate,
    egcs_cn_comment: row.egcs_cn_comment,
    default_user_name: row.default_user_name,
    default_user_position_title: row.default_user_position_title,
    assigned_user_name: row.assigned_user_name,
    assigned_user_position_title: row.assigned_user_position_title,
    onbehalf_name_en: row.onbehalf_name_en,
    onbehalf_name_fr: row.onbehalf_name_fr,
    onbehalf_require_actual: row.onbehalf_require_actual,
    is_current: row.is_current,
    can_action: row.can_action,
    can_reassign: row.can_reassign,
    can_add_before: row.can_add_before,
    can_add_after: row.can_add_after,
    certifications: row.certifications
  }
  selectedActionState.value = {
    approvalId: row.stepId,
    assignedDiffersFromDefault: row.egcs_cn_assigneduser !== row.egcs_cn_defaultuser,
    isOnBehalf: row.egcs_cn_assigneduser !== row.egcs_cn_defaultuser || Boolean(row.egcs_cn_onbehalf),
    egcs_cn_onbehalf: row.egcs_cn_onbehalf,
    egcs_cn_approvalpositiontitle: row.egcs_cn_approvalpositiontitle || row.assigned_user_position_title || row.default_user_position_title,
    egcs_cn_approvaldate: row.egcs_cn_approvaldate ? row.egcs_cn_approvaldate.slice(0, 10) : '',
    egcs_cn_comment: row.egcs_cn_comment ?? '',
    certifications: row.certifications.map(certification => ({
      id: certification.id,
      egcs_cn_optional: certification.egcs_cn_optional,
      egcs_cn_value: certification.egcs_cn_value === true,
      egcs_cn_certification_en: certification.egcs_cn_certification_en,
      egcs_cn_certification_fr: certification.egcs_cn_certification_fr
    }))
  }
  isActionModalOpen.value = true
}

/**
 * Closes and clears the approval draft unless a submission is pending.
 * @param force Whether a completed submission may force the modal closed.
 */
const closeActionModal = (force = false) => {
  if (isSubmittingAction.value && !force) {
    return
  }

  isActionModalOpen.value = false
  selectedActionStep.value = null
  selectedActionState.value = null
}

/**
 * Applies modal open-state requests without discarding a pending draft.
 * @param open Requested modal state.
 */
const handleActionModalOpenUpdate = (open: boolean) => {
  if (!open) {
    if (isActionModalOpen.value) {
      closeActionModal()
    }
    return
  }

  if (isSubmittingAction.value) {
    return
  }

  isActionModalOpen.value = true
}

/**
 * Copies an approval step's current assignee and on-behalf setting into the reassign modal.
 * @param row
 */
const openReassignModal = (row: ApprovalTableRow) => {
  if (row.rowKind !== 'step') {
    return
  }

  selectedReassignStep.value = {
    id: row.stepId,
    runtimeItemId: row.stepRuntimeItemId,
    runtimeState: row.stepRuntimeState,
    sequence: row.sequence,
    display_order: row.stepDisplayOrder,
    egcs_cn_name_en: row.stepNameEn,
    egcs_cn_name_fr: row.stepNameFr,
    egcs_cn_defaultuser: row.egcs_cn_defaultuser,
    egcs_cn_assigneduser: row.egcs_cn_assigneduser,
    egcs_cn_onbehalf: row.egcs_cn_onbehalf,
    egcs_cn_approvalpositiontitle: row.egcs_cn_approvalpositiontitle,
    egcs_cn_approvalvalue: row.egcs_cn_approvalvalue,
    egcs_cn_approvaldate: row.egcs_cn_approvaldate,
    egcs_cn_comment: row.egcs_cn_comment,
    default_user_name: row.default_user_name,
    default_user_position_title: row.default_user_position_title,
    assigned_user_name: row.assigned_user_name,
    assigned_user_position_title: row.assigned_user_position_title,
    onbehalf_name_en: row.onbehalf_name_en,
    onbehalf_name_fr: row.onbehalf_name_fr,
    onbehalf_require_actual: row.onbehalf_require_actual,
    is_current: row.is_current,
    can_action: row.can_action,
    can_reassign: row.can_reassign,
    can_add_before: row.can_add_before,
    can_add_after: row.can_add_after,
    certifications: row.certifications
  }
  selectedReassignState.value = {
    approvalId: row.stepId,
    egcs_cn_assigneduser: row.egcs_cn_assigneduser ?? row.egcs_cn_defaultuser,
    egcs_cn_onbehalf: row.egcs_cn_onbehalf
  }
  isReassignModalOpen.value = true
}

/**
 *
 */
const closeReassignModal = () => {
  isReassignModalOpen.value = false
  selectedReassignStep.value = null
  selectedReassignState.value = null
}

/** Opens a policy-prefilled additional approval draft at the selected anchor.
 * @param row
 * @param position
 */
const openAddStepModal = (row: ApprovalTableRow, position: AddApprovalPosition) => {
  if (
    row.rowKind !== 'step'
    || isSubmittingAddStep.value
    || (position === 'before' ? !row.can_add_before : !row.can_add_after)
  ) {
    return
  }

  const routingSlip = routingSlips.value.find(item => String(item.id) === row.routingSlipId)
  if (!routingSlip) {
    return
  }

  selectedAddStep.value = {
    id: row.stepId,
    runtimeItemId: row.stepRuntimeItemId,
    runtimeState: row.stepRuntimeState,
    sequence: row.sequence,
    display_order: row.stepDisplayOrder,
    egcs_cn_name_en: row.stepNameEn,
    egcs_cn_name_fr: row.stepNameFr,
    egcs_cn_defaultuser: row.egcs_cn_defaultuser,
    egcs_cn_assigneduser: row.egcs_cn_assigneduser,
    egcs_cn_onbehalf: row.egcs_cn_onbehalf,
    egcs_cn_approvalpositiontitle: row.egcs_cn_approvalpositiontitle,
    egcs_cn_approvalvalue: row.egcs_cn_approvalvalue,
    egcs_cn_approvaldate: row.egcs_cn_approvaldate,
    egcs_cn_comment: row.egcs_cn_comment,
    default_user_name: row.default_user_name,
    default_user_position_title: row.default_user_position_title,
    assigned_user_name: row.assigned_user_name,
    assigned_user_position_title: row.assigned_user_position_title,
    onbehalf_name_en: row.onbehalf_name_en,
    onbehalf_name_fr: row.onbehalf_name_fr,
    onbehalf_require_actual: row.onbehalf_require_actual,
    is_current: row.is_current,
    can_action: row.can_action,
    can_reassign: row.can_reassign,
    can_add_before: row.can_add_before,
    can_add_after: row.can_add_after,
    certifications: row.certifications
  }
  selectedAddStepRoutingSlip.value = routingSlip
  selectedAddStepState.value = {
    anchorApprovalId: row.stepId,
    position,
    egcs_cn_assigneduser: '',
    egcs_cn_name_en: routingSlip.default_added_approval_name_en,
    egcs_cn_name_fr: routingSlip.default_added_approval_name_fr,
    certifications: (routingSlip.additional_approval_certifications ?? [])
      .toSorted((left, right) => left.egcs_cn_order - right.egcs_cn_order)
      .map((certification, index) => ({
        ...certification,
        egcs_cn_order: index + 1,
        _key: nanoid()
      }))
  }
  isAddStepModalOpen.value = true
}

/** Clears the additional approval draft unless submission is still pending.
 * @param force
 */
const closeAddStepModal = (force = false) => {
  if (isSubmittingAddStep.value && !force) {
    return
  }

  isAddStepModalOpen.value = false
  selectedAddStep.value = null
  selectedAddStepRoutingSlip.value = null
  selectedAddStepState.value = null
}

watch(entityIdentity, () => {
  entityGeneration += 1
  isSubmittingAction.value = false
  isSubmittingReassign.value = false
  isSubmittingAddStep.value = false
  closeActionModal(true)
  closeReassignModal()
  closeAddStepModal(true)
  expandedRows.value = {}
  search.value = ''
  pagination.value.pageIndex = 0
}, { flush: 'sync' })

/** Adds a blank bilingual certification to the additional approval draft. */
const addAdditionalCertification = () => {
  if (!selectedAddStepState.value || isSubmittingAddStep.value) {
    return
  }

  selectedAddStepState.value.certifications.push({
    _key: nanoid(),
    egcs_cn_order: selectedAddStepState.value.certifications.length + 1,
    egcs_cn_description_en: '',
    egcs_cn_description_fr: '',
    egcs_cn_name_en: '',
    egcs_cn_name_fr: '',
    egcs_cn_optional: false,
    egcs_cn_certification_en: '',
    egcs_cn_certification_fr: ''
  })
}

/** Removes and renumbers a certification in the additional approval draft.
 * @param index
 */
const removeAdditionalCertification = (index: number) => {
  if (!selectedAddStepState.value || isSubmittingAddStep.value) {
    return
  }

  selectedAddStepState.value.certifications.splice(index, 1)
  selectedAddStepState.value.certifications.forEach((certification, certificationIndex) => {
    certification.egcs_cn_order = certificationIndex + 1
  })
}

/** Moves and renumbers a certification in the additional approval draft.
 * @param index
 * @param direction
 */
const moveAdditionalCertification = (index: number, direction: -1 | 1) => {
  if (!selectedAddStepState.value || isSubmittingAddStep.value) {
    return
  }

  const targetIndex = index + direction
  if (targetIndex < 0 || targetIndex >= selectedAddStepState.value.certifications.length) {
    return
  }

  const [certification] = selectedAddStepState.value.certifications.splice(index, 1)
  if (!certification) {
    return
  }
  selectedAddStepState.value.certifications.splice(targetIndex, 0, certification)
  selectedAddStepState.value.certifications.forEach((item, certificationIndex) => {
    item.egcs_cn_order = certificationIndex + 1
  })
}

/** Persists a user-defined approval step and refreshes the shared runtime table. */
const submitAddStep = async () => {
  const state = selectedAddStepState.value
  const routingSlip = selectedAddStepRoutingSlip.value
  if (!state || !routingSlip || isSubmittingAddStep.value) {
    return
  }

  const body = {
    entityType,
    entityId,
    anchorApprovalId: state.anchorApprovalId,
    position: state.position,
    egcs_cn_assigneduser: state.egcs_cn_assigneduser,
    ...(routingSlip.allow_added_approval_name_changes
      ? {
          egcs_cn_name_en: state.egcs_cn_name_en,
          egcs_cn_name_fr: state.egcs_cn_name_fr
        }
      : {}),
    ...(routingSlip.allow_added_approval_certification_changes
      ? {
          certifications: state.certifications.map(certification => ({
            egcs_cn_order: certification.egcs_cn_order,
            egcs_cn_description_en: certification.egcs_cn_description_en,
            egcs_cn_description_fr: certification.egcs_cn_description_fr,
            egcs_cn_name_en: certification.egcs_cn_name_en,
            egcs_cn_name_fr: certification.egcs_cn_name_fr,
            egcs_cn_optional: certification.egcs_cn_optional,
            egcs_cn_certification_en: certification.egcs_cn_certification_en,
            egcs_cn_certification_fr: certification.egcs_cn_certification_fr
          }))
        }
      : {})
  } satisfies AddApprovalStepInput

  try {
    const submittedGeneration = entityGeneration
    isSubmittingAddStep.value = true
    await saveJson('/api/approvals/add-step', 'POST', body)
    if (submittedGeneration !== entityGeneration) return
    emit('changed')
    closeAddStepModal(true)
    toast.add({
      title: t('common.success'),
      description: t('assessment.approvals.add_step_success'),
      color: 'success'
    })
    try {
      await refreshApprovalsPreservingExpandedRows()
    } catch (refreshError) {
      showError(refreshError)
    }
  } catch (error) {
    showError(error)
  } finally {
    isSubmittingAddStep.value = false
  }
}

/** Builds the compact per-step additional approval action menu.
 * @param row
 */
const getAddStepMenuItems = (row: ApprovalTableRow) => [
  ...(row.can_add_before
    ? [{
        label: t('assessment.approvals.add_before'),
        icon: 'i-lucide-corner-left-up',
        onSelect: () => openAddStepModal(row, 'before')
      }]
    : []),
  ...(row.can_add_after
    ? [{
        label: t('assessment.approvals.add_after'),
        icon: 'i-lucide-corner-right-down',
        onSelect: () => openAddStepModal(row, 'after')
      }]
    : [])
]

const selectedBehalfType = computed(() => behalfTypeOptions.value.find(item => item.id === selectedActionState.value?.egcs_cn_onbehalf) ?? null)
const defaultApproverDisplay = computed(() => {
  if (!selectedActionStep.value) {
    return ''
  }

  return `${selectedActionStep.value.egcs_cn_defaultuser}: ${selectedActionStep.value.default_user_name}`
})
const assignedApproverDisplay = computed(() => {
  if (!selectedActionStep.value) {
    return ''
  }

  const assignedUserId = selectedActionStep.value.egcs_cn_assigneduser ?? selectedActionStep.value.egcs_cn_defaultuser
  const assignedUserName = selectedActionStep.value.assigned_user_name || selectedActionStep.value.default_user_name
  return `${assignedUserId}: ${assignedUserName}`
})
const assignedApproverPositionTitle = computed(() => {
  if (!selectedActionStep.value) {
    return ''
  }

  return selectedActionStep.value.assigned_user_position_title || selectedActionStep.value.default_user_position_title
})
const requiresActual = computed(() => selectedActionState.value?.isOnBehalf === true && selectedBehalfType.value?.egcs_ay_require_actual === true)

const approveDisabled = computed(() => {
  if (!selectedActionState.value) {
    return true
  }

  if (selectedActionState.value.isOnBehalf && !selectedActionState.value.egcs_cn_onbehalf) {
    return true
  }

  if (requiresActual.value && (!selectedActionState.value.egcs_cn_approvalpositiontitle.trim() || !selectedActionState.value.egcs_cn_approvaldate)) {
    return true
  }

  return selectedActionState.value.certifications.some(certification => !certification.egcs_cn_optional && certification.egcs_cn_value !== true)
})

const denyDisabled = computed(() => {
  if (!selectedActionState.value) {
    return true
  }

  if (selectedActionState.value.isOnBehalf && !selectedActionState.value.egcs_cn_onbehalf) {
    return true
  }

  return requiresActual.value && (!selectedActionState.value.egcs_cn_approvalpositiontitle.trim() || !selectedActionState.value.egcs_cn_approvaldate)
})

/**
 * Submits an approval or denial with certifications, then preserves expanded routing-slip rows.
 * @param decision
 */
const submitAction = async (decision: 'approve' | 'deny') => {
  if (!selectedActionState.value || !selectedActionStep.value || isSubmittingAction.value) {
    return
  }

  if (decision === 'deny' && !selectedActionState.value.egcs_cn_comment.trim()) {
    return
  }

  const submittedApprovalId = selectedActionState.value.approvalId
  const basePayload = {
    approvalId: selectedActionState.value.approvalId,
    egcs_cn_onbehalf: selectedActionState.value.isOnBehalf ? selectedActionState.value.egcs_cn_onbehalf : null,
    egcs_cn_approvaldate: requiresActual.value
      ? (selectedActionState.value.egcs_cn_approvaldate
          ? new Date(`${selectedActionState.value.egcs_cn_approvaldate}T00:00:00.000Z`)
          : undefined)
      : undefined,
    egcs_cn_comment: selectedActionState.value.egcs_cn_comment,
    certifications: selectedActionState.value.certifications.map(certification => ({
      id: certification.id,
      egcs_cn_value: certification.egcs_cn_value
    }))
  }
  const actionPayload = requiresActual.value
    ? {
        ...basePayload,
        egcs_cn_approvalpositiontitle: selectedActionState.value.egcs_cn_approvalpositiontitle
      }
    : basePayload

  try {
    const submittedGeneration = entityGeneration
    isSubmittingAction.value = true
    if (decision === 'approve') {
      await saveJson('/api/approvals/approve', 'POST', actionPayload satisfies ReviewApprovalApproveInput)
    } else {
      await saveJson('/api/approvals/deny', 'POST', actionPayload satisfies ReviewApprovalDenyInput)
    }

    if (submittedGeneration !== entityGeneration) return
    emit('changed')
    if (selectedActionState.value?.approvalId === submittedApprovalId) {
      closeActionModal(true)
    }
    toast.add({
      title: t('common.success'),
      description: t('assessment.approvals.action_success'),
      color: 'success'
    })
    try {
      await refreshApprovalsPreservingExpandedRows()
    } catch (refreshError) {
      showError(refreshError)
    }
  } catch (error) {
    showError(error)
  } finally {
    isSubmittingAction.value = false
  }
}

/** Reassigns an approval step and clears on-behalf data when the default assignee is restored. */
const submitReassign = async () => {
  if (!selectedReassignState.value || !selectedReassignStep.value || isSubmittingReassign.value) {
    return
  }

  const assignedDiffersFromDefault = selectedReassignState.value.egcs_cn_assigneduser !== selectedReassignStep.value.egcs_cn_defaultuser

  try {
    const submittedGeneration = entityGeneration
    isSubmittingReassign.value = true
    await saveJson('/api/approvals/reassign', 'POST', {
      approvalId: selectedReassignState.value.approvalId,
      egcs_cn_assigneduser: selectedReassignState.value.egcs_cn_assigneduser,
      egcs_cn_onbehalf: assignedDiffersFromDefault ? selectedReassignState.value.egcs_cn_onbehalf : null
    } satisfies ReviewApprovalReassignInput)
    if (submittedGeneration !== entityGeneration) return
    emit('changed')
    closeReassignModal()
    toast.add({
      title: t('common.success'),
      description: t('common.updated_success'),
      color: 'success'
    })
    try {
      await refreshApprovalsPreservingExpandedRows()
    } catch (refreshError) {
      showError(refreshError)
    }
  } catch (error) {
    showError(error)
  } finally {
    isSubmittingReassign.value = false
  }
}
</script>

<template>
  <div v-if="shouldRenderSection || approvalStatus === 'pending' || approvalStatus === 'error'" class="space-y-6">
    <AssessmentSchemaSectionTitle
      v-if="!hideTitle"
      :title="t('assessment.approvals.title')"
      variant="indicator" />

    <div class="space-y-4 pl-4 md:pl-6">
      <CommonResourceLayoutCard
        v-model:search="search"
        v-model:pagination="pagination"
        :data="filteredRows"
        :columns="columns"
        :bilingual-columns="bilingualColumns"
        :grouping="grouping"
        :grouping-options="groupingOptions"
        :expanded-options="expandedOptions"
        :column-visibility="columnVisibility"
        :expanded="expandedRows"
        :total-records="filteredTotalRecords"
        :loading="approvalStatus === 'pending'"
        :request-status="approvalStatus"
        :show-button="false"
        :pagination-options="{ manualPagination: false }"
        @retry="refreshApprovals"
        @update:expanded="updateExpandedRows">
        <template #name-cell="{ row }">
          <div :id="getGroupedDisclosureContentId(row)" class="contents">
            <div v-if="isRoutingSlipGroupRow(row)" class="flex w-full items-center gap-3 py-1">
              <CommonGroupedDisclosureButton
                class="group flex min-w-0 items-center gap-3 text-left"
                :expanded="row.getIsExpanded?.() === true"
                :controls="getGroupedDisclosureControlsId(row.id)"
                :label-en="row.original.routingSlipNameEn"
                :label-fr="row.original.routingSlipNameFr"
                @toggle="row.toggleExpanded?.()">
                <UIcon
                  :name="row.getIsExpanded?.() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                  class="size-4 text-zinc-400 transition-colors group-hover:text-primary" />

                <span class="[&_p:first-child]:transition-colors group-hover:[&_p:first-child]:text-primary">
                  <CommonBilingualName
                    :name-en="row.original.routingSlipNameEn"
                    :name-fr="row.original.routingSlipNameFr" />
                </span>

                <CommonStatusBadge variant="count" size="sm" :label="String(getGroupedRowCount(row))" />
              </CommonGroupedDisclosureButton>
            </div>

            <div
              v-else-if="row.original.rowKind === 'empty'"
              class="flex items-center gap-3 py-3 pl-8 text-sm text-zinc-500 dark:text-zinc-400">
              <UIcon name="i-lucide-corner-down-right" class="size-4 text-zinc-400" />
              <span>{{ t('assessment.approvals.no_steps') }}</span>
            </div>

            <div v-else class="flex items-center gap-3 py-1 pl-8">
              <UIcon name="i-lucide-corner-down-right" class="size-4 text-zinc-400" />
              <span class="min-w-0">
                <CommonBilingualName
                  :name-en="row.original.stepNameEn"
                  :name-fr="row.original.stepNameFr" />
              </span>
            </div>
          </div>
        </template>

        <template #assignedApprover-cell="{ row }">
          <span v-if="isGroupedRow(row) || row.original.rowKind === 'empty'">&nbsp;</span>
          <div v-else class="space-y-1 py-1">
            <div class="text-sm text-zinc-700 dark:text-zinc-200">
              {{ row.original.assignedApproverLabel }}
            </div>
            <template v-if="hasApprovalDecisionDetails(row.original)">
              <div class="text-xs text-zinc-500 dark:text-zinc-400">
                {{ getApprovalDecisionActorLine(row.original) }}
              </div>
              <div class="text-xs text-zinc-500 dark:text-zinc-400">
                {{ getApprovalDecisionDateLine(row.original) }}
              </div>
            </template>
          </div>
        </template>

        <template #status-cell="{ row }">
          <CommonLifecycleBadge
            v-if="isRoutingSlipGroupRow(row)"
            engine="runtime"
            :state="row.original.routingSlipRuntimeState" />
          <CommonLifecycleBadge
            v-else-if="row.original.rowKind === 'step'"
            engine="runtime"
            :state="getStepStatus(row.original)" />
          <span v-else>&nbsp;</span>
        </template>

        <template #actions-cell="{ row }">
          <div v-if="isGroupedRow(row) || row.original.rowKind === 'empty'">
            &nbsp;
          </div>

          <div v-else class="flex justify-end gap-2">
            <CommonApprovalsViewPopover
              v-if="isActionedStep(row.original)"
              :step="{
                id: row.original.stepId,
                runtimeItemId: row.original.stepRuntimeItemId,
                runtimeState: row.original.stepRuntimeState,
                sequence: row.original.sequence,
                display_order: row.original.stepDisplayOrder,
                egcs_cn_name_en: row.original.stepNameEn,
                egcs_cn_name_fr: row.original.stepNameFr,
                egcs_cn_defaultuser: row.original.egcs_cn_defaultuser,
                egcs_cn_assigneduser: row.original.egcs_cn_assigneduser,
                egcs_cn_onbehalf: row.original.egcs_cn_onbehalf,
                egcs_cn_approvalpositiontitle: row.original.egcs_cn_approvalpositiontitle,
                egcs_cn_approvalvalue: row.original.egcs_cn_approvalvalue,
                egcs_cn_approvaldate: row.original.egcs_cn_approvaldate,
                egcs_cn_comment: row.original.egcs_cn_comment,
                default_user_name: row.original.default_user_name,
                default_user_position_title: row.original.default_user_position_title,
                assigned_user_name: row.original.assigned_user_name,
                assigned_user_position_title: row.original.assigned_user_position_title,
                onbehalf_name_en: row.original.onbehalf_name_en,
                onbehalf_name_fr: row.original.onbehalf_name_fr,
                onbehalf_require_actual: row.original.onbehalf_require_actual,
                is_current: row.original.is_current,
                can_action: row.original.can_action,
                can_reassign: row.original.can_reassign,
                can_add_before: row.original.can_add_before,
                can_add_after: row.original.can_add_after,
                certifications: row.original.certifications
              }"
              :runtime-state="getStepStatus(row.original)" />
            <UButton
              v-if="row.original.can_action"
              icon="i-lucide-file-signature"
              color="primary"
              variant="ghost"
              size="sm"
              class="cursor-default"
              :aria-label="t('assessment.approvals.action_step')"
              @click="openActionModal(row.original)" />
            <UButton
              v-if="row.original.can_reassign"
              icon="i-lucide-user-round-pen"
              color="neutral"
              variant="ghost"
              size="sm"
              class="cursor-default"
              :aria-label="t('assessment.approvals.reassign')"
              @click="openReassignModal(row.original)" />
            <UDropdownMenu
              v-if="row.original.can_add_before || row.original.can_add_after"
              :items="getAddStepMenuItems(row.original)"
              :content="{ align: 'end' }">
              <UButton
                icon="i-lucide-list-plus"
                color="neutral"
                variant="ghost"
                size="sm"
                class="cursor-default"
                :aria-label="t('assessment.approvals.add_step')" />
            </UDropdownMenu>
          </div>
        </template>

        <template #footer-left>
          {{ filteredTotalRecords }} {{ t('common.records') }}
        </template>
      </CommonResourceLayoutCard>
    </div>

    <CommonApprovalsReassignModal
      v-model:open="isReassignModalOpen"
      :state="selectedReassignState"
      :step="selectedReassignStep"
      :user-options="selectedReassignUserOptions"
      :behalf-type-options="behalfTypeOptions"
      :is-submitting="isSubmittingReassign"
      @close="closeReassignModal"
      @submit="submitReassign" />

    <CommonApprovalsActionModal
      v-model:state="selectedActionState"
      :open="isActionModalOpen"
      :step="selectedActionStep"
      :behalf-type-options="behalfTypeOptions"
      :requires-actual="requiresActual"
      :approve-disabled="approveDisabled"
      :deny-disabled="denyDisabled"
      :is-submitting-action="isSubmittingAction"
      :default-approver-display="defaultApproverDisplay"
      :assigned-approver-display="assignedApproverDisplay"
      :assigned-approver-position-title="assignedApproverPositionTitle"
      @update:open="handleActionModalOpenUpdate"
      @close="closeActionModal"
      @submit="submitAction" />

    <CommonApprovalsAddStepModal
      v-model:open="isAddStepModalOpen"
      v-model:state="selectedAddStepState"
      :entity-type="entityType"
      :entity-id="entityId"
      :anchor-step="selectedAddStep"
      :routing-slip="selectedAddStepRoutingSlip"
      :is-submitting="isSubmittingAddStep"
      @close="closeAddStepModal"
      @submit="submitAddStep"
      @add-certification="addAdditionalCertification"
      @remove-certification="removeAdditionalCertification"
      @move-certification="moveAdditionalCertification" />
  </div>
</template>
