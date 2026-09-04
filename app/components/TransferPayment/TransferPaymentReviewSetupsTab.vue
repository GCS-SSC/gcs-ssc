<script setup lang="ts">
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { getGroupedRowModel } from '@tanstack/vue-table'
import type { ExpandedState } from '@tanstack/vue-table'
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { appRouteLocations } from '~/utils/route-locations'
import type {
  TransferPaymentStreamReviewSetupItem,
  TransferPaymentStreamReviewSetupMember
} from '~~/shared/types/schemas/transfer-payment'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import type { PublicationState } from '~~/shared/constants/system-lifecycle'

const {
  transferPaymentId,
  streamId,
  agencyId,
  canUpdateChild,
  canDeleteChild
} = defineProps<{
  transferPaymentId: string
  streamId: string
  agencyId?: string
  canUpdateChild: boolean
  canDeleteChild: boolean
}>()

const { t } = useI18n()
const { getGroupedDisclosureControlsId, getGroupedDisclosureContentId } = useGroupedDisclosureIds()
const localePath = useLocalePath()
const router = useRouter()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const isFetchingNextOrder: Ref<boolean> = ref(false)
const isAssociateModalOpen: Ref<boolean> = ref(false)
const associateState: Ref<Record<string, unknown> | null> = ref(null)
const associateReviewSetup: Ref<ReviewSetupWithMembers | null> = ref(null)
const isSchemaCreateModalOpen: Ref<boolean> = ref(false)
const schemaCreateState: Ref<Record<string, unknown> | null> = ref(null)
const schemaCreateReviewSetup: Ref<ReviewSetupWithMembers | null> = ref(null)
type ReviewSetupMemberInput = TransferPaymentStreamReviewSetupMember & {
  id?: string
  _key?: string
}
type ReviewSetupWithMembers = TransferPaymentStreamReviewSetupItem & {
  entityTypeLabelEn: string
  entityTypeLabelFr: string
  members?: ReviewSetupMemberInput[]
  publicationState: PublicationState
}
let reviewSetupModalIntent = 0

const beginReviewSetupModalIntent = () => {
  reviewSetupModalIntent += 1
  return reviewSetupModalIntent
}

type ReviewSetupGroupedLeafRow = {
  id: string
  entityTypeGroup: TransferPaymentStreamReviewSetupItem['egcs_cn_entitytype']
  entityTypeLabelEn: string
  entityTypeLabelFr: string
  reviewSetGroup: string
  reviewSetupMemberGroup: string
  reviewSetId: string
  reviewSetNameEn: string
  reviewSetNameFr: string
  reviewSetOrder: number
  reviewSetState: PublicationState
  reviewSetSequential: boolean
  memberId: string
  memberNameEn: string
  memberNameFr: string
  memberOrder: number
  memberApprovalTemplateId?: string
  disableCustomOutcomes: boolean
  disableAlignment: boolean
  disableReviewers: boolean
  memberState?: PublicationState
  reviewSchemaId: string
  reviewType: 'assessment' | 'checklist'
  isPlaceholder: boolean
}
type GroupedReviewSetupRow = {
  id: string
  depth: number
  groupingColumnId?: string
  original: ReviewSetupGroupedLeafRow
  subRows?: GroupedReviewSetupRow[]
  leafRows?: GroupedReviewSetupRow[]
  getIsExpanded?: () => boolean
  getIsGrouped?: () => boolean
  toggleExpanded?: () => void
}

const ENTITY_GROUP_COLUMN_ID = 'entityTypeGroup'
const REVIEW_SET_GROUP_COLUMN_ID = 'reviewSetGroup'
const REVIEW_SETUP_MEMBER_GROUP_COLUMN_ID = 'reviewSetupMemberGroup'

