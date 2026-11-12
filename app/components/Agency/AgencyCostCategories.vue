<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc, @stylistic/comma-dangle -- local helpers are self-documenting; generic Vue arrows need parser-disambiguating commas */
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { useGroupedTableExpansion, type GroupedTableRow } from '~/composables/useGroupedTableExpansion'
import { useDeleteRequestToast } from '~/composables/useDeleteRequestToast'
import { useTableListState } from '~/composables/useTableListState'
import { useCrudModal, useCrudModalPending } from '~/composables/useCrudModal'
import { useActionContext } from '~/composables/useActionContext'
import { useFormSession } from '~/composables/useFormSession'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import {
  AgencyCostCategoryLineItemSchema,
  AgencyCostCategorySchema,
  type AgencyCostCategoryItem,
  type AgencyCostCategoryLineItemItem
} from '~~/shared/types/schemas'

type AgencyCostCategoryLineItemRow = AgencyCostCategoryLineItemItem & {
  egcs_ay_organizationcostcategory: string
}

type PaginatedList<T> = {
  items: T[]
  total: number
}

type CostCategoryTableRow = {
  id: string
  costCategoryGroup: string
  costCategoryId: string
  costCategoryActive: boolean
  costCategoryNameEn: string
  costCategoryNameFr: string
  lineItemId?: string
  lineItemActive?: boolean
  lineItemNameEn: string
  lineItemNameFr: string
  isPlaceholder: boolean
}

type GroupedCostCategoryRow = GroupedTableRow<CostCategoryTableRow>

const COST_CATEGORY_GROUP_COLUMN_ID = 'costCategoryGroup'
const LIST_PAGE_SIZE = 100

const { agencyId, canCreate, canUpdate, canDelete } = defineProps<{
  agencyId: string
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}>()

const { t } = useI18n()
const { getGroupedDisclosureControlsId, getGroupedDisclosureContentId } = useGroupedDisclosureIds()
const { getBilingualValue } = useBilingualValue()
const toast = useLocalizedToast()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()

const { search, pagination } = useTableListState()
const categories: Ref<AgencyCostCategoryItem[]> = ref([])
const lineItems: Ref<AgencyCostCategoryLineItemRow[]> = ref([])
const status: Ref<'idle' | 'pending' | 'success' | 'error'> = ref('idle')
const categoryModal = useCrudModal<AgencyCostCategoryItem>({
  createState: () => ({ egcs_ay_active: true }),
  updateState: item => ({ ...item })
})
const lineItemModal = useCrudModal<AgencyCostCategoryLineItemRow>({
  createState: () => ({
    egcs_ay_active: true,
    egcs_ay_calculationmode: 'manual',
    egcs_ay_sourcecategory: null,
    egcs_ay_percentage: null,
    egcs_ay_allowpercentageoverride: false
  }),
  updateState: item => ({ ...item })
})
const { selected: selectedCategory, isOpen: isCategoryModalOpen } = categoryModal
const { selected: selectedLineItem, isOpen: isLineItemModalOpen } = lineItemModal
const categoryPending = useCrudModalPending(categoryModal.captureSession)
const lineItemPending = useCrudModalPending(lineItemModal.captureSession)
const isSavingCategory = categoryPending.isPending
const isSavingLineItem = lineItemPending.isPending
const selectedLineItemCategoryId: Ref<string | null> = ref(null)
type PageContext = { kind: 'active'; agencyId: string } | { kind: 'disposed' }
const pageContext: Ref<PageContext> = shallowRef({ kind: 'active', agencyId })
const ownsContext = (context: PageContext) => context.kind === 'active' && pageContext.value === context
let refreshGeneration = 0
const categoryCreateContext = useActionContext({
  identity: [() => agencyId],
  authority: () => canCreate
})
const categoryUpdateContext = useActionContext({
  identity: [() => agencyId],
  authority: () => canUpdate,
  eligible: () => categories.value.some(row => row.id === selectedCategory.value?.id)
})
const categoryActionContext = () => selectedCategory.value?.id ? categoryUpdateContext : categoryCreateContext
const lineItemCreateContext = useActionContext({
  identity: [() => agencyId],
  authority: () => canCreate,
  eligible: () => Boolean(selectedLineItemCategoryId.value) && categories.value.some(row => row.id === selectedLineItemCategoryId.value)
})
const lineItemUpdateContext = useActionContext({
  identity: [() => agencyId],
  authority: () => canUpdate,
  eligible: () => lineItems.value.some(row => row.id === selectedLineItem.value?.id) && categories.value.some(row => row.id === selectedLineItemCategoryId.value)
})
const lineItemActionContext = () => selectedLineItem.value?.id ? lineItemUpdateContext : lineItemCreateContext
const deleteActionContext = useActionContext({ identity: [() => agencyId], authority: () => canDelete })
const validateCategory = createValidator(AgencyCostCategorySchema)
const validateLineItem = createValidator(AgencyCostCategoryLineItemSchema)
const selectedLineItemCategoryName = computed(() => {
  const category = categories.value.find(item => item.id === selectedLineItemCategoryId.value)
  return category ? getBilingualValue(category, 'egcs_ay_name', category.id) : ''
})
const lineItemModalTitle = computed(() => selectedLineItem.value?.id
  ? t('agency.tabs.budget_line_items')
  : selectedLineItemCategoryName.value
    ? t('agency.add_line_item_named', { name: selectedLineItemCategoryName.value })
    : t('agency.tabs.budget_line_items'))

