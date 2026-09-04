<script setup lang="ts">
import { getPaginationRowModel } from '@tanstack/table-core'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import { appRouteLocations } from '~/utils/route-locations'
import type { TransferPaymentProfileRow } from '~~/shared/types/transfer-payment-ui'
import type { ResourceTableStatus } from '~~/shared/types/resource-table'

const {
  profiles,
  totalRecords,
  loading = false,
  requestStatus,
  canCreate,
  canUpdate,
  canDelete
} = defineProps<{
  profiles: TransferPaymentProfileRow[]
  totalRecords: number
  loading?: boolean
  requestStatus?: ResourceTableStatus
  canCreate: boolean
  canUpdate: (profile: TransferPaymentProfileRow) => boolean
  canDelete: (profile: TransferPaymentProfileRow) => boolean
}>()

const emit = defineEmits<{
  (event: 'add' | 'wizard' | 'retry'): void
  (event: 'edit' | 'delete', profile: TransferPaymentProfileRow): void
}>()

const search = defineModel<string>('search', { default: '' })
const statusFilter = defineModel<string>('statusFilter', { default: 'all' })
const pagination = defineModel<{ pageIndex: number; pageSize: number }>('pagination', { required: true })

const { t } = useI18n()
const localePath = useLocalePath()
const { getBilingualValue } = useBilingualValue()
const getProfileActionTarget = (profile: TransferPaymentProfileRow) =>
  `${getBilingualValue(profile, 'egcs_tp_name', String(profile.id))} [${profile.id}]`
const availabilityItems = computed(() => [
  { label: t('common.all'), value: 'all' },
  { label: t('common.active'), value: 'active' },
  { label: t('common.inactive'), value: 'inactive' }
])

const columns: TableColumnInput<TransferPaymentProfileRow>[] = [
  { id: 'select' },
  { accessorKey: 'id', headerKey: 'common.id' },
  { accessorKey: 'egcs_tp_name_en', headerKey: 'transfer_payment.name_en' },
  { id: 'abbreviation', accessorKey: 'egcs_tp_abbreviation_en', headerKey: 'transfer_payment.abbreviation' },
  { id: 'agency', headerKey: 'transfer_payment.agency' },
  { accessorKey: 'egcs_tp_active', headerKey: 'transfer_payment.status' },
  { id: 'actions', headerKey: 'common.actions' }
]

const bilingualColumns: BilingualColumnConfig<TransferPaymentProfileRow>[] = [
  { id: 'abbreviation', accessorKey: { en: 'egcs_tp_abbreviation_en', fr: 'egcs_tp_abbreviation_fr' } }
]
</script>

<template>
  <CommonResourceLayoutPage
    v-model:search="search"
    v-model:status-filter="statusFilter"
    v-model:pagination="pagination"
    :data="profiles"
    :columns="columns"
    :bilingual-columns="bilingualColumns"
    :total-records="totalRecords"
    :loading="loading"
    :request-status="requestStatus"
    :pagination-options="{ getPaginationRowModel: getPaginationRowModel() }"
    :button-label="t('transfer_payment.new')"
    :show-button="canCreate"
    selectable
    v-bind="$attrs"
    @add="emit('add')"
    @retry="emit('retry')">
    <template #filters>
      <USelect v-model="statusFilter" :items="availabilityItems" :aria-label="t('common.status_filter')" class="min-w-40" />
    </template>
    <template #actions>
      <UButton
        v-if="canCreate"
        :label="t('transfer_payment.wizard_new')"
        icon="i-lucide-wand-2"
        color="neutral"
        variant="outline"
        @click="emit('wizard')" />
    </template>

    <template #id-cell="{ row }">
      <span class="font-mono text-xs font-bold text-zinc-400 dark:text-zinc-500">
        {{ row.original.id }}
      </span>
    </template>

    <template #egcs_tp_name_en-cell="{ row }">
      <CommonBilingualName
        :name-en="row.original.egcs_tp_name_en"
        :name-fr="row.original.egcs_tp_name_fr"
        :to="localePath(appRouteLocations.transferPaymentDetail(String(row.original.id)))" />
    </template>

    <template #agency-cell="{ row }">
      <span class="font-semibold text-zinc-700 dark:text-zinc-300">
        {{ getBilingualValue(row.original, 'agency_name', '') }}
      </span>
    </template>

    <template #egcs_tp_active-cell="{ row }">
      <CommonStatusBadge :variant="row.original.egcs_tp_active ? 'active' : 'inactive'" />
    </template>

    <template #actions-cell="{ row }">
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-edit-3"
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="!canUpdate(row.original)"
          :aria-label="t('common.edit_named', { name: getProfileActionTarget(row.original) })"
          @click="emit('edit', row.original)" />
        <UButton
          icon="i-lucide-trash"
          color="error"
          variant="ghost"
          size="sm"
          :disabled="!canDelete(row.original)"
          :aria-label="t('common.delete_named', { name: getProfileActionTarget(row.original) })"
          @click="emit('delete', row.original)" />
      </div>
    </template>
  </CommonResourceLayoutPage>
</template>