const { isOpen, selected, openCreate, captureSession, closeSession } = useCrudModal<ReviewSetupWithMembers>({
  /**
   * Creates the synchronous defaults shared by all review-setup create flows.
   *
   * @returns Initial review-setup form state.
   */
  createState: () => ({
    egcs_cn_sequential: false,
    members: []
  }),
  updateState: item => ({ ...item })
})
const entityTypeFilter: Ref<string> = ref('all')
const expandedRows: Ref<ExpandedState> = ref({})
const grouping = ref([ENTITY_GROUP_COLUMN_ID, REVIEW_SET_GROUP_COLUMN_ID, REVIEW_SETUP_MEMBER_GROUP_COLUMN_ID])
const columnVisibility = ref<Record<string, boolean>>({
  [ENTITY_GROUP_COLUMN_ID]: false,
  [REVIEW_SET_GROUP_COLUMN_ID]: false,
  [REVIEW_SETUP_MEMBER_GROUP_COLUMN_ID]: false
})

const { search, pagination, items, refresh, status } = useResourceTable<ReviewSetupWithMembers>({
  fetchUrl: `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/review-setups`
})

const columns: TableColumnInput<ReviewSetupGroupedLeafRow>[] = [
  { id: ENTITY_GROUP_COLUMN_ID, accessorKey: ENTITY_GROUP_COLUMN_ID, headerKey: 'transfer_payment.entity_type' },
  { id: REVIEW_SET_GROUP_COLUMN_ID, accessorKey: REVIEW_SET_GROUP_COLUMN_ID, headerKey: 'transfer_payment.review_set' },
  { id: REVIEW_SETUP_MEMBER_GROUP_COLUMN_ID, accessorKey: REVIEW_SETUP_MEMBER_GROUP_COLUMN_ID, headerKey: 'transfer_payment.review_setup_member' },
  { id: 'name', accessorKey: 'memberNameEn', headerKey: 'common.name' },
  { id: 'order', accessorKey: 'memberOrder', headerKey: 'common.order' },
  { id: 'flags', accessorKey: 'reviewSetState', headerKey: 'common.flags' },
  { id: 'actions', headerKey: 'common.actions' }
]

const bilingualColumns: BilingualColumnConfig<ReviewSetupGroupedLeafRow>[] = [
  {
    id: 'name',
    accessorKey: {
      en: 'memberNameEn',
      fr: 'memberNameFr'
    },
    headerKey: 'common.name'
  }
]

const getMemberRowId = (reviewSetupId: string, member: ReviewSetupMemberInput) => (
  `member:${reviewSetupId}:${member._key ?? member.egcs_cn_reviewschema}:${member.egcs_cn_order}`
)

const reviewSetupById = computed(() => new Map(
  items.value.map(item => [String(item.id), item] as const)
))

const filteredItems = computed(() => (
  entityTypeFilter.value === 'all'
    ? items.value
    : items.value.filter(item => item.egcs_cn_entitytype === entityTypeFilter.value)
))

