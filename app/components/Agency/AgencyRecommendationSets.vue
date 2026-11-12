<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc */
import { getGroupedRowModel } from '@tanstack/vue-table'
import type { ExpandedState } from '@tanstack/vue-table'
import type { Ref } from 'vue'
import { computed, onScopeDispose, ref, watch } from 'vue'
import { appRouteLocations } from '~/utils/route-locations'
import { useActionContext } from '~/composables/useActionContext'
import { useCommittedSettlement } from '~/composables/useCommittedSettlement'
import type {
  TransferPaymentStreamRecommendationSetupItem,
  TransferPaymentStreamRecommendationSetupMemberItem
} from '~~/shared/types/schemas/transfer-payment'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import type { PublicationState } from '~~/shared/constants/system-lifecycle'

const { agencyId, canUpdateChild, canDeleteChild } = defineProps<{
  agencyId: string
  canUpdateChild: boolean
  canDeleteChild: boolean
}>()

type RecommendationMember = Omit<TransferPaymentStreamRecommendationSetupMemberItem, 'egcs_cn_name_en' | 'egcs_cn_name_fr'> & {
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
}
type RecommendationSetupWithMembers = Omit<TransferPaymentStreamRecommendationSetupItem, 'members'> & {
  publicationState: PublicationState
  members: RecommendationMember[]
}
type RecommendationRow = {
  id: string
  setupGroup: string
  memberGroup: string
  setupId: string
  setupNameEn: string
  setupNameFr: string
  setupState: PublicationState
  memberId: string
  memberNameEn: string
  memberNameFr: string
  memberOrder: number
  memberState?: PublicationState
  schemaId: string
  isPlaceholder: boolean
}
type GroupedRow = {
  groupingColumnId?: string
  original: RecommendationRow
  subRows?: GroupedRow[]
  leafRows?: GroupedRow[]
  getIsExpanded?: () => boolean
  getIsGrouped?: () => boolean
  toggleExpanded?: () => void
}

const SETUP_GROUP = 'setupGroup'
const MEMBER_GROUP = 'memberGroup'
const updateActionContext = useActionContext({ identity: [() => agencyId], authority: () => canUpdateChild })
const deleteActionContext = useActionContext({ identity: [() => agencyId], authority: () => canDeleteChild })
const { t } = useI18n()
const { getGroupedDisclosureControlsId, getGroupedDisclosureContentId } = useGroupedDisclosureIds()
const router = useRouter()
const localePath = useLocalePath()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const confirmDelete = useDeleteConfirm()
const isDeleting: Ref<boolean> = ref(false)
const deletingMemberId: Ref<string | null> = ref(null)
const expandedRows: Ref<ExpandedState> = ref({})
const grouping = ref([SETUP_GROUP, MEMBER_GROUP])
const columnVisibility = ref<Record<string, boolean>>({ [SETUP_GROUP]: false, [MEMBER_GROUP]: false })
const isItemModalOpen: Ref<boolean> = ref(false)
const selectedItem: Ref<Partial<TransferPaymentStreamRecommendationSetupMemberItem> | null> = ref(null)
const selectedItemParent: Ref<RecommendationSetupWithMembers | null> = ref(null)
const isSchemaCreateModalOpen: Ref<boolean> = ref(false)
const schemaCreateState: Ref<Record<string, unknown> | null> = ref(null)
const schemaCreateParent: Ref<RecommendationSetupWithMembers | null> = ref(null)
type CatalogContext = { kind: 'active'; agencyId: string } | { kind: 'disposed' }
let context: CatalogContext = { kind: 'active', agencyId }
let editorIntent = 0
const isCurrentContext = (owner: CatalogContext) => owner.kind === 'active' && context === owner

