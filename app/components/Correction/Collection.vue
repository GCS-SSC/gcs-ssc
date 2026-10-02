<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { CorrectionRow } from '~~/shared/types/correction'
import type { ListResponse } from '~~/shared/types/admin'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { appRouteLocations } from '~/utils/route-locations'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { formatCorrectionReference } from '~~/shared/utils/correction'
import { throwFetchResponseError } from '~/utils/fetch-error'

const { agreementId, showDescription = true } = defineProps<{ agreementId: string, showDescription?: boolean }>()
const emit = defineEmits<{ context: [value: { egcs_fc_agreementnumber: string, egcs_fc_agreementreadable: boolean }] }>()
const { t } = useI18n()
const localePath = useLocalePath()
const { formatDate } = useDateHelpers()
const { showError } = useApiErrorToast()
const createOpen: Ref<boolean> = ref(false)
const outcome: Ref<string> = ref('all')
const fiscalYear: Ref<string | null | undefined> = ref(undefined)
const exporting: Ref<boolean> = ref(false)
type CollectionMetadata = ListResponse<CorrectionRow> & {
  egcs_fc_cancreate?: boolean
  egcs_fc_agreementnumber?: string
  egcs_fc_agreementreadable?: boolean
  egcs_fc_fiscalyears?: Array<{ id: string, label_en: string, label_fr: string }>
}
const { search, pagination, items, totalRecords, status, retry, response } = useResourceTable<CorrectionRow>({
  fetchUrl: computed(() => `/api/agreements/${agreementId}/corrections`),
  query: computed(() => ({
    egcs_fc_outcome: outcome.value === 'all' ? undefined : outcome.value,
    egcs_fc_agencyfiscalyear: fiscalYear.value ?? undefined
  }))
})
const metadata = computed(() => response.value as CollectionMetadata | undefined)
const canCreate = computed(() => Boolean(metadata.value?.egcs_fc_cancreate))
const fiscalYears = computed(() => metadata.value?.egcs_fc_fiscalyears ?? [])
watch(metadata, value => {
  if (value?.egcs_fc_agreementnumber) emit('context', { egcs_fc_agreementnumber: value.egcs_fc_agreementnumber, egcs_fc_agreementreadable: value.egcs_fc_agreementreadable === true })
}, { immediate: true })
const columns: TableColumnInput<CorrectionRow>[] = [
  { accessorKey: 'egcs_fc_number', headerKey: 'correction.number' },
  { id: 'status', accessorKey: 'egcs_fc_status', headerKey: 'common.status' },
  { id: 'outcome', accessorKey: 'egcs_fc_outcome', headerKey: 'correction.outcome' },
  { id: 'created', accessorKey: 'egcs_fc_createdat', headerKey: 'correction.created_at' },
  { id: 'actions', headerKey: 'common.actions' }
]
watch(() => agreementId, () => {
  createOpen.value = false
  outcome.value = 'all'
  fiscalYear.value = undefined
}, { flush: 'sync' })
watch([outcome, fiscalYear], () => {
  pagination.value.pageIndex = 0
})
/**
 * Opens the newly created independent workspace.
 * @param id - Newly created Correction identity.
 */
const created = async (id: string) => {
  await navigateTo(localePath(appRouteLocations.agreementCorrectionDetail(agreementId, id)))
}
/** Downloads the same scoped, filtered evidence shown in the collection. */
const exportCorrections = async () => {
  if (exporting.value) return
  const ownerAgreement = agreementId
  exporting.value = true
  try {
    const url = getClientRequestUrl(`/api/agreements/${ownerAgreement}/corrections/export`)
    if (search.value) url.searchParams.set('search', search.value)
    if (outcome.value !== 'all') url.searchParams.set('egcs_fc_outcome', outcome.value)
    if (fiscalYear.value) url.searchParams.set('egcs_fc_agencyfiscalyear', fiscalYear.value)
    const result = await fetch(url)
    if (!result.ok) await throwFetchResponseError(result)
    const blob = await result.blob()
    if (ownerAgreement !== agreementId) return
    const downloadUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = `corrections-${ownerAgreement}.csv`
    link.click()
    URL.revokeObjectURL(downloadUrl)
  } catch (failure) {
    if (ownerAgreement === agreementId) showError(failure)
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div class="correction-collection min-w-0 space-y-4">
    <p v-if="showDescription" class="text-sm text-muted">
      {{ t('correction.description') }}
    </p>
    <CommonResourceLayoutCard
      v-model:search="search"
      v-model:pagination="pagination"
      :data="items"
      :columns="columns"
      :total-records="totalRecords"
      :request-status="status"
      :loading="status === 'pending'"
      :button-label="t('correction.create')"
      :show-button="canCreate"
      :search-placeholder="t('correction.search')"
      @add="createOpen = true"
      @retry="retry">
      <template #filters>
        <div class="flex w-full flex-col gap-3 sm:w-auto sm:shrink-0 sm:flex-row">
          <UFormField :label="t('correction.outcome')" :required="false" :ui="{ label: 'sr-only' }">
            <CommonEnumSelect v-model="outcome" name="correction_outcome" show-all-option :all-option-label="t('correction.all_outcomes')" />
          </UFormField>
          <UFormField class="correction-fiscal-filter" :label="t('agreement.payments.fiscal_year')" :required="false" :ui="{ label: 'sr-only' }">
            <CommonBilingualSelectMenu v-model="fiscalYear" :items="fiscalYears" value-key="id" label-en-key="label_en" label-fr-key="label_fr" :prepend-options="[{ label: t('correction.all_fiscal_years'), value: null }]" :placeholder="t('correction.all_fiscal_years')" />
          </UFormField>
        </div>
      </template>
      <template #actions>
        <UButton icon="i-lucide-download" color="neutral" variant="outline" :aria-label="t('correction.export_label')" :loading="exporting" :disabled="status !== 'success'" @click="exportCorrections" />
      </template>
      <template #egcs_fc_number-cell="{ row }">
        {{ formatCorrectionReference(row.original) }}
      </template>
      <template #status-cell="{ row }">
        <CommonStatusBadge :status-id="row.original.egcs_fc_status" />
      </template>
      <template #outcome-cell="{ row }">
        {{ row.original.egcs_fc_outcome ? t(`correction.outcomes.${row.original.egcs_fc_outcome}`) : t('common.none') }}
      </template>
      <template #created-cell="{ row }">
        {{ formatDate(row.original.egcs_fc_createdat) }}
      </template>
      <template #actions-cell="{ row }">
        <div class="flex justify-end gap-2">
          <UButton
            icon="i-lucide-arrow-right" color="neutral" variant="ghost"
            :aria-label="`${t('common.view_details')}: ${formatCorrectionReference(row.original)}`"
            :to="localePath(appRouteLocations.agreementCorrectionDetail(agreementId, String(row.original.id)))" />
        </div>
      </template>
    </CommonResourceLayoutCard>
    <CorrectionCreateModal v-model:open="createOpen" :agreement-id="agreementId" @created="created" />
  </div>
</template>

<style scoped>
/* Keep the shared toolbar responsive to an Agreement workspace as well as a full page. */
.correction-collection :deep(div:has(> .toolbar-filters)) {
  flex-wrap: wrap;
}

.correction-collection :deep(.toolbar-filters) {
  flex-basis: 32rem;
  flex-wrap: wrap;
}

@media (min-width: 640px) {
  .correction-collection :deep(.correction-fiscal-filter [role='combobox']) {
    width: 15rem;
  }
}
</style>
