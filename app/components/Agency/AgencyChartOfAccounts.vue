<script setup lang="ts">
import { AgencyChartOfAccountSchema, type AgencyChartOfAccountItem } from '~~/shared/types/schemas/transfer-payment'
import type { TableColumnInput } from '~/composables/useTableColumns'

const { agencyId, canCreate, canUpdate, canDelete } = defineProps<{
  agencyId: string
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}>()
const { t, locale } = useI18n()
const columns: TableColumnInput<AgencyChartOfAccountItem>[] = [
  { id: 'fiscal_year_display', accessorKey: 'fiscal_year_display', headerKey: 'common.year' },
  { id: 'dimensions', headerKey: 'transfer_payment.chart_of_accounts.accounting_fields' },
  { id: 'actions', headerKey: 'common.actions' }
]
const initialNewItem = {
  egcs_ay_fiscalyear: '',
  egcs_ay_accountingdimensions: [{ label_en: '', label_fr: '', value: '' }]
}
const addDimension = (state: Partial<AgencyChartOfAccountItem>) => {
  state.egcs_ay_accountingdimensions ??= []
  state.egcs_ay_accountingdimensions.push({ label_en: '', label_fr: '', value: '' })
}
</script>

<template>
  <CommonResourceCrud
    :title="t('agency.tabs.chart_of_accounts')"
    icon="i-lucide-table-properties"
    :fetch-url="`/api/agency/${agencyId}/chart-of-accounts`"
    :post-url="canCreate ? `/api/agency/${agencyId}/chart-of-accounts` : undefined"
    :update-url-base="canUpdate ? `/api/agency/${agencyId}/chart-of-accounts` : undefined"
    :delete-url-base="canDelete ? `/api/agency/${agencyId}/chart-of-accounts` : undefined"
    :can-create="canCreate"
    :can-update="canUpdate"
    :can-delete="canDelete"
    :schema="AgencyChartOfAccountSchema"
    :initial-new-item="initialNewItem"
    :columns="columns"
    modal-fullscreen>
    <template #dimensions-cell="{ row }">
      <div class="flex flex-wrap gap-1">
        <CommonStatusBadge
          v-for="dimension in row.original.egcs_ay_accountingdimensions"
          :key="`${dimension.label_en}:${dimension.value}`" variant="meta" size="sm"
          :label="`${locale === 'fr' ? dimension.label_fr : dimension.label_en}: ${dimension.value}`" />
      </div>
    </template>
    <template #form="{ state }">
      <UFormField
        :label="t('transfer_payment.chart_of_accounts.fiscal_year')"
        :description="state.id ? t('apiErrors.agency.chart_fiscal_year_immutable') : undefined"
        name="egcs_ay_fiscalyear"
        required>
        <UInput
          v-if="state.id"
          :model-value="state.fiscal_year_display || String(state.egcs_ay_fiscalyear)"
          readonly
          required />
        <CommonServerLookupSelect
          v-else
          v-model="state.egcs_ay_fiscalyear"
          :fetch-url="`/api/agency/${agencyId}/fiscal-years`" value-key="id"
          label-en-key="egcs_ay_fiscalyeardisplay" label-fr-key="egcs_ay_fiscalyeardisplay" />
      </UFormField>
      <div class="space-y-3">
        <div class="flex items-center justify-between gap-3">
          <h3 class="font-semibold">
            {{ t('transfer_payment.chart_of_accounts.accounting_fields') }}
          </h3>
          <UButton
            type="button" icon="i-lucide-plus" variant="outline"
            :label="t('transfer_payment.chart_of_accounts.add_field')"
            @click="addDimension(state)" />
        </div>
        <div
          v-for="(dimension, index) in state.egcs_ay_accountingdimensions" :key="index"
          class="grid gap-3 rounded-lg border border-default p-3 md:grid-cols-[1fr_1fr_1fr_auto]">
          <UFormField :label="t('transfer_payment.chart_of_accounts.label_en')" :name="`egcs_ay_accountingdimensions.${index}.label_en`" required>
            <UInput v-model="dimension.label_en" required />
          </UFormField>
          <UFormField :label="t('transfer_payment.chart_of_accounts.label_fr')" :name="`egcs_ay_accountingdimensions.${index}.label_fr`" required>
            <UInput v-model="dimension.label_fr" required />
          </UFormField>
          <UFormField :label="t('transfer_payment.chart_of_accounts.value')" :name="`egcs_ay_accountingdimensions.${index}.value`" required>
            <UInput v-model="dimension.value" required />
          </UFormField>
          <UButton
            type="button" icon="i-lucide-trash" color="error" variant="ghost"
            :aria-label="t('transfer_payment.chart_of_accounts.remove_field')"
            :disabled="(state.egcs_ay_accountingdimensions?.length ?? 0) === 1"
            @click="state.egcs_ay_accountingdimensions?.splice(index, 1)" />
        </div>
      </div>
    </template>
  </CommonResourceCrud>
</template>