const { isOpen, selected, openCreate, captureSession, closeSession } = useCrudModal<RecommendationSetupWithMembers>({
  createState: () => ({ members: [] }),
  updateState: item => ({ ...item, members: item.members.map(member => ({ ...member })) })
})
const { search, pagination, items, totalRecords, refresh, status, error } = useResourceTable<RecommendationSetupWithMembers>({
  fetchUrl: computed(() => `/api/agency/${agencyId}/recommendation-sets`)
})
watch([() => agencyId, () => canUpdateChild, () => canDeleteChild], () => {
  context = { kind: 'active', agencyId }
  editorIntent += 1
  isDeleting.value = false
  deletingMemberId.value = null
}, { flush: 'sync' })
watch(() => agencyId, () => {
  isOpen.value = false
  isItemModalOpen.value = false
  selectedItem.value = null
  selectedItemParent.value = null
  isSchemaCreateModalOpen.value = false
  schemaCreateState.value = null
  schemaCreateParent.value = null
}, { flush: 'sync' })
onScopeDispose(() => {
  context = { kind: 'disposed' }
  editorIntent += 1
})
const captureCommitted = useCommittedSettlement({
  context: updateActionContext,
  settle: async () => {
    await refresh()
    return status.value === 'success'
      ? { kind: 'available' }
      : { kind: 'unavailable', error: error.value }
  }
})
const setupById = computed(() => new Map(items.value.map(item => [String(item.id), item] as const)))
const memberActionContext = useActionContext({
  identity: [() => agencyId, () => selectedItemParent.value?.id, () => selectedItem.value?.id],
  authority: () => canUpdateChild,
  eligible: () => {
    const parent = items.value.find(item => String(item.id) === String(selectedItemParent.value?.id))
    return Boolean(parent && (!selectedItem.value?.id || parent.members.some(member => String(member.id) === String(selectedItem.value?.id))))
  }
})
const schemaCreateActionContext = useActionContext({
  identity: [() => agencyId, () => schemaCreateParent.value?.id],
  authority: () => canUpdateChild,
  eligible: () => items.value.some(item => String(item.id) === String(schemaCreateParent.value?.id))
})
const tableRows = computed<RecommendationRow[]>(() => items.value.flatMap(setup => {
  const members = setup.members ?? []
  if (members.length === 0) {
    const placeholderId = `empty:${setup.id}`
    return [{
      id: placeholderId,
      setupGroup: String(setup.id),
      memberGroup: placeholderId,
      setupId: String(setup.id),
      setupNameEn: setup.egcs_cn_name_en,
      setupNameFr: setup.egcs_cn_name_fr,
      setupState: setup.publicationState,
      memberId: placeholderId,
      memberNameEn: '',
      memberNameFr: '',
      memberOrder: 0,
      schemaId: '',
      isPlaceholder: true
    }]
  }
  return members.map((member): RecommendationRow => ({
    id: `member:${setup.id}:${member.id}`,
    setupGroup: String(setup.id),
    memberGroup: String(member.id),
    setupId: String(setup.id),
    setupNameEn: setup.egcs_cn_name_en,
    setupNameFr: setup.egcs_cn_name_fr,
    setupState: setup.publicationState,
    memberId: String(member.id),
    memberNameEn: member.egcs_cn_name_en,
    memberNameFr: member.egcs_cn_name_fr,
    memberOrder: member.egcs_cn_order,
    ...(member.publicationState ? { memberState: member.publicationState } : {}),
    schemaId: String(member.egcs_cn_recommendationschema),
    isPlaceholder: false
  }))
}).sort((left, right) => left.setupNameEn.localeCompare(right.setupNameEn) || left.memberOrder - right.memberOrder))