const columns: TableColumnInput<CostCategoryTableRow>[] = [
  { id: COST_CATEGORY_GROUP_COLUMN_ID, accessorKey: COST_CATEGORY_GROUP_COLUMN_ID, headerKey: 'agency.tabs.cost_categories' },
  { id: 'name', accessorKey: 'lineItemNameEn', headerKey: 'agency.name_en' },
  { id: 'availability', headerKey: 'common.status' },
  { id: 'actions', headerKey: 'common.actions' }
]

const getJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(getClientRequestUrl(url))
  if (!response.ok) {
    await throwFetchResponseError(response)
  }

  return await response.json() as T
}

const getAllPages = async <T,>(url: string): Promise<T[]> => {
  const items: T[] = []
  let page = 1

  while (true) {
    const separator = url.includes('?') ? '&' : '?'
    const response = await getJson<PaginatedList<T>>(`${url}${separator}page=${page}&limit=${LIST_PAGE_SIZE}`)
    const pageItems = Array.isArray(response.items) ? response.items : []
    const total = Number.isFinite(response.total) ? response.total : items.length + pageItems.length
    items.push(...pageItems)

    if (items.length >= total || pageItems.length < LIST_PAGE_SIZE) {
      return items
    }

    page += 1
  }
}

const saveJson = async (url: string, method: 'POST' | 'PATCH', body: unknown) => {
  const response = await fetch(getClientRequestUrl(url), {
    method,
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    await throwFetchResponseError(response)
  }
}

const refreshForOwner = async (shouldReportError: () => boolean) => {
  const context = pageContext.value
  if (!ownsContext(context)) return
  const generation = ++refreshGeneration
  const requestedAgencyId = agencyId

  try {
    status.value = 'pending'
    const [categoryItems, lineItemItems] = await Promise.all([
      getAllPages<AgencyCostCategoryItem>(`/api/agency/${requestedAgencyId}/cost-categories`),
      getAllPages<AgencyCostCategoryLineItemRow>(`/api/agency/${requestedAgencyId}/line-items`)
    ])

    if (!ownsContext(context) || generation !== refreshGeneration || requestedAgencyId !== agencyId) return
    categories.value = categoryItems
    lineItems.value = lineItemItems
    status.value = 'success'
  } catch (error: unknown) {
    if (!ownsContext(context) || generation !== refreshGeneration || requestedAgencyId !== agencyId) return
    status.value = 'error'
    if (shouldReportError()) showError(error)
  }
}
const refresh = () => refreshForOwner(() => true)

const normalizedSearch = computed(() => search.value.trim().toLowerCase())

const lineItemMatchesSearch = (item: AgencyCostCategoryLineItemRow): boolean => [
  item.egcs_ay_name_en,
  item.egcs_ay_name_fr
].some(value => value.toLowerCase().includes(normalizedSearch.value))

const categoryMatchesSearch = (category: AgencyCostCategoryItem): boolean => (
  category.egcs_ay_name_en.toLowerCase().includes(normalizedSearch.value)
  || category.egcs_ay_name_fr.toLowerCase().includes(normalizedSearch.value)
)

const lineItemsByCategory = computed(() => {
  const grouped = new Map<string, AgencyCostCategoryLineItemRow[]>()

  for (const item of lineItems.value) {
    const key = item.egcs_ay_organizationcostcategory
    grouped.set(key, [...(grouped.get(key) ?? []), item])
  }

  return grouped
})

const filteredCategories = computed(() => {
  if (normalizedSearch.value.length === 0) {
    return categories.value
  }

  const matchingCategoryIds = new Set(
    lineItems.value
      .filter(lineItemMatchesSearch)
      .map(item => item.egcs_ay_organizationcostcategory)
  )

  return categories.value.filter(category => (
    matchingCategoryIds.has(category.id)
    || categoryMatchesSearch(category)
  ))
})

const tableRows = computed<CostCategoryTableRow[]>(() => filteredCategories.value.flatMap(category => {
  const categoryLineItems = lineItemsByCategory.value.get(category.id) ?? []
  const rowsForCategory = normalizedSearch.value.length === 0 || categoryMatchesSearch(category)
    ? categoryLineItems
    : categoryLineItems.filter(lineItemMatchesSearch)

  if (rowsForCategory.length === 0) {
    const placeholderRows: CostCategoryTableRow[] = [{
      id: `placeholder:${category.id}`,
      costCategoryGroup: category.id,
      costCategoryId: category.id,
      costCategoryActive: category.egcs_ay_active !== false,
      costCategoryNameEn: category.egcs_ay_name_en,
      costCategoryNameFr: category.egcs_ay_name_fr,
      lineItemNameEn: '',
      lineItemNameFr: '',
      isPlaceholder: true
    }]

    return placeholderRows
  }

  return rowsForCategory.map<CostCategoryTableRow>(item => ({
    id: item.id,
    costCategoryGroup: category.id,
    costCategoryId: category.id,
    costCategoryActive: category.egcs_ay_active !== false,
    costCategoryNameEn: category.egcs_ay_name_en,
    costCategoryNameFr: category.egcs_ay_name_fr,
    lineItemId: item.id,
    lineItemActive: item.egcs_ay_active !== false,
    lineItemNameEn: item.egcs_ay_name_en,
    lineItemNameFr: item.egcs_ay_name_fr,
    isPlaceholder: false
  }))
}))

const realLineItemRows = computed(() => tableRows.value.filter(row => !row.isPlaceholder))
const {
  expandedRows,
  grouping,
  columnVisibility,
  groupingOptions,
  expandedOptions,
  isGroupRow,
  getGroupedRowCount,
  canExpandGroupedRow,
  updateExpandedRows
} = useGroupedTableExpansion<CostCategoryTableRow>({
  rows: tableRows,
  groups: [{
    id: COST_CATEGORY_GROUP_COLUMN_ID,
    getValue: row => row.costCategoryId
  }],
  isPlaceholder: row => row.isPlaceholder
})
const isCostCategoryGroupRow = (row: GroupedCostCategoryRow) => isGroupRow(row, COST_CATEGORY_GROUP_COLUMN_ID)

const openCreateCategory = () => {
  categoryModal.openCreate()
}

const openEditCategory = (categoryId: string) => {
  const category = categories.value.find(item => item.id === categoryId)
  if (!canUpdate || !category) return
  categoryModal.openUpdate(category)
}

const openEditLineItem = (lineItemId: string) => {
  const lineItem = lineItems.value.find(item => item.id === lineItemId)
  if (!canUpdate || !lineItem) return
  lineItemModal.openUpdate(lineItem)
  selectedLineItemCategoryId.value = lineItem.egcs_ay_organizationcostcategory
}

const openCreateLineItem = (categoryId: string) => {
  lineItemModal.openCreate()
  selectedLineItemCategoryId.value = categoryId
}

const closeCategoryModal = () => {
  categoryModal.close()
}

const closeLineItemModal = () => {
  lineItemModal.close()
  selectedLineItemCategoryId.value = null
}

watch(() => agencyId, () => {
  pageContext.value = { kind: 'active', agencyId }
  refreshGeneration += 1
  categories.value = []
  lineItems.value = []
  closeCategoryModal()
  closeLineItemModal()
  void refresh().catch(() => undefined)
}, { immediate: true, flush: 'sync' })
onScopeDispose(() => {
  pageContext.value = { kind: 'disposed' }
  refreshGeneration += 1
  closeCategoryModal()
  closeLineItemModal()
})

const saveCategory = async () => {
  const operation = categoryActionContext().capture()
  if (!operation?.canDispatch()) return
  const context = pageContext.value
  const session = categoryModal.captureSession()
  const requestedState = selectedCategory.value
  if (context.kind !== 'active' || !ownsContext(context) || session === null || !requestedState) return
  const updating = Boolean(requestedState.id)
  if ((updating ? !canUpdate : !canCreate) || !categoryPending.begin(session)) return
  let committed = false
  let closed = false
  const ownsFeedback = () => operation.isCurrent() && ownsContext(context) && (
    categoryModal.isCurrentSession(session) || (closed && categoryModal.isLatestSession(session))
  )
  try {
    await saveJson(
      updating ? `/api/agency/cost-categories/${requestedState.id}` : `/api/agency/${context.agencyId}/cost-categories`,
      updating ? 'PATCH' : 'POST',
      requestedState
    )
    committed = true
    if (!operation.isCurrent() || !ownsContext(context)) return
    closed = categoryModal.closeSession(session)
    if (ownsFeedback()) {
      toast.add({ title: toast.localized('common.success'), description: toast.localized(updating ? 'common.updated_success' : 'common.added_success'), color: 'success' })
    }
    await refreshForOwner(ownsFeedback)
  } catch (error: unknown) {
    if (!committed && ownsFeedback()) showError(error)
  } finally {
    categoryPending.end(session)
  }
}

const saveLineItem = async () => {
  const operation = lineItemActionContext().capture()
  if (!operation?.canDispatch()) return
  const context = pageContext.value
  const session = lineItemModal.captureSession()
  const requestedState = selectedLineItem.value
  const requestedCategoryId = selectedLineItemCategoryId.value
  if (!ownsContext(context) || session === null || !requestedState || !requestedCategoryId) return
  const updating = Boolean(requestedState.id)
  if ((updating ? !canUpdate : !canCreate) || !lineItemPending.begin(session)) return
  let committed = false
  let closed = false
  const ownsFeedback = () => operation.isCurrent() && ownsContext(context) && (
    lineItemModal.isCurrentSession(session) || (closed && lineItemModal.isLatestSession(session))
  )
  try {
    await saveJson(
      updating ? `/api/agency/line-items/${requestedState.id}` : `/api/agency/cost-categories/${requestedCategoryId}/line-items`,
      updating ? 'PATCH' : 'POST',
      requestedState
    )
    committed = true
    if (!operation.isCurrent() || !ownsContext(context)) return
    closed = lineItemModal.closeSession(session)
    if (closed) selectedLineItemCategoryId.value = null
    if (ownsFeedback()) {
      toast.add({ title: toast.localized('common.success'), description: toast.localized(updating ? 'common.updated_success' : 'common.added_success'), color: 'success' })
    }
    await refreshForOwner(ownsFeedback)
  } catch (error: unknown) {
    if (!committed && ownsFeedback()) showError(error)
  } finally {
    lineItemPending.end(session)
  }
}

const categoryFormSession = useFormSession({ owner: categoryModal, action: { kind: 'remote', context: categoryActionContext }, submit: saveCategory })
const lineItemFormSession = useFormSession({ owner: lineItemModal, action: { kind: 'remote', context: lineItemActionContext }, submit: saveLineItem })

const { confirmDeleteWithToast } = useDeleteRequestToast()

const deleteCategory = async (categoryId: string) => {
  const context = pageContext.value
  await confirmDeleteWithToast(`/api/agency/cost-categories/${categoryId}`, {
    operation: deleteActionContext.capture(),
    target: { id: categoryId, resolve: () => categories.value.find(row => row.id === categoryId), eligible: () => canDelete },
    refresh,
    shouldProceed: () => ownsContext(context) && canDelete,
    confirmOptions: {
      description: t('agency.delete_confirm')
    }
  })
}

const deleteLineItem = async (lineItemId: string) => {
  const context = pageContext.value
  await confirmDeleteWithToast(`/api/agency/line-items/${lineItemId}`, {
    operation: deleteActionContext.capture(),
    target: { id: lineItemId, resolve: () => lineItems.value.find(row => row.id === lineItemId), eligible: () => canDelete },
    refresh,
    shouldProceed: () => ownsContext(context) && canDelete,
    confirmOptions: {
      description: t('agency.delete_confirm')
    }
  })
}
</script>

<template>
  <div class="w-full" data-field-scope="agency.cost-categories">
    <CommonResourceTableFeedback
      :status="status"
      :has-stale-rows="categories.length > 0 || lineItems.length > 0"
      class="mb-4"
      @retry="refresh" />

    <CommonResourceLayout
      v-model:search="search"
      v-model:pagination="pagination"
      :data="tableRows"
      :columns="columns"
      :grouping="grouping"
      :grouping-options="groupingOptions"
      :expanded-options="expandedOptions"
      :column-visibility="columnVisibility"
      :expanded="expandedRows"
      :total-records="tableRows.length"
      :loading="status === 'pending'"
      :button-label="t('common.add')"
      :show-button="canCreate"
      @add="openCreateCategory"
      @update:expanded="updateExpandedRows">
      <template #name-cell="{ row }">
        <div :id="getGroupedDisclosureContentId(row as GroupedCostCategoryRow)" class="contents">
          <div v-if="isCostCategoryGroupRow(row as GroupedCostCategoryRow)" class="flex w-full items-center gap-3 py-1">
            <CommonGroupedDisclosureButton
              v-if="canExpandGroupedRow(row as GroupedCostCategoryRow)"
              class="group flex min-w-0 items-center gap-3 text-left"
              :expanded="row.getIsExpanded?.() === true"
              :controls="getGroupedDisclosureControlsId(row.id)"
              :label-en="row.original.costCategoryNameEn"
              :label-fr="row.original.costCategoryNameFr"
              @toggle="row.toggleExpanded?.()">
              <UIcon
                :name="row.getIsExpanded?.() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                class="size-4 text-zinc-400 transition-colors group-hover:text-primary" />
              <span class="[&_p:first-child]:transition-colors group-hover:[&_p:first-child]:text-primary">
                <CommonBilingualName
                  :name-en="row.original.costCategoryNameEn"
                  :name-fr="row.original.costCategoryNameFr" />
              </span>
              <CommonStatusBadge variant="count" size="sm" :label="String(getGroupedRowCount(row as GroupedCostCategoryRow))" />
            </CommonGroupedDisclosureButton>
            <div v-else class="flex min-w-0 items-center gap-3">
              <span class="ml-7">
                <CommonBilingualName
                  :name-en="row.original.costCategoryNameEn"
                  :name-fr="row.original.costCategoryNameFr" />
              </span>
              <CommonStatusBadge variant="count" size="sm" :label="String(getGroupedRowCount(row as GroupedCostCategoryRow))" />
            </div>
          </div>

          <div
            v-else-if="row.original.isPlaceholder"
            class="flex items-center gap-3 py-3 pl-8 text-sm text-zinc-500 dark:text-zinc-400">
            <UIcon name="i-lucide-corner-down-right" class="size-4 text-zinc-400" />
            <span>{{ t('common.no_records') }}</span>
          </div>

          <div v-else class="flex items-center gap-3 py-1 pl-8">
            <UIcon name="i-lucide-corner-down-right" class="size-4 text-zinc-400" />
            <span class="min-w-0">
              <CommonBilingualName
                :name-en="row.original.lineItemNameEn"
                :name-fr="row.original.lineItemNameFr" />
            </span>
          </div>
        </div>
      </template>

      <template #availability-cell="{ row }">
        <CommonStatusBadge
          v-if="isCostCategoryGroupRow(row as GroupedCostCategoryRow) || !row.original.isPlaceholder"
          :variant="row.original.costCategoryActive && (isCostCategoryGroupRow(row as GroupedCostCategoryRow) || row.original.lineItemActive !== false) ? 'enabled' : 'disabled'" />
      </template>

      <template #actions-cell="{ row }">
        <div class="flex items-center justify-end gap-2">
          <template v-if="isCostCategoryGroupRow(row as GroupedCostCategoryRow)">
            <CommonActionButton
              v-if="canUpdate"
              icon="i-lucide-edit-3"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="t('common.edit')"
              @click="openEditCategory(row.original.costCategoryId)" />
            <CommonActionButton
              v-if="canCreate"
              icon="i-lucide-plus"
              color="primary"
              variant="ghost"
              size="sm"
              class="cursor-default"
              :aria-label="t('agency.add_line_item_named', { name: getBilingualValue({ egcs_ay_name_en: row.original.costCategoryNameEn, egcs_ay_name_fr: row.original.costCategoryNameFr }, 'egcs_ay_name', row.original.costCategoryId) })"
              @click="openCreateLineItem(row.original.costCategoryId)" />
            <CommonActionButton
              v-if="canDelete && getGroupedRowCount(row as GroupedCostCategoryRow) === 0"
              icon="i-lucide-trash"
              color="error"
              variant="ghost"
              size="sm"
              class="cursor-default"
              :aria-label="t('agency.delete_category_named', { name: getBilingualValue({ egcs_ay_name_en: row.original.costCategoryNameEn, egcs_ay_name_fr: row.original.costCategoryNameFr }, 'egcs_ay_name', row.original.costCategoryId) })"
              @click="deleteCategory(row.original.costCategoryId)" />
          </template>

          <template v-else-if="!row.original.isPlaceholder && row.original.lineItemId">
            <CommonActionButton
              v-if="canUpdate"
              icon="i-lucide-edit-3"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="t('common.edit')"
              @click="openEditLineItem(row.original.lineItemId)" />
            <CommonActionButton
              v-if="canDelete"
              icon="i-lucide-trash"
              color="error"
              variant="ghost"
              size="sm"
              class="cursor-default"
              :aria-label="t('agency.delete_line_item_named', { name: getBilingualValue({ egcs_ay_name_en: row.original.lineItemNameEn, egcs_ay_name_fr: row.original.lineItemNameFr }, 'egcs_ay_name', row.original.lineItemId) })"
              @click="deleteLineItem(row.original.lineItemId)" />
          </template>

          <template v-else>
            &nbsp;
          </template>
        </div>
      </template>

      <template #footer-left>
        {{ categories.length }} {{ t('common.records') }}
        <span class="mx-2 text-zinc-300 dark:text-zinc-700">/</span>
        {{ realLineItemRows.length }} {{ t('agency.tabs.budget_line_items') }}
      </template>
    </CommonResourceLayout>

    <UModal v-if="selectedCategory" v-model:open="isCategoryModalOpen" :title="t('agency.tabs.cost_categories')">
      <template #body>
        <UForm v-bind="categoryFormSession" data-field-scope="agency.cost-category" :state="selectedCategory" :validate="validateCategory" :validate-on="[]" class="space-y-4">
          <UFormField :label="t('agency.name_en')" name="egcs_ay_name_en">
            <UInput v-model="selectedCategory.egcs_ay_name_en" />
          </UFormField>
          <UFormField :label="t('agency.name_fr')" name="egcs_ay_name_fr">
            <UInput v-model="selectedCategory.egcs_ay_name_fr" />
          </UFormField>

          <UFormField name="egcs_ay_active" :description="t('agency.cost_category_active_help')">
            <USwitch v-model="selectedCategory.egcs_ay_active" :label="t('common.active')" />
          </UFormField>

          <div class="flex justify-end gap-2 pt-4">
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="closeCategoryModal" />
            <CommonSaveButton :label="t(selectedCategory.id ? 'common.update' : 'common.add')" :loading="isSavingCategory" :disabled="isSavingCategory" />
          </div>
        </UForm>
      </template>
    </UModal>

    <UModal v-if="selectedLineItem" v-model:open="isLineItemModalOpen" :title="lineItemModalTitle">
      <template #body>
        <UForm v-bind="lineItemFormSession" data-field-scope="agency.cost-line-item" :state="selectedLineItem" :validate="validateLineItem" :validate-on="[]" class="space-y-4">
          <p v-if="selectedLineItemCategoryName" class="text-sm text-muted">
            {{ t('agency.budget_category_context', { name: selectedLineItemCategoryName }) }}
          </p>
          <UFormField :label="t('agency.name_en')" name="egcs_ay_name_en">
            <UInput v-model="selectedLineItem.egcs_ay_name_en" />
          </UFormField>
          <UFormField :label="t('agency.name_fr')" name="egcs_ay_name_fr">
            <UInput v-model="selectedLineItem.egcs_ay_name_fr" />
          </UFormField>

          <UFormField name="egcs_ay_active" :description="t('agency.cost_line_active_help')">
            <USwitch v-model="selectedLineItem.egcs_ay_active" :label="t('common.active')" />
          </UFormField>

          <AgencyBudgetCalculationFields
            v-if="selectedLineItemCategoryId"
            v-model="selectedLineItem"
            data-field-container="Composite editor; its individual field declarations own their identities."
            :category-id="selectedLineItemCategoryId" />

          <div class="flex justify-end gap-2 pt-4">
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="closeLineItemModal" />
            <CommonSaveButton :label="t(selectedLineItem.id ? 'common.update' : 'common.add')" :loading="isSavingLineItem" :disabled="isSavingLineItem" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
