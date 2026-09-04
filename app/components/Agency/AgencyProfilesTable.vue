<script setup lang="ts">
import { getPaginationRowModel } from '@tanstack/table-core'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import { appRouteLocations } from '~/utils/route-locations'
import type { AgencyProfileItem } from '~~/shared/types/schemas'
import type { ResourceTableStatus } from '~~/shared/types/resource-table'

const {
  agencies,
  totalRecords,
  loading = false,
  requestStatus,
  canCreate,
  canUpdate
} = defineProps<{
  agencies: AgencyProfileItem[]
  totalRecords: number
  loading?: boolean
  requestStatus?: ResourceTableStatus
  canCreate: boolean
  canUpdate: (agency: AgencyProfileItem) => boolean
}>()

const emit = defineEmits<{
  (event: 'add' | 'retry'): void
  (event: 'edit', agency: AgencyProfileItem): void
}>()

const search = defineModel<string>('search', { default: '' })
const statusFilter = defineModel<string>('statusFilter', { default: 'all' })
const pagination = defineModel<{ pageIndex: number; pageSize: number }>('pagination', { required: true })

const { t } = useI18n()
const localePath = useLocalePath()
const { getBilingualValue } = useBilingualValue()
const availabilityItems = computed(() => [
  { label: t('common.all'), value: 'all' },
  { label: t('common.active'), value: 'active' },
  { label: t('common.inactive'), value: 'inactive' }
])

const columns: TableColumnInput<AgencyProfileItem>[] = [
  { id: 'select' },
  { accessorKey: 'id', headerKey: 'common.id' },
  { id: 'abbreviation', header: '' },
  { id: 'name', accessorKey: 'egcs_ay_name_en', headerKey: 'agency.name_en' },
  { accessorKey: 'egcs_ay_agencyfinancialsystemid', headerKey: 'agency.financial_id' },
  { accessorKey: 'egcs_ay_active', headerKey: 'common.status' },
  { id: 'actions', headerKey: 'common.actions' }
]

const bilingualColumns: BilingualColumnConfig<AgencyProfileItem>[] = [
  {
    id: 'name',
    accessorKey: { en: 'egcs_ay_name_en', fr: 'egcs_ay_name_fr' }
  }
]
</script>

<template>
  <CommonResourceLayoutPage
    v-model:search="search"
    v-model:status-filter="statusFilter"
    v-model:pagination="pagination"
    :data="agencies"
    :columns="columns"
    :bilingual-columns="bilingualColumns"
    :total-records="totalRecords"
    :loading="loading"
    :request-status="requestStatus"
    :pagination-options="{ getPaginationRowModel: getPaginationRowModel() }"
    :button-label="t('agency.new')"
    :show-button="canCreate"
    selectable
    v-bind="$attrs"
    @add="emit('add')"
    @retry="emit('retry')">
    <template #filters>
      <USelect v-model="statusFilter" :items="availabilityItems" :aria-label="t('common.status_filter')" class="min-w-40" />
    </template>
    <template #id-cell="{ row }">
      <span class="font-mono text-xs font-bold text-zinc-400 dark:text-zinc-500">
        {{ row.original.id }}
      </span>
    </template>

    <template #abbreviation-cell="{ row }">
      <div
        class="bg-primary/10 border-primary/10 flex h-10 min-w-10 shrink-0 items-center justify-center rounded-lg border px-2 shadow-sm">
        <span class="text-primary text-xs font-black tracking-tighter">
          {{ getBilingualValue(row.original, 'egcs_ay_abbreviation', '??').toUpperCase() }}
        </span>
      </div>
    </template>

    <template #name-cell="{ row }">
      <CommonBilingualName
        :name-en="row.original.egcs_ay_name_en"
        :name-fr="row.original.egcs_ay_name_fr"
        :to="localePath(appRouteLocations.agencyDetail(String(row.original.id)))" />
    </template>

    <template #egcs_ay_agencyfinancialsystemid-cell="{ row }">
      <div class="flex flex-col">
        <span class="text-sm font-bold text-zinc-900 dark:text-white">
          {{ row.original.egcs_ay_agencyfinancialsystemid }}
        </span>
        <span class="text-xs font-black tracking-widest text-zinc-400 uppercase">FSID</span>
      </div>
    </template>

    <template #egcs_ay_active-cell="{ row }">
      <CommonStatusBadge :variant="row.original.egcs_ay_active ? 'active' : 'inactive'" />
    </template>

    <template #actions-cell="{ row }">
      <div class="flex items-center gap-2">
        <UButton
          v-if="canUpdate(row.original)"
          icon="i-lucide-edit-3"
          color="neutral"
          variant="soft"
          size="sm"
          :aria-label="t('agency.edit_named', { name: getBilingualValue(row.original, 'egcs_ay_name', String(row.original.id)) })"
          @click.stop="emit('edit', row.original)" />
      </div>
    </template>
  </CommonResourceLayoutPage>
</template>