const columns: TableColumnInput<RecommendationRow>[] = [
  { id: SETUP_GROUP, accessorKey: SETUP_GROUP, headerKey: 'transfer_payment.recommendation_setup' },
  { id: MEMBER_GROUP, accessorKey: MEMBER_GROUP, headerKey: 'transfer_payment.recommendation_schema' },
  { id: 'name', accessorKey: 'memberNameEn', headerKey: 'common.name' },
  { id: 'order', accessorKey: 'memberOrder', headerKey: 'common.order' },
  { id: 'status', accessorKey: 'memberState', headerKey: 'common.status' },
  { id: 'actions', headerKey: 'common.actions' }
]
const bilingualColumns: BilingualColumnConfig<RecommendationRow>[] = [{
  id: 'name', accessorKey: { en: 'memberNameEn', fr: 'memberNameFr' }, headerKey: 'common.name'
}]
const groupingOptions = { getGroupedRowModel: getGroupedRowModel() }
const expandedOptions = { autoResetExpanded: false }
const groupId = (column: string, value: string, prefix = '') => `${prefix}${prefix ? '>' : ''}${column}:${value}`
watch(tableRows, rows => {
  const current = typeof expandedRows.value === 'object' && expandedRows.value !== null ? expandedRows.value : {}
  const next: Record<string, boolean> = {}
  for (const row of rows) {
    const setupId = groupId(SETUP_GROUP, row.setupId)
    next[setupId] = current[setupId] ?? false
  }
  expandedRows.value = next
}, { immediate: true })

const isGrouped = (row: GroupedRow) => row.getIsGrouped?.() === true
const isSetupGroup = (row: GroupedRow) => isGrouped(row) && row.groupingColumnId === SETUP_GROUP
const isMemberGroup = (row: GroupedRow) => isGrouped(row) && row.groupingColumnId === MEMBER_GROUP
const groupedCount = (row: GroupedRow) => row.leafRows?.filter(leaf => !leaf.original.isPlaceholder).length ?? 0
const setupForRow = (row: GroupedRow) => setupById.value.get(row.original.setupId) ?? null

const onAdd = () => {
  if (context.kind !== 'active' || !canUpdateChild) return
  editorIntent += 1
  openCreate()
}
const onEdit = async (setup: RecommendationSetupWithMembers) => {
  if (context.kind !== 'active') return
  editorIntent += 1
  await router.push(localePath(appRouteLocations.agencyRecommendationSetDetail(agencyId, String(setup.id))))
}
const onDelete = async (setup: RecommendationSetupWithMembers) => {
  const owner = context
  if (owner.kind !== 'active' || !canDeleteChild || isDeleting.value) return
  const id = String(setup.id)
  const operation = deleteActionContext.capture()
  const shouldProceed = () => isCurrentContext(owner) && canDeleteChild
  try {
    isDeleting.value = true
    const deleted = await confirmDeleteRequest(`/api/agency/${owner.agencyId}/recommendation-sets/${id}`, {
      operation,
      target: { id, resolve: () => items.value.find(current => String(current.id) === id), eligible: () => canDeleteChild },
      shouldProceed
    })
    if (deleted && operation?.isCurrent() && isCurrentContext(owner)) await refresh()
  } catch (error) {
    if (operation?.isCurrent() && isCurrentContext(owner)) showError(error)
  } finally {
    if (isCurrentContext(owner)) isDeleting.value = false
  }
}
const onAddMember = (setup: RecommendationSetupWithMembers) => {
  if (context.kind !== 'active' || !canUpdateChild) return
  editorIntent += 1
  const members = setup.members ?? []
  selectedItemParent.value = setup
  selectedItem.value = {
    egcs_cn_order: members.length === 0 ? 1 : Math.max(...members.map(member => member.egcs_cn_order)) + 1,
    egcs_cn_failonnotrecommended: false
  }
  isItemModalOpen.value = true
}
const onCreateSchema = (setup: RecommendationSetupWithMembers) => {
  if (context.kind !== 'active' || !canUpdateChild) return
  editorIntent += 1
  const members = setup.members ?? []
  schemaCreateParent.value = setup
  schemaCreateState.value = {
    egcs_cn_order: members.length === 0 ? 1 : Math.max(...members.map(member => member.egcs_cn_order)) + 1,
    egcs_cn_failonnotrecommended: false
  }
  isSchemaCreateModalOpen.value = true
}
const onSchemaCreated = async (payload: { schemaId: string }) => {
  const owner = context
  const operation = updateActionContext.capture()
  const intent = editorIntent
  const isCurrent = () => Boolean(operation?.isCurrent()) && isCurrentContext(owner) && intent === editorIntent && canUpdateChild
  if (owner.kind !== 'active' || !isCurrent()) return
  try {
    if (isCurrent()) await router.push(localePath(appRouteLocations.agencyRecommendationSchemaDetail(owner.agencyId, payload.schemaId)))
  } catch (error) {
    if (isCurrent()) showError(error)
  }
}
const onEditMember = (row: RecommendationRow) => {
  if (context.kind !== 'active' || !canUpdateChild) return
  const setup = setupById.value.get(row.setupId)
  const member = setup?.members?.find(item => String(item.id) === row.memberId)
  if (!setup || !member) return
  editorIntent += 1
  selectedItemParent.value = setup
  selectedItem.value = { ...member }
  isItemModalOpen.value = true
}
const openSchemaEditor = async (row: RecommendationRow) => {
  if (context.kind !== 'active' || row.isPlaceholder || row.schemaId.length === 0) return
  editorIntent += 1
  await router.push(localePath(
    appRouteLocations.agencyRecommendationSchemaDetail(agencyId, row.schemaId)
  ))
}
const onDeleteMember = async (row: RecommendationRow) => {
  const owner = context
  if (owner.kind !== 'active' || !canDeleteChild || deletingMemberId.value) return
  const setupId = row.setupId
  const memberId = row.memberId
  const operation = deleteActionContext.capture()
  const shouldProceed = () => isCurrentContext(owner) && canDeleteChild
  try {
    deletingMemberId.value = row.id
    const deleted = await confirmDeleteRequest(
      `/api/agency/${owner.agencyId}/recommendation-sets/${setupId}/items/${memberId}`,
      {
        operation,
        target: {
          id: memberId,
          resolve: () => items.value.find(current => String(current.id) === setupId)?.members.find(member => String(member.id) === memberId),
          eligible: () => canDeleteChild
        },
        shouldProceed,
        confirm: () => confirmDelete({ description: t('transfer_payment.recommendation_schema') })
      }
    )
    if (deleted && operation?.isCurrent() && isCurrentContext(owner)) await refresh()
  } catch (error) {
    if (operation?.isCurrent() && isCurrentContext(owner)) showError(error)
  } finally {
    if (isCurrentContext(owner)) deletingMemberId.value = null
  }
}
</script>