const tableRows = computed<ReviewSetupGroupedLeafRow[]>(() => filteredItems.value
  .flatMap<ReviewSetupGroupedLeafRow>(row => {
    const members = (row.members as ReviewSetupMemberInput[] | undefined) ?? []
    if (members.length === 0) {
      const placeholderId = `review-setup-empty:${String(row.id)}`
      return [{
        id: placeholderId,
        entityTypeGroup: row.egcs_cn_entitytype,
        entityTypeLabelEn: row.entityTypeLabelEn,
        entityTypeLabelFr: row.entityTypeLabelFr,
        reviewSetGroup: String(row.id),
        reviewSetupMemberGroup: placeholderId,
        reviewSetId: String(row.id),
        reviewSetNameEn: row.egcs_cn_name_en,
        reviewSetNameFr: row.egcs_cn_name_fr,
        reviewSetOrder: row.egcs_cn_order,
        reviewSetState: row.publicationState,
        reviewSetSequential: row.egcs_cn_sequential,
        memberId: placeholderId,
        memberNameEn: '',
        memberNameFr: '',
        memberOrder: 0,
        disableCustomOutcomes: false,
        disableAlignment: false,
        disableReviewers: false,
        memberState: undefined,
        reviewSchemaId: '',
        reviewType: 'assessment' as const,
        isPlaceholder: true
      }]
    }

    return members.map((member): ReviewSetupGroupedLeafRow => {
      const memberId = typeof member.id === 'string'
        ? member.id
        : `review-setup-member:${String(row.id)}:${member._key ?? member.egcs_cn_reviewschema}:${member.egcs_cn_order}`

      return {
        id: getMemberRowId(String(row.id), member),
        entityTypeGroup: row.egcs_cn_entitytype,
        entityTypeLabelEn: row.entityTypeLabelEn,
        entityTypeLabelFr: row.entityTypeLabelFr,
        reviewSetGroup: String(row.id),
        reviewSetupMemberGroup: memberId,
        reviewSetId: String(row.id),
        reviewSetNameEn: row.egcs_cn_name_en,
        reviewSetNameFr: row.egcs_cn_name_fr,
        reviewSetOrder: row.egcs_cn_order,
        reviewSetState: row.publicationState,
        reviewSetSequential: row.egcs_cn_sequential,
        memberId,
        memberNameEn: String(member.egcs_cn_name_en ?? ''),
        memberNameFr: String(member.egcs_cn_name_fr ?? ''),
        memberOrder: member.egcs_cn_order,
        ...(member.egcs_cn_approvaltemplate ? { memberApprovalTemplateId: member.egcs_cn_approvaltemplate } : {}),
        disableCustomOutcomes: member.egcs_cn_disablecustomoutcomes === true,
        disableAlignment: member.egcs_cn_disablealignment === true,
        disableReviewers: member.egcs_cn_disablereviewers === true,
        memberState: member.publicationState,
        reviewSchemaId: String(member.egcs_cn_reviewschema),
        reviewType: (member.egcs_cn_reviewtype === 'checklist' ? 'checklist' : 'assessment') as 'checklist' | 'assessment',
        isPlaceholder: false
      }
    })
  })
  .sort((left, right) => {
    if (left.entityTypeGroup !== right.entityTypeGroup) {
      return left.entityTypeGroup.localeCompare(right.entityTypeGroup)
    }

    if (left.reviewSetOrder !== right.reviewSetOrder) {
      return left.reviewSetOrder - right.reviewSetOrder
    }

    return left.memberOrder - right.memberOrder
  }))

const filteredTotalRecords = computed(() => filteredItems.value.length)

const getEntityGroupRowId = (entityType: ReviewSetupGroupedLeafRow['entityTypeGroup']) =>
  `${ENTITY_GROUP_COLUMN_ID}:${entityType}`

const getReviewSetGroupRowId = (row: ReviewSetupGroupedLeafRow) =>
  `${getEntityGroupRowId(row.entityTypeGroup)}>${REVIEW_SET_GROUP_COLUMN_ID}:${row.reviewSetId}`

const getReviewSetupMemberGroupRowId = (row: ReviewSetupGroupedLeafRow) =>
  `${getReviewSetGroupRowId(row)}>${REVIEW_SETUP_MEMBER_GROUP_COLUMN_ID}:${row.memberId}`

watch(
  tableRows,
  rows => {
    const currentExpandedRows = typeof expandedRows.value === 'object' && expandedRows.value !== null
      ? expandedRows.value
      : {}
    const entityGroupIds = Array.from(new Set(rows.map(row => getEntityGroupRowId(row.entityTypeGroup))))
    const reviewSetGroupIds = new Set(rows.map(row => getReviewSetGroupRowId(row)))
    const reviewSetupMemberGroupIds = new Set(rows.map(row => getReviewSetupMemberGroupRowId(row)))
    const nextExpandedRows: Record<string, boolean> = {}

    for (const entityGroupId of entityGroupIds) {
      nextExpandedRows[entityGroupId] = currentExpandedRows[entityGroupId] ?? true
    }

    for (const [rowId, isExpanded] of Object.entries(currentExpandedRows)) {
      if (reviewSetGroupIds.has(rowId)) {
        nextExpandedRows[rowId] = isExpanded
      }

      if (reviewSetupMemberGroupIds.has(rowId)) {
        nextExpandedRows[rowId] = isExpanded
      }
    }

    expandedRows.value = nextExpandedRows
  },
  { immediate: true }
)

