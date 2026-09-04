<script setup lang="ts">
import { computed } from 'vue'
import type { FundingCaseAgreementActivityForm, FundingCaseAgreementActivityRow } from '~~/shared/types/funding-case-agreement-ui'
import { FundingCaseAgreementActivityCreateSchema } from '~~/shared/types/schemas'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import AgreementActivityOutcomesField from './Fields/AgreementActivityOutcomesField.vue'
import AgreementActivityResponsiblePartiesField from './Fields/AgreementActivityResponsiblePartiesField.vue'

type AgreementActivityCrudRow = FundingCaseAgreementActivityRow & Record<string, unknown>

const { agreementId, canCreate, canUpdate, canDelete, apiBase, snapshotItems, staticMode = false, embedded = false } = defineProps<{
  agreementId: string
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  apiBase?: string
  snapshotItems?: FundingCaseAgreementActivityRow[]
  staticMode?: boolean
  embedded?: boolean
}>()

const { t } = useI18n()
const { formatDate } = useDateHelpers()
const { getBilingualValue } = useBilingualValue()
const resourceBase = computed(() => apiBase ?? `/api/agreements/${agreementId}`)
const staticActivityItems = computed<AgreementActivityCrudRow[] | undefined>(() =>
  snapshotItems?.map(item => ({ ...item })))

const toActivityRow = (value: unknown): FundingCaseAgreementActivityRow => value as FundingCaseAgreementActivityRow
const getActivityOutcomes = (value: unknown) => toActivityRow(value).outcomes
const getActivityResponsibleParties = (value: unknown) => toActivityRow(value).responsible_parties

const allColumns: TableColumnInput<AgreementActivityCrudRow>[] = [
  { id: 'name', accessorKey: 'egcs_fc_name_en', headerKey: 'common.name' },
  { id: 'schedule', accessorKey: 'egcs_fc_startdate', headerKey: 'agreement.activities.schedule' },
  { id: 'expected_results', accessorKey: 'egcs_fc_expectedresults_en', headerKey: 'agreement.activities.expected_results' },
  { id: 'flags', accessorKey: 'outcomes', headerKey: 'common.flags' },
  { id: 'actions', headerKey: 'common.actions' }
]
const columns = computed<TableColumnInput<AgreementActivityCrudRow>[]>(() =>
  staticMode ? allColumns.filter(column => column.id !== 'actions') : allColumns)

const bilingualColumns: BilingualColumnConfig<AgreementActivityCrudRow>[] = [
  {
    id: 'name',
    accessorKey: {
      en: 'egcs_fc_name_en',
      fr: 'egcs_fc_name_fr'
    },
    headerKey: 'common.name'
  },
  {
    id: 'expected_results',
    accessorKey: {
      en: 'egcs_fc_expectedresults_en',
      fr: 'egcs_fc_expectedresults_fr'
    },
    headerKey: 'agreement.activities.expected_results'
  }
]
</script>