<template>
  <div>
    <CommonResourceLayout
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
      :total-records="totalRecords"
      :loading="status === 'pending'"
      :request-status="status"
      :button-label="canUpdateChild ? t('common.add') : undefined"
      :show-button="canUpdateChild"
      @add="onAdd"
      @retry="refresh()"
      @update:expanded="expandedRows = $event">
      <template #name-cell="{ row }">
        <div :id="getGroupedDisclosureContentId(row)" class="contents">
          <div v-if="isSetupGroup(row)" class="flex w-full items-center gap-3 py-1">
            <CommonGroupedDisclosureButton
              class="group flex min-w-0 cursor-default items-center gap-3 text-left font-bold text-zinc-900 transition-colors hover:text-primary dark:text-white"
              :expanded="row.getIsExpanded?.() === true"
              :controls="getGroupedDisclosureControlsId(row.id)"
              :label-en="row.original.setupNameEn"
              :label-fr="row.original.setupNameFr"
              @toggle="row.toggleExpanded?.()">
              <UIcon :name="row.getIsExpanded?.() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4 text-zinc-400 transition-colors group-hover:text-primary" />
              <CommonBilingualName :name-en="row.original.setupNameEn" :name-fr="row.original.setupNameFr" />
              <CommonStatusBadge variant="count" size="sm" :label="String(groupedCount(row))" />
            </CommonGroupedDisclosureButton>
          </div>
          <button v-else-if="isMemberGroup(row) && !row.original.isPlaceholder" type="button" class="group flex w-full items-center gap-3 py-1 pl-6 text-left" :aria-label="t('transfer_payment.recommendation_schema')" @click="openSchemaEditor(row.original)">
            <UIcon name="i-lucide-corner-down-right" class="size-4 text-zinc-400" />
            <span class="[&_p:first-child]:transition-colors group-hover:[&_p:first-child]:text-primary">
              <CommonBilingualName :name-en="row.original.memberNameEn" :name-fr="row.original.memberNameFr" />
            </span>
          </button>
          <div v-else-if="row.original.isPlaceholder" class="pl-6 text-sm text-zinc-500 dark:text-zinc-400">
            {{ t('common.no_data') }}
          </div>
        </div>
      </template>
      <template #order-cell="{ row }">
        <span v-if="isMemberGroup(row) && !row.original.isPlaceholder">{{ row.original.memberOrder }}</span>
      </template>
      <template #status-cell="{ row }">
        <CommonLifecycleBadge v-if="isSetupGroup(row)" engine="publication" :state="row.original.setupState" />
        <CommonLifecycleBadge v-else-if="isMemberGroup(row) && row.original.memberState" engine="publication" :state="row.original.memberState" />
      </template>
      <template #actions-cell="{ row }">
        <div v-if="isSetupGroup(row) && setupForRow(row)" class="flex items-center gap-2">
          <CommonActionButton v-if="canUpdateChild" icon="i-lucide-plus" color="primary" variant="ghost" size="sm" class="cursor-default" :aria-label="t('transfer_payment.recommendation_schema_create')" @click="onCreateSchema(setupForRow(row)!)" />
          <CommonActionButton v-if="canUpdateChild" icon="i-lucide-link" color="neutral" variant="ghost" size="sm" class="cursor-default" :aria-label="t('transfer_payment.recommendation_schema_associate')" @click="onAddMember(setupForRow(row)!)" />
          <CommonActionButton icon="i-lucide-arrow-right" color="neutral" variant="ghost" size="sm" class="cursor-default" :aria-label="t('common.open')" @click="onEdit(setupForRow(row)!)" />
          <CommonActionButton v-if="canDeleteChild" icon="i-lucide-trash" color="error" variant="ghost" size="sm" class="cursor-default" :disabled="isDeleting" :aria-label="t('common.delete')" @click="onDelete(setupForRow(row)!)" />
        </div>
        <div v-else-if="isMemberGroup(row) && !row.original.isPlaceholder" class="flex items-center gap-2">
          <CommonActionButton icon="i-lucide-arrow-right" color="neutral" variant="ghost" size="sm" class="cursor-default" :aria-label="t('common.open')" @click="openSchemaEditor(row.original)" />
          <CommonActionButton v-if="canUpdateChild" icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" class="cursor-default" :aria-label="t('common.edit')" @click="onEditMember(row.original)" />
          <CommonActionButton v-if="canDeleteChild" icon="i-lucide-trash" color="error" variant="ghost" size="sm" class="cursor-default" :loading="deletingMemberId === row.original.id" :aria-label="t('common.delete')" @click="onDeleteMember(row.original)" />
        </div>
      </template>
    </CommonResourceLayout>
    <AgencyRecommendationSetModal v-if="selected && canUpdateChild" v-model:open="isOpen" v-model:state="selected" :action-context="updateActionContext" :agency-id="agencyId" :capture-session="captureSession" :close-session="closeSession" :capture-committed="captureCommitted" />
    <AgencyRecommendationSetItemModal v-if="selectedItem && selectedItemParent && canUpdateChild" v-model:open="isItemModalOpen" v-model:state="selectedItem" :action-context="memberActionContext" :recommendation-setup-id="String(selectedItemParent.id)" :agency-id="agencyId" :capture-committed="captureCommitted" />
    <AgencyRecommendationSetSchemaCreateModal v-if="schemaCreateState && schemaCreateParent && canUpdateChild" v-model:open="isSchemaCreateModalOpen" v-model:state="schemaCreateState" :action-context="schemaCreateActionContext" :recommendation-setup-id="String(schemaCreateParent.id)" :agency-id="agencyId" :capture-committed="captureCommitted" @created="onSchemaCreated" />
  </div>
</template>
