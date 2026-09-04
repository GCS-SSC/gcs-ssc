<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- local table helpers are self-documenting and not public APIs */
import { getPaginationRowModel } from '@tanstack/table-core'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import { appRouteLocations } from '~/utils/route-locations'
import type { FundingCaseAgreementProfileRow } from '~~/shared/types/funding-case-agreement-ui'
import type { ResourceTableStatus } from '~~/shared/types/resource-table'

const {
  agreements = [],
  totalRecords = 0,
  loading = false,
  requestStatus,
  canCreate = false,
  canUpdate = () => false,
  canDelete = () => false
} = defineProps<{
  agreements?: FundingCaseAgreementProfileRow[]
  totalRecords?: number
  loading?: boolean
  requestStatus?: ResourceTableStatus
  canCreate?: boolean
  canUpdate?: (agreement: FundingCaseAgreementProfileRow) => boolean
  canDelete?: (agreement: FundingCaseAgreementProfileRow) => boolean
}>()

const emit = defineEmits<{
  (event: 'add' | 'retry'): void
  (event: 'edit' | 'delete', agreement: FundingCaseAgreementProfileRow): void
}>()

const search = defineModel<string>('search', { default: '' })
const pagination = defineModel<{ pageIndex: number; pageSize: number }>('pagination', { required: true })

const { t } = useI18n()
const localePath = useLocalePath()
const { getBilingualValue } = useBilingualValue()

const columns: TableColumnInput<FundingCaseAgreementProfileRow>[] = [
  { accessorKey: 'id', headerKey: 'common.id' },
  { accessorKey: 'egcs_fc_agreementnumber', headerKey: 'common.number' },
  { accessorKey: 'egcs_fc_title_en', headerKey: 'agreement.title_en' },
  { accessorKey: 'egcs_fc_status', headerKey: 'common.status' },
  { id: 'agency', headerKey: 'agreement.agency' },
  { id: 'program', headerKey: 'agreement.program' },
  { id: 'stream', headerKey: 'agreement.stream' },
  { accessorKey: 'egcs_fc_agreementtype', headerKey: 'common.type' },
  { id: 'actions', headerKey: 'common.actions' }
]

const bilingualColumns: BilingualColumnConfig<FundingCaseAgreementProfileRow>[] = []

const getAgreementTypeLabel = (value?: string) => {
  if (!value) {
    return '-'
  }

  return t(`enums.agreement_type.${value}`)
}

const getAgreementActionTarget = (agreement: FundingCaseAgreementProfileRow) => {
  const number = agreement.egcs_fc_agreementnumber
  const title = getBilingualValue(agreement, 'egcs_fc_title', '')
  return [number, title].filter(Boolean).join(' — ') || String(agreement.id)
}
</script>

<template>
  <CommonResourceLayoutPage
    v-model:search="search"
    v-model:pagination="pagination"
    :data="agreements"
    :columns="columns"
    :bilingual-columns="bilingualColumns"
    :total-records="totalRecords"
    :loading="loading"
    :request-status="requestStatus"
    :pagination-options="{ getPaginationRowModel: getPaginationRowModel() }"
    :button-label="t('agreement.new')"
    :show-button="canCreate"
    :search-placeholder="t('agreement.search_placeholder')"
    v-bind="$attrs"
    @add="emit('add')"
    @retry="emit('retry')">
    <template #id-cell="{ row }">
      <span class="font-mono text-xs font-bold text-zinc-400 dark:text-zinc-500">
        {{ row.original.id }}
      </span>
    </template>

    <template #egcs_fc_title_en-cell="{ row }">
      <CommonBilingualName
        :name-en="row.original.egcs_fc_title_en"
        :name-fr="row.original.egcs_fc_title_fr"
        :to="localePath(appRouteLocations.agreementDetail(String(row.original.id)))" />
    </template>

    <template #egcs_fc_status-cell="{ row }">
      <CommonRecordState
        :status-id="row.original.egcs_fc_status"
        :is-completed="row.original.isCompleted"
        :wrap="false" />
    </template>

    <template #agency-cell="{ row }">
      <span class="font-semibold text-zinc-700 dark:text-zinc-300">
        {{ getBilingualValue(row.original, 'agency_name', '-') }}
      </span>
    </template>

    <template #program-cell="{ row }">
      <span class="font-semibold text-zinc-700 dark:text-zinc-300">
        {{ getBilingualValue(row.original, 'program_name', '-') }}
      </span>
    </template>

    <template #stream-cell="{ row }">
      <span class="font-semibold text-zinc-700 dark:text-zinc-300">
        {{ getBilingualValue(row.original, 'stream_name', '-') }}
      </span>
    </template>

    <template #egcs_fc_agreementtype-cell="{ row }">
      <span class="font-semibold text-zinc-700 dark:text-zinc-300">
        {{ getAgreementTypeLabel(row.original.egcs_fc_agreementtype) }}
      </span>
    </template>

    <template #actions-cell="{ row }">
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-edit-3"
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="!canUpdate(row.original)"
          :aria-label="t('common.edit_named', { name: getAgreementActionTarget(row.original) })"
          @click="emit('edit', row.original)" />
        <UButton
          icon="i-lucide-trash"
          color="error"
          variant="ghost"
          size="sm"
          :disabled="!canDelete(row.original)"
          :aria-label="t('common.delete_named', { name: getAgreementActionTarget(row.original) })"
          @click="emit('delete', row.original)" />
      </div>
    </template>
  </CommonResourceLayoutPage>
</template>