const groupingOptions = {
  getGroupedRowModel: getGroupedRowModel()
}
const expandedOptions = { autoResetExpanded: false }

/**
 * Loads the next available review-setup order from the server for this stream scope.
 *
 * @returns Server-calculated next execution order for a new review setup.
 */
const getNextReviewSetupOrder = async () => {
  const fetchResponse = await fetch(getClientRequestUrl(`/api/transfer-payments/${transferPaymentId}/streams/${streamId}/review-setups/next-order`))
  if (!fetchResponse.ok) await throwFetchResponseError(fetchResponse)
  const response = await fetchResponse.json() as { nextOrder: number }
  return response.nextOrder
}

/**
 * Opens the create modal with default review setup state.
 *
 * @param entityType - Optional entity type to prefill and lock for contextual create flows.
 */
const onAdd = async (entityType?: ReviewSetupWithMembers['egcs_cn_entitytype']) => {
  if (!canUpdateChild) {
    return
  }

  const intent = beginReviewSetupModalIntent()
  try {
    isFetchingNextOrder.value = true
    const nextOrder = await getNextReviewSetupOrder()
    if (intent !== reviewSetupModalIntent) {
      return
    }
    openCreate()
    if (selected.value) {
      selected.value = {
        ...selected.value,
        ...(entityType ? { egcs_cn_entitytype: entityType } : {}),
        egcs_cn_order: nextOrder
      }
    }
  } catch (error: unknown) {
    if (intent === reviewSetupModalIntent) {
      showError(error)
    }
  } finally {
    if (intent === reviewSetupModalIntent) {
      isFetchingNextOrder.value = false
    }
  }
}

/**
 * Opens the selected review set in its configuration workspace.
 *
 * @param row - Review set selected from the overview.
 */
const openReviewSetupDetail = async (row: ReviewSetupWithMembers) => {
  beginReviewSetupModalIntent()
  isFetchingNextOrder.value = false
  await router.push(localePath(appRouteLocations.transferPaymentReviewSetupDetail(
    transferPaymentId,
    streamId,
    String(row.id)
  )))
}

/**
 * Soft deletes a complete review set after confirmation.
 *
 * @param row - Review set selected from the overview.
 */
const deleteReviewSetup = async (row: ReviewSetupWithMembers) => {
  try {
    const deleted = await confirmDeleteRequest(
      `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/review-setups/${row.id}`
    )
    if (deleted) await refresh()
  } catch (error) {
    showError(error)
  }
}

/**
 * Opens schema association for a review set.
 *
 * @param row - Review set receiving the associated schema.
 */
const openAssociateSchema = (row: ReviewSetupWithMembers) => {
  const memberOrders = row.members?.map(member => member.egcs_cn_order) ?? []
  associateReviewSetup.value = row
  associateState.value = { egcs_cn_order: memberOrders.length ? Math.max(...memberOrders) + 1 : 1 }
  isAssociateModalOpen.value = true
}

/**
 * Opens schema creation for a review set.
 *
 * @param row - Review set receiving the new schema.
 */
const openCreateSchema = (row: ReviewSetupWithMembers) => {
  const memberOrders = row.members?.map(member => member.egcs_cn_order) ?? []
  schemaCreateReviewSetup.value = row
  schemaCreateState.value = {
    egcs_cn_reviewtype: 'assessment',
    egcs_cn_order: memberOrders.length ? Math.max(...memberOrders) + 1 : 1
  }
  isSchemaCreateModalOpen.value = true
}

