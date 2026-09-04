<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc, @stylistic/comma-dangle -- local helpers are self-documenting; generic Vue arrows need parser-disambiguating commas */
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { useGroupedTableExpansion, type GroupedTableRow } from '~/composables/useGroupedTableExpansion'
import { useDeleteRequestToast } from '~/composables/useDeleteRequestToast'
import { useTableListState } from '~/composables/useTableListState'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import {
  AgencyCostCategoryLineItemSchema,
  AgencyCostCategorySchema,
  type AgencyCostCategory,
  type AgencyCostCategoryItem,
  type AgencyCostCategoryLineItem,
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
  costCategoryNameEn: string
  costCategoryNameFr: string
  lineItemId?: string
  lineItemNameEn: string
  lineItemNameFr: string
  isPlaceholder: boolean
}

type GroupedCostCategoryRow = GroupedTableRow<CostCategoryTableRow>

const COST_CATEGORY_GROUP_COLUMN_ID = 'costCategoryGroup'
const LIST_PAGE_SIZE = 100

const { agencyId, canCreate, canDelete } = defineProps<{
  agencyId: string
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}>()

const { t } = useI18n()
const { getGroupedDisclosureControlsId, getGroupedDisclosureContentId } = useGroupedDisclosureIds()
const { getBilingualValue } = useBilingualValue()
const toast = useToast()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()

const { search, pagination } = useTableListState()
const categories: Ref<AgencyCostCategoryItem[]> = ref([])
const lineItems: Ref<AgencyCostCategoryLineItemRow[]> = ref([])
const status: Ref<'idle' | 'pending' | 'success' | 'error'> = ref('idle')
const selectedCategory: Ref<Partial<AgencyCostCategory> | null> = ref(null)
const selectedLineItem: Ref<Partial<AgencyCostCategoryLineItem> | null> = ref(null)
const selectedLineItemCategoryId: Ref<string | null> = ref(null)
const isCategoryModalOpen: Ref<boolean> = ref(false)
const isLineItemModalOpen: Ref<boolean> = ref(false)
const isSavingCategory: Ref<boolean> = ref(false)
const isSavingLineItem: Ref<boolean> = ref(false)
let refreshGeneration = 0
const validateCategory = createValidator(AgencyCostCategorySchema)
const validateLineItem = createValidator(AgencyCostCategoryLineItemSchema)

