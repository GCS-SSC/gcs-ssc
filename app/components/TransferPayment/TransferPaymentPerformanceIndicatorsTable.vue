<script setup lang="ts">
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import type { TransferPaymentPerformanceIndicatorRow, TransferPaymentOutcomeRow } from '~~/shared/types/transfer-payment-ui'

const {
  outcomes,
  indicators,
  totalRecords,
  loading = false,
  canUpdateChild,
  canDeleteChild
} = defineProps<{
  outcomes: TransferPaymentOutcomeRow[]
  indicators: TransferPaymentPerformanceIndicatorRow[]
  totalRecords: number
  loading?: boolean
  canUpdateChild: boolean
  canDeleteChild: boolean
}>()

const emit = defineEmits<{
  (event: 'add'): void
  (event: 'edit' | 'delete', row: TransferPaymentPerformanceIndicatorRow): void
}>()

const search = defineModel<string>('search', { default: '' })
const pagination = defineModel<{ pageIndex: number; pageSize: number }>('pagination', { required: true })
const selectedOutcomeId = defineModel<string>('selectedOutcomeId', { required: true })

const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()
const getIndicatorActionTarget = (indicator: TransferPaymentPerformanceIndicatorRow) =>
  `${getBilingualValue(indicator, 'egcs_tp_name', String(indicator.id))} [${indicator.id}]`

const indicatorColumns = computed<TableColumnInput<TransferPaymentPerformanceIndicatorRow & {
  outcome_name_en?: string
  outcome_name_fr?: string
}>[]>(() => {
  const base: TableColumnInput<TransferPaymentPerformanceIndicatorRow & {
    outcome_name_en?: string
    outcome_name_fr?: string
  }>[] = [
    { id: 'name', accessorKey: 'egcs_tp_name_en', headerKey: 'transfer_payment.name_en' },
    { id: 'description', accessorKey: 'egcs_tp_description_en', headerKey: 'common.description' },
    { id: 'actions', headerKey: 'common.actions' }
  ]

  if (selectedOutcomeId.value === 'all') {
    base.splice(1, 0, { id: 'outcome', accessorKey: 'outcome_name_en', headerKey: 'transfer_payment.outcomes' })
  }

  return base
})

const indicatorBilingualColumns = computed<BilingualColumnConfig<TransferPaymentPerformanceIndicatorRow & {
  outcome_name_en?: string
  outcome_name_fr?: string
}>[]>(() => {
  const base: BilingualColumnConfig<TransferPaymentPerformanceIndicatorRow & {
    outcome_name_en?: string
    outcome_name_fr?: string
  }>[] = [
    { id: 'name', accessorKey: { en: 'egcs_tp_name_en', fr: 'egcs_tp_name_fr' } },
    { id: 'description', accessorKey: { en: 'egcs_tp_description_en', fr: 'egcs_tp_description_fr' } }
  ]

  if (selectedOutcomeId.value === 'all') {
    base.push({ id: 'outcome', accessorKey: { en: 'outcome_name_en', fr: 'outcome_name_fr' } })
  }

  return base
})
</script>

<template>
  <CommonResourceLayoutCard
    v-model:search="search"
    v-model:pagination="pagination"
    :data="indicators"
    :columns="indicatorColumns"
    :bilingual-columns="indicatorBilingualColumns"
    :total-records="totalRecords"
    :loading="loading"
    :button-label="t('common.add')"
    @add="emit('add')">
    <template #filters>
      <CommonBilingualSelectMenu
        v-model="selectedOutcomeId"
        :items="outcomes"
        value-key="id"
        label-en-key="egcs_tp_name_en"
        label-fr-key="egcs_tp_name_fr"
        :aria-label="t('transfer_payment.outcomes')"
        :placeholder="t('transfer_payment.outcomes')"
        :prepend-options="[{ label: t('common.all'), value: 'all' }]"
        searchable
        variant="outline"
        size="md"
        class="min-w-40"
      />
    </template>

    <template #name-cell="{ row }">
      <CommonBilingualName
        :name-en="row.original.egcs_tp_name_en"
        :name-fr="row.original.egcs_tp_name_fr" />
    </template>

    <template #description-cell="{ row }">
      <span class="text-sm text-zinc-500 dark:text-zinc-400">
        {{ getBilingualValue(row.original, 'egcs_tp_description', '') }}
      </span>
    </template>

    <template v-if="selectedOutcomeId === 'all'" #outcome-cell="{ row }">
      <CommonBilingualName
        :name-en="row.original.outcome_name_en"
        :name-fr="row.original.outcome_name_fr" />
    </template>

    <template #actions-cell="{ row }">
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-pencil"
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="!canUpdateChild"
          :aria-label="t('common.edit_named', { name: getIndicatorActionTarget(row.original) })"
          @click="emit('edit', row.original)" />
        <UButton
          icon="i-lucide-trash"
          color="error"
          variant="ghost"
          size="sm"
          :disabled="!canDeleteChild"
          :aria-label="t('common.delete_named', { name: getIndicatorActionTarget(row.original) })"
          @click="emit('delete', row.original)" />
      </div>
    </template>
  </CommonResourceLayoutCard>
</template>