/**
 * Opens the newly created schema editor.
 *
 * @param payload - Created schema identity and review type.
 * @param payload.schemaId - Identifier of the created schema.
 * @param payload.reviewType - Assessment or checklist discriminator.
 */
const onSchemaCreated = async (payload: { schemaId: string, reviewType: 'assessment' | 'checklist' }) => {
  await refresh()
  await router.push(localePath(payload.reviewType === 'checklist'
    ? appRouteLocations.transferPaymentChecklistSchemaDetail(transferPaymentId, streamId, payload.schemaId)
    : appRouteLocations.transferPaymentAssessmentSchemaDetail(transferPaymentId, streamId, payload.schemaId)))
}

/**
 * Opens the assessment or checklist schema represented by a member row.
 *
 * @param row - Review-set member row to open.
 */
const openReviewSchema = async (row: ReviewSetupGroupedLeafRow) => {
  await router.push(localePath(row.reviewType === 'checklist'
    ? appRouteLocations.transferPaymentChecklistSchemaDetail(transferPaymentId, streamId, row.reviewSchemaId)
    : appRouteLocations.transferPaymentAssessmentSchemaDetail(transferPaymentId, streamId, row.reviewSchemaId)))
}

const getReviewSetupForRow = (row: GroupedReviewSetupRow) =>
  reviewSetupById.value.get(row.original.reviewSetId) ?? null

const isGroupedRow = (row: GroupedReviewSetupRow) => row.getIsGrouped?.() === true
const isEntityTypeGroupRow = (row: GroupedReviewSetupRow) => (
  isGroupedRow(row) && row.groupingColumnId === ENTITY_GROUP_COLUMN_ID
)
const isReviewSetGroupRow = (row: GroupedReviewSetupRow) => (
  isGroupedRow(row) && row.groupingColumnId === REVIEW_SET_GROUP_COLUMN_ID
)
const isReviewSetupMemberGroupRow = (row: GroupedReviewSetupRow) => (
  isGroupedRow(row) && row.groupingColumnId === REVIEW_SETUP_MEMBER_GROUP_COLUMN_ID
)

const getGroupedRowCount = (row: GroupedReviewSetupRow) => row.leafRows?.length ?? row.subRows?.length ?? 0
const updateExpandedRows = (value: ExpandedState) => {
  expandedRows.value = value
}
</script>