const columns: TableColumnInput<CostCategoryTableRow>[] = [
  { id: COST_CATEGORY_GROUP_COLUMN_ID, accessorKey: COST_CATEGORY_GROUP_COLUMN_ID, headerKey: 'agency.tabs.cost_categories' },
  { id: 'name', accessorKey: 'lineItemNameEn', headerKey: 'agency.name_en' },
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

const postJson = async (url: string, body: unknown) => {
  const response = await fetch(getClientRequestUrl(url), {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    await throwFetchResponseError(response)
  }
}

const refresh = async () => {
  const generation = ++refreshGeneration
  const requestedAgencyId = agencyId

  try {
    status.value = 'pending'
    const [categoryItems, lineItemItems] = await Promise.all([
      getAllPages<AgencyCostCategoryItem>(`/api/agency/${requestedAgencyId}/cost-categories`),
      getAllPages<AgencyCostCategoryLineItemRow>(`/api/agency/${requestedAgencyId}/line-items`)
    ])

    if (generation !== refreshGeneration || requestedAgencyId !== agencyId) return
    categories.value = categoryItems
    lineItems.value = lineItemItems
    status.value = 'success'
  } catch (error: unknown) {
    if (generation !== refreshGeneration || requestedAgencyId !== agencyId) return
    status.value = 'error'
    showError(error)
  }
}

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
    costCategoryNameEn: category.egcs_ay_name_en,
    costCategoryNameFr: category.egcs_ay_name_fr,
    lineItemId: item.id,
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
  selectedCategory.value = {}
  isCategoryModalOpen.value = true
}

const openCreateLineItem = (categoryId: string) => {
  selectedLineItem.value = {}
  selectedLineItemCategoryId.value = categoryId
  isLineItemModalOpen.value = true
}

const closeCategoryModal = () => {
  isCategoryModalOpen.value = false
  selectedCategory.value = null
}

const closeLineItemModal = () => {
  isLineItemModalOpen.value = false
  selectedLineItem.value = null
  selectedLineItemCategoryId.value = null
}

watch(() => agencyId, () => {
  refreshGeneration += 1
  categories.value = []
  lineItems.value = []
  closeCategoryModal()
  closeLineItemModal()
  void refresh().catch(() => undefined)
}, { immediate: true })

const saveCategory = async () => {
  if (!selectedCategory.value || isSavingCategory.value) {
    return
  }

  let committed = false
  try {
    isSavingCategory.value = true
    await postJson(`/api/agency/${agencyId}/cost-categories`, selectedCategory.value)
    committed = true
    closeCategoryModal()
    toast.add({ title: t('common.success'), description: t('common.added_success'), color: 'success' })
    await refresh()
  } catch (error: unknown) {
    if (!committed) showError(error)
  } finally {
    isSavingCategory.value = false
  }
}

const saveLineItem = async () => {
  if (!selectedLineItem.value || !selectedLineItemCategoryId.value || isSavingLineItem.value) {
    return
  }

  let committed = false
  try {
    isSavingLineItem.value = true
    await postJson(`/api/agency/cost-categories/${selectedLineItemCategoryId.value}/line-items`, selectedLineItem.value)
    committed = true
    closeLineItemModal()
    toast.add({ title: t('common.success'), description: t('common.added_success'), color: 'success' })
    await refresh()
  } catch (error: unknown) {
    if (!committed) showError(error)
  } finally {
    isSavingLineItem.value = false
  }
}

const { confirmDeleteWithToast } = useDeleteRequestToast()

const deleteCategory = async (categoryId: string) => {
  await confirmDeleteWithToast(`/api/agency/cost-categories/${categoryId}`, {
    refresh,
    confirmOptions: {
      description: t('agency.delete_confirm')
    }
  })
}

const deleteLineItem = async (lineItemId: string) => {
  await confirmDeleteWithToast(`/api/agency/line-items/${lineItemId}`, {
    refresh,
    confirmOptions: {
      description: t('agency.delete_confirm')
    }
  })
}
</script>

<template>
  <div class="w-full">
    <CommonResourceTableFeedback
      :status="status"
      :has-stale-rows="categories.length > 0 || lineItems.length > 0"
      class="mb-4"
      @retry="refresh" />

    <CommonResourceLayoutCard
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

      <template #actions-cell="{ row }">
        <div class="flex items-center justify-end gap-2">
          <template v-if="isCostCategoryGroupRow(row as GroupedCostCategoryRow)">
            <UButton
              v-if="canCreate"
              icon="i-lucide-plus"
              color="primary"
              variant="ghost"
              size="sm"
              class="cursor-default"
              :aria-label="t('agency.add_line_item_named', { name: getBilingualValue({ egcs_ay_name_en: row.original.costCategoryNameEn, egcs_ay_name_fr: row.original.costCategoryNameFr }, 'egcs_ay_name', row.original.costCategoryId) })"
              @click="openCreateLineItem(row.original.costCategoryId)" />
            <UButton
              v-if="canDelete && getGroupedRowCount(row as GroupedCostCategoryRow) === 0"
              icon="i-lucide-trash"
              color="error"
              variant="ghost"
              size="sm"
              class="cursor-default"
              :aria-label="t('agency.delete_category_named', { name: getBilingualValue({ egcs_ay_name_en: row.original.costCategoryNameEn, egcs_ay_name_fr: row.original.costCategoryNameFr }, 'egcs_ay_name', row.original.costCategoryId) })"
              @click="deleteCategory(row.original.costCategoryId)" />
          </template>

          <template v-else-if="canDelete && !row.original.isPlaceholder && row.original.lineItemId">
            <UButton
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
    </CommonResourceLayoutCard>

    <UModal v-if="selectedCategory" v-model:open="isCategoryModalOpen" :title="t('agency.tabs.cost_categories')">
      <template #body>
        <UForm :state="selectedCategory" :validate="validateCategory" :validate-on="[]" class="space-y-4" @submit="saveCategory">
          <UFormField :label="t('agency.name_en')" name="egcs_ay_name_en">
            <UInput v-model="selectedCategory.egcs_ay_name_en" />
          </UFormField>
          <UFormField :label="t('agency.name_fr')" name="egcs_ay_name_fr">
            <UInput v-model="selectedCategory.egcs_ay_name_fr" />
          </UFormField>

          <div class="flex justify-end gap-2 pt-4">
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="closeCategoryModal" />
            <CommonSaveButton :label="t('common.add')" :loading="isSavingCategory" :disabled="isSavingCategory" />
          </div>
        </UForm>
      </template>
    </UModal>

    <UModal v-if="selectedLineItem" v-model:open="isLineItemModalOpen" :title="t('agency.tabs.budget_line_items')">
      <template #body>
        <UForm :state="selectedLineItem" :validate="validateLineItem" :validate-on="[]" class="space-y-4" @submit="saveLineItem">
          <UFormField :label="t('agency.name_en')" name="egcs_ay_name_en">
            <UInput v-model="selectedLineItem.egcs_ay_name_en" />
          </UFormField>
          <UFormField :label="t('agency.name_fr')" name="egcs_ay_name_fr">
            <UInput v-model="selectedLineItem.egcs_ay_name_fr" />
          </UFormField>

          <div class="flex justify-end gap-2 pt-4">
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="closeLineItemModal" />
            <CommonSaveButton :label="t('common.add')" :loading="isSavingLineItem" :disabled="isSavingLineItem" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
