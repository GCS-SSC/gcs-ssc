<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc */
import { getGroupedRowModel } from '@tanstack/vue-table'
import type { ExpandedState } from '@tanstack/vue-table'
import type { Ref } from 'vue'
import { computed, ref, watch } from 'vue'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { appRouteLocations } from '~/utils/route-locations'
import type {
  TransferPaymentStreamRecommendationSetupItem,
  TransferPaymentStreamRecommendationSetupMemberItem
} from '~~/shared/types/schemas/transfer-payment'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import type { PublicationState } from '~~/shared/constants/system-lifecycle'

const { transferPaymentId, streamId, agencyId, canUpdateChild, canDeleteChild } = defineProps<{
  transferPaymentId: string
  streamId: string
  agencyId?: string
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

const { isOpen, selected, openCreate, captureSession, closeSession } = useCrudModal<RecommendationSetupWithMembers>({
  createState: () => ({ members: [] }),
  updateState: item => ({ ...item, members: item.members.map(member => ({ ...member })) })
})
const { search, pagination, items, refresh, status } = useResourceTable<RecommendationSetupWithMembers>({
  fetchUrl: `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/recommendation-setups`
})
const setupById = computed(() => new Map(items.value.map(item => [String(item.id), item] as const)))
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
  if (!canUpdateChild) return
  openCreate()
}
const onEdit = async (setup: RecommendationSetupWithMembers) => {
  await router.push(localePath(appRouteLocations.transferPaymentRecommendationSetupDetail(transferPaymentId, streamId, String(setup.id))))
}
const onDelete = async (setup: RecommendationSetupWithMembers) => {
  if (isDeleting.value) return
  try {
    isDeleting.value = true
    const deleted = await confirmDeleteRequest(`/api/transfer-payments/${transferPaymentId}/streams/${streamId}/recommendation-setups/${setup.id}`)
    if (deleted) await refresh()
  } catch (error) {
    showError(error)
  } finally {
    isDeleting.value = false
  }
}
const onAddMember = (setup: RecommendationSetupWithMembers) => {
  if (!canUpdateChild) return
  const members = setup.members ?? []
  selectedItemParent.value = setup
  selectedItem.value = {
    egcs_cn_order: members.length === 0 ? 1 : Math.max(...members.map(member => member.egcs_cn_order)) + 1,
    egcs_cn_failonnotrecommended: false
  }
  isItemModalOpen.value = true
}
const onEditMember = (row: RecommendationRow) => {
  const setup = setupById.value.get(row.setupId)
  const member = setup?.members?.find(item => String(item.id) === row.memberId)
  if (!setup || !member) return
  selectedItemParent.value = setup
  selectedItem.value = { ...member }
  isItemModalOpen.value = true
}
const openSchemaEditor = async (row: RecommendationRow) => {
  if (row.isPlaceholder || row.schemaId.length === 0) return
  await router.push(localePath(
    appRouteLocations.transferPaymentRecommendationSchemaDetail(transferPaymentId, streamId, row.schemaId)
  ))
}
const onDeleteMember = async (row: RecommendationRow) => {
  if (deletingMemberId.value) return
  try {
    deletingMemberId.value = row.id
    if (!await confirmDelete({ description: t('transfer_payment.recommendation_schema') })) return
    const response = await fetch(getClientRequestUrl(`/api/transfer-payments/${transferPaymentId}/streams/${streamId}/recommendation-setups/${row.setupId}/items/${row.memberId}`), { method: 'DELETE' })
    if (!response.ok) await throwFetchResponseError(response)
    await refresh()
  } catch (error) {
    showError(error)
  } finally {
    deletingMemberId.value = null
  }
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
      :total-records="items.length"
      :loading="status === 'pending'"
      :button-label="canUpdateChild ? t('common.add') : undefined"
      :show-button="canUpdateChild"
      @add="onAdd"
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
          <UButton v-if="canUpdateChild" icon="i-lucide-link" color="neutral" variant="ghost" size="sm" class="cursor-default" :aria-label="t('transfer_payment.recommendation_schema_associate')" @click="onAddMember(setupForRow(row)!)" />
          <UButton icon="i-lucide-arrow-right" color="neutral" variant="ghost" size="sm" class="cursor-default" :aria-label="t('common.open')" @click="onEdit(setupForRow(row)!)" />
          <UButton v-if="canDeleteChild" icon="i-lucide-trash" color="error" variant="ghost" size="sm" class="cursor-default" :disabled="isDeleting" :aria-label="t('common.delete')" @click="onDelete(setupForRow(row)!)" />
        </div>
        <div v-else-if="isMemberGroup(row) && !row.original.isPlaceholder" class="flex items-center gap-2">
          <UButton icon="i-lucide-arrow-right" color="neutral" variant="ghost" size="sm" class="cursor-default" :aria-label="t('common.open')" @click="openSchemaEditor(row.original)" />
          <UButton v-if="canUpdateChild" icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" class="cursor-default" :aria-label="t('common.edit')" @click="onEditMember(row.original)" />
          <UButton v-if="canDeleteChild" icon="i-lucide-trash" color="error" variant="ghost" size="sm" class="cursor-default" :loading="deletingMemberId === row.original.id" :aria-label="t('common.delete')" @click="onDeleteMember(row.original)" />
        </div>
      </template>
    </CommonResourceLayoutCard>
    <TransferPaymentRecommendationSetupModal v-if="selected && canUpdateChild" v-model:open="isOpen" v-model:state="selected" :transfer-payment-id="transferPaymentId" :stream-id="streamId" :agency-id="agencyId" :capture-session="captureSession" :close-session="closeSession" @saved="refresh" />
    <TransferPaymentRecommendationSetupItemModal v-if="selectedItem && selectedItemParent && canUpdateChild" v-model:open="isItemModalOpen" v-model:state="selectedItem" :transfer-payment-id="transferPaymentId" :stream-id="streamId" :recommendation-setup-id="String(selectedItemParent.id)" :agency-id="agencyId" @saved="refresh" />
  </div>
</template>