<template>
  <div>
    <CommonResourceLayoutCard
      v-model:search="search"
      v-model:pagination="pagination"
      :data="tableRows"
      :columns="columns"
      :bilingual-columns="bilingualColumns"
      :grouping="grouping"
      :grouping-options="groupingOptions"
      :expanded-options="expandedOptions"
      :column-visibility="columnVisibility"
      :expanded="expandedRows"
      :total-records="filteredTotalRecords"
      :loading="status === 'pending' || isFetchingNextOrder"
      :button-label="canUpdateChild ? t('common.add') : undefined"
      :show-button="canUpdateChild"
      @add="onAdd"
      @update:expanded="updateExpandedRows">
      <template #filters>
        <CommonEnumSelect
          v-model="entityTypeFilter"
          name="transfer_payment_review_setup_entity_type"
          show-all-option
          :all-option-label="t('common.all')"
          variant="outline"
          class="min-w-48" />
      </template>

      <template #order-cell="{ row }">
        <span
          v-if="isReviewSetGroupRow(row)"
          class="text-xs font-bold tracking-[0.16em] text-zinc-400 uppercase">
          {{ row.original.reviewSetOrder }}
        </span>

        <span
          v-else-if="isReviewSetupMemberGroupRow(row)"
          class="text-xs font-bold tracking-[0.16em] text-zinc-400 uppercase">
          {{ row.original.memberOrder }}
        </span>

        <span v-else-if="!isGroupedRow(row)">&nbsp;</span>

        <span v-else>&nbsp;</span>
      </template>

      <template #actions-cell="{ row }">
        <div v-if="isEntityTypeGroupRow(row)" class="flex items-center gap-2">
          <UButton
            v-if="canUpdateChild"
            icon="i-lucide-plus"
            color="primary"
            variant="ghost"
            size="sm"
            class="cursor-default"
            :aria-label="`${t('common.add')} ${t('transfer_payment.review_set')}`"
            @click="onAdd(row.original.entityTypeGroup)" />
        </div>

        <div v-else-if="isReviewSetGroupRow(row) && getReviewSetupForRow(row)" class="flex items-center gap-2">
          <UButton
            v-if="canUpdateChild"
            icon="i-lucide-plus"
            color="primary"
            variant="ghost"
            size="sm"
            class="cursor-default"
            :aria-label="t('transfer_payment.review_schema_create')"
            @click="openCreateSchema(getReviewSetupForRow(row)!)" />
          <UButton
            v-if="canUpdateChild"
            icon="i-lucide-link"
            color="neutral"
            variant="ghost"
            size="sm"
            class="cursor-default"
            :aria-label="t('transfer_payment.review_schema_associate')"
            @click="openAssociateSchema(getReviewSetupForRow(row)!)" />
          <UButton
            icon="i-lucide-arrow-right"
            color="neutral"
            variant="ghost"
            size="sm"
            class="cursor-default"
            :aria-label="t('common.open')"
            @click="openReviewSetupDetail(getReviewSetupForRow(row)!)" />
          <UButton
            v-if="canDeleteChild"
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            size="sm"
            class="cursor-default"
            :aria-label="t('common.delete')"
            @click="deleteReviewSetup(getReviewSetupForRow(row)!)" />
        </div>

        <div v-else-if="isReviewSetupMemberGroupRow(row) && !row.original.isPlaceholder" class="flex items-center gap-2">
          <UButton
            icon="i-lucide-arrow-right"
            color="neutral"
            variant="ghost"
            size="sm"
            class="cursor-default"
            :aria-label="t('common.open')"
            @click="openReviewSchema(row.original)" />
        </div>

        <span v-else>&nbsp;</span>
      </template>

      <template #name-cell="{ row }">
        <div :id="getGroupedDisclosureContentId(row)" class="contents">
          <div v-if="isEntityTypeGroupRow(row)" class="flex w-full items-center gap-3 py-1">
            <CommonGroupedDisclosureButton
              class="group flex min-w-0 items-center gap-3 text-left"
              :expanded="row.getIsExpanded?.() === true"
              :controls="getGroupedDisclosureControlsId(row.id)"
              :label-en="row.original.entityTypeLabelEn"
              :label-fr="row.original.entityTypeLabelFr"
              @toggle="row.toggleExpanded?.()">
              <UIcon
                :name="row.getIsExpanded?.() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                class="size-4 text-zinc-400 transition-colors group-hover:text-primary" />

              <CommonEntityTypeBadge :type="String(row.original.entityTypeGroup)" :label-en="row.original.entityTypeLabelEn" :label-fr="row.original.entityTypeLabelFr" interactive />

              <CommonStatusBadge variant="count" size="sm" :label="String(getGroupedRowCount(row))" />
            </CommonGroupedDisclosureButton>
          </div>

          <div v-else-if="isReviewSetGroupRow(row)" class="flex w-full items-center gap-3 py-1 pl-6">
            <CommonGroupedDisclosureButton
              class="group flex min-w-0 cursor-default items-center gap-3 text-left font-bold text-zinc-900 transition-colors hover:text-primary dark:text-white"
              :expanded="row.getIsExpanded?.() === true"
              :controls="getGroupedDisclosureControlsId(row.id)"
              :label-en="row.original.reviewSetNameEn"
              :label-fr="row.original.reviewSetNameFr"
              @toggle="row.toggleExpanded?.()">
              <UIcon :name="row.getIsExpanded?.() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4 text-zinc-400 transition-colors group-hover:text-primary" />
              <CommonBilingualName
                :name-en="row.original.reviewSetNameEn"
                :name-fr="row.original.reviewSetNameFr" />
              <CommonStatusBadge variant="count" size="sm" :label="String(getGroupedRowCount(row))" />
            </CommonGroupedDisclosureButton>
          </div>

          <button
            v-else-if="isReviewSetupMemberGroupRow(row) && !row.original.isPlaceholder"
            type="button"
            class="group flex w-full items-center gap-3 py-1 pl-12 text-left"
            @click="openReviewSchema(row.original)">
            <UIcon name="i-lucide-corner-down-right" class="size-4 text-zinc-400" />
            <span class="font-bold text-zinc-900 transition-colors group-hover:text-primary dark:text-white">
              <CommonBilingualName
                :name-en="row.original.memberNameEn"
                :name-fr="row.original.memberNameFr" />
            </span>
          </button>

          <div v-else-if="row.original.isPlaceholder" class="pl-12 text-sm text-zinc-500 dark:text-zinc-400">
            {{ t('common.no_data') }}
          </div>

          <div v-else class="flex items-center gap-3 pl-16">
            <div class="flex items-center gap-2 text-left">
              <UIcon name="i-lucide-corner-down-right" class="size-4 text-zinc-400" />
              <span>
                <CommonBilingualName
                  :name-en="row.original.memberNameEn"
                  :name-fr="row.original.memberNameFr" />
              </span>
            </div>
          </div>
        </div>
      </template>

      <template #flags-cell="{ row }">
        <div v-if="isReviewSetGroupRow(row)" class="flex flex-wrap items-center gap-2">
          <CommonLifecycleBadge engine="publication" :state="row.original.reviewSetState" />
          <CommonStatusBadge v-if="row.original.reviewSetSequential" variant="sequential" />
        </div>

        <div
          v-else-if="(isReviewSetupMemberGroupRow(row) || !isGroupedRow(row)) && row.original.memberState"
          class="flex flex-wrap items-center gap-2">
          <CommonLifecycleBadge engine="publication" :state="row.original.memberState!" />
          <CommonStatusBadge v-if="row.original.disableCustomOutcomes" variant="warning" size="sm" label-key="transfer_payment.disable_custom_outcomes" />
          <CommonStatusBadge v-if="row.original.disableAlignment" variant="warning" size="sm" label-key="transfer_payment.disable_alignment" />
          <CommonStatusBadge v-if="row.original.disableReviewers" variant="warning" size="sm" label-key="transfer_payment.disable_reviewers" />
        </div>

        <span v-else>&nbsp;</span>
      </template>
    </CommonResourceLayoutCard>
    <TransferPaymentReviewSetupModal
      v-if="selected && canUpdateChild"
      v-model:open="isOpen"
      v-model:state="selected"
      :transfer-payment-id="transferPaymentId"
      :stream-id="streamId"
      :agency-id="agencyId"
      :capture-session="captureSession"
      :close-session="closeSession"
      @saved="refresh" />
    <TransferPaymentReviewSetupItemModal
      v-if="associateReviewSetup && associateState && canUpdateChild"
      v-model:open="isAssociateModalOpen"
      v-model:state="associateState"
      :transfer-payment-id="transferPaymentId"
      :stream-id="streamId"
      :review-setup-id="String(associateReviewSetup.id)"
      :agency-id="agencyId"
      :entity-type="associateReviewSetup.egcs_cn_entitytype"
      @saved="refresh" />
    <TransferPaymentReviewSetupSchemaCreateModal
      v-if="schemaCreateReviewSetup && schemaCreateState && canUpdateChild"
      v-model:open="isSchemaCreateModalOpen"
      v-model:state="schemaCreateState"
      :transfer-payment-id="transferPaymentId"
      :stream-id="streamId"
      :review-setup-id="String(schemaCreateReviewSetup.id)"
      @created="onSchemaCreated" />
  </div>
</template>
