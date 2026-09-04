<script setup lang="ts">
import { AgencyCostCategoryLineItemSchema, AgencyCostCategoryLineItemInitial, type AgencyCostCategoryLineItemItem } from '~~/shared/types/schemas'
import type { TableColumnInput } from '~/composables/useTableColumns'

const { t } = useI18n()

const {
  categoryId,
  canCreate = false,
  canUpdate = false,
  canDelete = false
} = defineProps<{
  categoryId: string
  canCreate?: boolean
  canUpdate?: boolean
  canDelete?: boolean
}>()

const columns: TableColumnInput<AgencyCostCategoryLineItemItem>[] = [
  { id: 'name', headerKey: 'agency.tabs.budget_line_items' },
  { id: 'actions', headerKey: 'common.actions' }
]

const initialNewItem = { ...AgencyCostCategoryLineItemInitial }
</script>

<template>
  <CommonResourceCrud
    :title="t('agency.tabs.budget_line_items')"
    icon="i-lucide-list-checks"
    :fetch-url="`/api/agency/cost-categories/${categoryId}/line-items`"
    :post-url="canCreate ? `/api/agency/cost-categories/${categoryId}/line-items` : undefined"
    :delete-url-base="canDelete ? '/api/agency/line-items' : undefined"
    :can-create="canCreate"
    :can-update="canUpdate"
    :can-delete="canDelete"
    :schema="AgencyCostCategoryLineItemSchema"
    :initial-new-item="initialNewItem"
    :columns="columns"
    table-class="ring-default overflow-hidden rounded-lg bg-white shadow-sm ring-1 dark:bg-zinc-900">
    <template #name-cell="{ row }">
      <CommonBilingualName :name-en="row.original.egcs_ay_name_en" :name-fr="row.original.egcs_ay_name_fr" />
    </template>

    <template #form="{ state }">
      <UFormField :label="t('agency.name_en')" name="egcs_ay_name_en">
        <UInput v-model="state.egcs_ay_name_en" />
      </UFormField>
      <UFormField :label="t('agency.name_fr')" name="egcs_ay_name_fr">
        <UInput v-model="state.egcs_ay_name_fr" />
      </UFormField>
    </template>
  </CommonResourceCrud>
</template>