<template>
  <!-- @vue-generic {AgreementActivityCrudRow} -->
  <CommonResourceCrud
    class="w-full"
    :title="t('agreement.activities.title')"
    icon="i-lucide-list-todo"
    :fetch-url="`${resourceBase}/activities`"
    :static-items="staticActivityItems"
    :static-mode="staticMode"
    :embedded="embedded"
    :post-url="canCreate && !staticMode ? `${resourceBase}/activities` : undefined"
    :update-url-base="canUpdate && !staticMode ? `${resourceBase}/activities` : undefined"
    :delete-url-base="canDelete && !staticMode ? `${resourceBase}/activities` : undefined"
    :schema="FundingCaseAgreementActivityCreateSchema"
    :initial-new-item="{ outcome_ids: [], responsible_party_ids: [] }"
    :columns="columns"
    :bilingual-columns="bilingualColumns"
    table-class="agreement-activities-table"
    :button-label="t('common.add')"
    :show-button="canCreate && !staticMode"
    :modal-title="t('agreement.activities.add')"
    :update-title="t('agreement.activities.edit')"
    modal-fullscreen
    :modal-ui="{ content: 'rounded-none shadow-none ring-0' }"
    :search-placeholder="t('agreement.activities.search')">
    <template #name-cell="{ row }">
      <div class="space-y-1 py-1">
        <CommonBilingualName
          :name-en="toActivityRow(row.original).egcs_fc_name_en"
          :name-fr="toActivityRow(row.original).egcs_fc_name_fr" />
        <p class="text-sm text-zinc-500 dark:text-zinc-400">
          {{ getBilingualValue(toActivityRow(row.original), 'egcs_fc_description', '') }}
        </p>
      </div>
    </template>

    <template #schedule-cell="{ row }">
      <div class="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-300">
        <span>{{ formatDate(toActivityRow(row.original).egcs_fc_startdate) }}</span>
        <span>{{ t('common.to') }}</span>
        <span>{{ formatDate(toActivityRow(row.original).egcs_fc_enddate) }}</span>
      </div>
    </template>

    <template #expected_results-cell="{ row }">
      <span class="text-sm text-zinc-500 dark:text-zinc-400">
        {{ getBilingualValue(toActivityRow(row.original), 'egcs_fc_expectedresults', '') }}
      </span>
    </template>

    <template #flags-cell="{ row }">
      <div class="space-y-2">
        <div class="flex flex-wrap items-center gap-2">
          <CommonStatusBadge
            v-for="outcome in getActivityOutcomes(row.original)"
            :key="outcome.id"
            variant="meta"
            size="sm"
            :label="getBilingualValue(outcome, 'label', String(outcome.id))" />
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <CommonStatusBadge
            v-for="responsibleParty in getActivityResponsibleParties(row.original)"
            :key="responsibleParty.id"
            variant="final"
            size="sm"
            :label="getBilingualValue(responsibleParty, 'label', String(responsibleParty.id))" />
        </div>
      </div>
    </template>

    <template #form="{ state }">
      <div class="grid gap-4 lg:grid-cols-2">
        <UFormField :label="t('agreement.activities.name_en')" name="egcs_fc_name_en">
          <UInput v-model="(state as FundingCaseAgreementActivityForm).egcs_fc_name_en" />
        </UFormField>

        <UFormField :label="t('agreement.activities.name_fr')" name="egcs_fc_name_fr">
          <UInput v-model="(state as FundingCaseAgreementActivityForm).egcs_fc_name_fr" />
        </UFormField>

        <UFormField :label="t('agreement.activities.start_date')" name="egcs_fc_startdate">
          <CommonDatePicker v-model="(state as FundingCaseAgreementActivityForm).egcs_fc_startdate" />
        </UFormField>

        <UFormField :label="t('agreement.activities.end_date')" name="egcs_fc_enddate">
          <CommonDatePicker v-model="(state as FundingCaseAgreementActivityForm).egcs_fc_enddate" />
        </UFormField>

        <div>
          <AgreementActivityResponsiblePartiesField
            v-model:model="(state as FundingCaseAgreementActivityForm).responsible_party_ids"
            :agreement-id="agreementId"
            :permission-action="state.id ? 'update' : 'create'" />
        </div>

        <div>
          <AgreementActivityOutcomesField
            v-model:model="(state as FundingCaseAgreementActivityForm).outcome_ids"
            :agreement-id="agreementId"
            :permission-action="state.id ? 'update' : 'create'" />
        </div>

        <UFormField :label="t('agreement.activities.description_en')" name="egcs_fc_description_en">
          <CommonTextarea v-model="(state as FundingCaseAgreementActivityForm).egcs_fc_description_en" :rows="4" />
        </UFormField>

        <UFormField :label="t('agreement.activities.description_fr')" name="egcs_fc_description_fr">
          <CommonTextarea v-model="(state as FundingCaseAgreementActivityForm).egcs_fc_description_fr" :rows="4" />
        </UFormField>

        <UFormField :label="t('agreement.activities.expected_results_en')" name="egcs_fc_expectedresults_en">
          <CommonTextarea v-model="(state as FundingCaseAgreementActivityForm).egcs_fc_expectedresults_en" :rows="4" />
        </UFormField>

        <UFormField :label="t('agreement.activities.expected_results_fr')" name="egcs_fc_expectedresults_fr">
          <CommonTextarea v-model="(state as FundingCaseAgreementActivityForm).egcs_fc_expectedresults_fr" :rows="4" />
        </UFormField>
      </div>
    </template>
  </CommonResourceCrud>
</template>

<style scoped>
:deep(.agreement-activities-table) {
  min-width: 70rem;
  width: 100%;
}

:deep(.agreement-activities-table table) {
  table-layout: fixed;
  min-width: 70rem;
  width: 100%;
}

:deep(.agreement-activities-table th),
:deep(.agreement-activities-table td) {
  padding-left: 1rem;
  padding-right: 1rem;
  white-space: normal;
  overflow-wrap: anywhere;
}

:deep(.agreement-activities-table td) {
  padding-top: 0.9375rem;
  padding-bottom: 0.9375rem;
}

:deep(.agreement-activities-table th:nth-child(1)) {
  width: 30%;
}

:deep(.agreement-activities-table th:nth-child(2)) {
  width: 13%;
}

:deep(.agreement-activities-table th:nth-child(3)) {
  width: 31%;
}

:deep(.agreement-activities-table th:nth-child(4)) {
  width: 19%;
}

:deep(.agreement-activities-table th:nth-child(5)) {
  width: 7%;
}

:deep(.agreement-activities-table th:nth-child(5)),
:deep(.agreement-activities-table td:nth-child(5)) {
  padding-left: 0.5rem;
  padding-right: 0.5rem;
}

:deep(.agreement-activities-table td:nth-child(4) span) {
  max-width: 100%;
  white-space: normal;
}
</style>
