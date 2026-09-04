<script setup lang="ts">
import { AgencyFiscalYearSchema, createAgencyFiscalYearInitial, type AgencyFiscalYearItem } from '~~/shared/types/schemas'
import type { TableColumnInput } from '~/composables/useTableColumns'

const { t } = useI18n()
const { formatDate } = useDateHelpers()

const { agencyId, canCreate, canUpdate, canDelete } = defineProps<{ agencyId: string, canCreate: boolean, canUpdate: boolean, canDelete: boolean }>()

const columns: TableColumnInput<AgencyFiscalYearItem>[] = [
  { accessorKey: 'egcs_ay_fiscalyeardisplay', headerKey: 'common.display' },
  { accessorKey: 'egcs_ay_fiscalyear', headerKey: 'common.year' },
  { accessorKey: 'egcs_ay_startdate', headerKey: 'common.start_date' },
  { accessorKey: 'egcs_ay_enddate', headerKey: 'common.end_date' },
  { id: 'actions', headerKey: 'common.actions' }
]

const initialNewItem = createAgencyFiscalYearInitial()
</script>

<template>
  <CommonResourceCrud
    :title="t('agency.tabs.fiscal_years')"
    icon="i-lucide-calendar"
    :fetch-url="`/api/agency/${agencyId}/fiscal-years`"
    :post-url="canCreate ? `/api/agency/${agencyId}/fiscal-years` : undefined"
    :delete-url-base="canDelete ? '/api/agency/fiscal-years' : undefined"
    :can-create="canCreate"
    :can-update="canUpdate"
    :can-delete="canDelete"
    :schema="AgencyFiscalYearSchema"
    :initial-new-item="initialNewItem"
    :columns="columns">
    <template #egcs_ay_fiscalyeardisplay-cell="{ row }">
      <span class="font-bold text-zinc-900 dark:text-white">{{ row.original.egcs_ay_fiscalyeardisplay }}</span>
    </template>

    <template #egcs_ay_fiscalyear-cell="{ row }">
      <CommonStatusBadge variant="code" :label="String(row.original.egcs_ay_fiscalyear)" class="font-mono" />
    </template>

    <template #egcs_ay_startdate-cell="{ row }">
      {{ formatDate(row.original.egcs_ay_startdate) }}
    </template>

    <template #egcs_ay_enddate-cell="{ row }">
      {{ formatDate(row.original.egcs_ay_enddate) }}
    </template>

    <template #form="{ state }">
      <UFormField :label="t('common.display')" name="egcs_ay_fiscalyeardisplay">
        <UInput v-model="state.egcs_ay_fiscalyeardisplay" :placeholder="t('agency.fiscal_year_placeholder')" />
      </UFormField>
      <UFormField :label="t('common.year')" name="egcs_ay_fiscalyear">
        <UInput v-model="state.egcs_ay_fiscalyear" type="number" />
      </UFormField>
      <UFormField :label="t('common.start_date')" name="egcs_ay_startdate">
        <CommonDatePicker v-model="state.egcs_ay_startdate" />
      </UFormField>
      <UFormField :label="t('common.end_date')" name="egcs_ay_enddate">
        <CommonDatePicker v-model="state.egcs_ay_enddate" />
      </UFormField>
    </template>
  </CommonResourceCrud>
</template>
