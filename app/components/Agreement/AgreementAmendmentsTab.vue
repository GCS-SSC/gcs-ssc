<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- concise amendment UI callbacks are covered by focused tests. */
import { computed, onUnmounted, ref, useId, watch } from 'vue'
import type { Ref } from 'vue'
import type { FetchError } from 'ofetch'
import type { TableColumnInput } from '~/composables/useTableColumns'
import type { AdminCommonLookupResponseItem } from '~~/shared/types/admin-common-ui'
import { hasRequiredAmendmentSubtypeSelections } from '~/utils/agreement-amendment-scope'
import { appRouteLocations } from '~/utils/route-locations'
import type {
  FundingCaseAgreementAmendmentListResponse,
  FundingCaseAgreementAmendmentRow,
  FundingCaseAgreementProfileRow
} from '~~/shared/types/funding-case-agreement-ui'
import { compareMoney, formatMoneyText, moneyFromCents, moneyToCents, parseMoney } from '~~/shared/utils/money'

const { agreementId, canCreate } = defineProps<{
  agreementId: string
  canCreate: boolean
}>()

const nameRequirementId = useId()
const { t, locale } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
const { showError } = useApiErrorToast()
const { getBilingualValue } = useBilingualValue()
const { saveJson } = useJsonRequest()

const search: Ref<string> = ref('')
const pagination: Ref<{ pageIndex: number, pageSize: number }> = ref({ pageIndex: 0, pageSize: 25 })
const isCreateOpen: Ref<boolean> = ref(false)
const selectedTypeIds: Ref<string[]> = ref([])
const selectedSubtypeIds: Ref<string[]> = ref([])
const amendmentNameEn: Ref<string> = ref('')
const amendmentNameFr: Ref<string> = ref('')
let subtypeFilterRequest = 0
let subtypeRequirementRequest = 0
const resolvedTypeMetadata: Ref<AmendmentTypeMetadata[]> = ref([])
const requiredSubtypeIdsByType: Ref<Record<string, string[]>> = ref({})
const subtypeRequirementFailed: Ref<boolean> = ref(false)
const isSaving: Ref<boolean> = ref(false)
const isOpeningCreate: Ref<boolean> = ref(false)
let createGeneration = 0
let createDisposed = false
let createOperation: symbol | null = null
const invalidateCreateActions = () => {
  createGeneration += 1
  createOperation = null
  subtypeFilterRequest += 1
  subtypeRequirementRequest += 1
  resolvedTypeMetadata.value = []
  requiredSubtypeIdsByType.value = {}
  subtypeRequirementFailed.value = false
  isSaving.value = false
  isOpeningCreate.value = false
}
onUnmounted(() => {
  createDisposed = true
  invalidateCreateActions()
})
type AmendmentTypeMetadata = { id: string, egcs_tp_amended: string, egcs_tp_requiresamendmentsubtype: boolean }
type AmendmentTypeLookupResponse = { items: AmendmentTypeMetadata[] }
const amendmentTypesEndpoint = computed(() => `/api/agreements/${agreementId}/amendments/lookups/types`)
const amendmentTypesLookup = useFetch<AmendmentTypeLookupResponse, FetchError, string>(
  amendmentTypesEndpoint,
  { default: () => ({ items: [] }) }
)

const amendmentsEndpoint = computed(() => `/api/agreements/${agreementId}/amendments`)
const amendmentsQuery = computed(() => ({
  page: pagination.value.pageIndex + 1,
  limit: pagination.value.pageSize,
  search: search.value.trim() || undefined
}))
const amendmentsRequest = useFetch<FundingCaseAgreementAmendmentListResponse, FetchError, string>(
  amendmentsEndpoint,
  { query: amendmentsQuery, default: () => ({ items: [], total: 0, can_create: false }) }
)
const response = amendmentsRequest.data as Ref<FundingCaseAgreementAmendmentListResponse>
const status = amendmentsRequest.status
const refresh = amendmentsRequest.refresh

const columns: TableColumnInput<FundingCaseAgreementAmendmentRow>[] = [
  { id: 'number', accessorKey: 'egcs_fc_amendmentnumber', headerKey: 'agreement.amendments.number' },
  { id: 'name', accessorKey: 'egcs_fc_name_en', headerKey: 'common.name' },
  { id: 'types', accessorKey: 'amendment_types', headerKey: 'agreement.amendments.types' },
  { id: 'snapshots', accessorKey: 'has_budget_snapshot', headerKey: 'agreement.amendments.snapshots' },
  { id: 'budget_differences', accessorKey: 'budget_differences', headerKey: 'agreement.amendments.budget_difference' },
  { id: 'status', accessorKey: 'egcs_fc_status', headerKey: 'common.status' },
  { id: 'actions', headerKey: 'common.actions' }
]

const amendments = computed(() => response.value?.items ?? [])
watch(search, () => {
  pagination.value.pageIndex = 0
})
watch(() => agreementId, () => {
  invalidateCreateActions()
  pagination.value.pageIndex = 0
  isCreateOpen.value = false
}, { flush: 'sync' })
const hasOpenAmendment = computed(() => response.value.items.some(amendment => amendment.egcs_fc_isopen === true))
const ZERO_MONEY = parseMoney('0')
const formatBudgetDifference = (amendment: FundingCaseAgreementAmendmentRow): string => {
  const budgetDifferences = amendment.budget_differences ?? []
  if (budgetDifferences.length === 0) return t('common.none')
  return budgetDifferences.map(budgetDifference => {
    const cents = moneyToCents(budgetDifference.difference)
    const absoluteValue = moneyFromCents(cents < BigInt(0) ? -cents : cents)
    const formatted = formatMoneyText(absoluteValue, locale.value, budgetDifference.currency.toUpperCase())
    if (compareMoney(budgetDifference.difference, ZERO_MONEY) > 0) return `+${formatted}`
    if (compareMoney(budgetDifference.difference, ZERO_MONEY) < 0) return `-${formatted}`
    return formatted
  }).join(' / ')
}
const hasAmendmentName = computed(() => amendmentNameEn.value.trim().length > 0 || amendmentNameFr.value.trim().length > 0)
const onResolvedTypes = (items: AdminCommonLookupResponseItem[]) => {
  if (createDisposed || !isCreateOpen.value) return
  resolvedTypeMetadata.value = items.flatMap(item => typeof item.id === 'string'
    && typeof item.egcs_tp_amended === 'string' && typeof item.egcs_tp_requiresamendmentsubtype === 'boolean'
    ? [{ id: item.id, egcs_tp_amended: item.egcs_tp_amended, egcs_tp_requiresamendmentsubtype: item.egcs_tp_requiresamendmentsubtype }]
    : [])
}
const selectedTypes = computed(() => {
  const byId = new Map([...amendmentTypesLookup.data.value.items, ...resolvedTypeMetadata.value].map(type => [type.id, type]))
  return selectedTypeIds.value.flatMap(id => byId.has(id) ? [byId.get(id)!] : [])
})
const typeMetadataReady = computed(() => selectedTypes.value.length === selectedTypeIds.value.length)
const requiredTypeIds = computed(() => selectedTypes.value.filter(type => type.egcs_tp_requiresamendmentsubtype).map(type => type.id))
const subtypeRequired = computed(() => requiredTypeIds.value.length > 0)
const hasRequiredSubtypes = computed(() => hasRequiredAmendmentSubtypeSelections(requiredTypeIds.value, selectedSubtypeIds.value, requiredSubtypeIdsByType.value))
const subtypeQuery = computed(() => ({ amendment_type_ids: selectedTypeIds.value.join(',') }))
const fetchAmendmentSubtypes = $fetch as unknown as (
  url: string,
  options: { query: { amendment_type_ids: string } }
) => Promise<{ items: Array<{ id: string }> }>
watch(selectedTypeIds, async typeIds => {
  const requestId = ++subtypeFilterRequest
  if (typeIds.length === 0) {
    selectedSubtypeIds.value = []
    return
  }
  try {
    const subtypeResponse = await fetchAmendmentSubtypes(
      `/api/agreements/${agreementId}/amendments/lookups/subtypes`,
      { query: { amendment_type_ids: typeIds.join(',') } }
    )
    if (requestId !== subtypeFilterRequest || !isCreateOpen.value || createDisposed) return
    const validSubtypeIds = new Set(subtypeResponse.items.map(item => String(item.id)))
    selectedSubtypeIds.value = selectedSubtypeIds.value.filter(subtypeId => validSubtypeIds.has(subtypeId))
  } catch (error: unknown) {
    if (requestId === subtypeFilterRequest && isCreateOpen.value && !createDisposed) showError(error)
  }
})

const loadRequiredSubtypes = async () => {
  const requestId = ++subtypeRequirementRequest
  const owner = agreementId
  const generation = createGeneration
  const typeIds = [...requiredTypeIds.value]
  const isCurrent = () => !createDisposed && isCreateOpen.value && owner === agreementId && generation === createGeneration && requestId === subtypeRequirementRequest
  requiredSubtypeIdsByType.value = {}
  subtypeRequirementFailed.value = false
  if (typeIds.length === 0 || !isCreateOpen.value) return
  try {
    const responses = await Promise.all(typeIds.map(async id => ({ id, response: await fetchAmendmentSubtypes(
      `/api/agreements/${owner}/amendments/lookups/subtypes`, { query: { amendment_type_ids: id } }
    ) })))
    if (!isCurrent()) return
    requiredSubtypeIdsByType.value = Object.fromEntries(responses.map(({ id, response }) => [id, response.items.map(item => String(item.id))]))
  } catch (error: unknown) {
    if (isCurrent()) {
      subtypeRequirementFailed.value = true
      showError(error)
    }
  }
}
watch(requiredTypeIds, loadRequiredSubtypes)
watch(isCreateOpen, open => {
  if (open) return
  subtypeFilterRequest += 1
  subtypeRequirementRequest += 1
  resolvedTypeMetadata.value = []
  requiredSubtypeIdsByType.value = {}
  subtypeRequirementFailed.value = false
}, { flush: 'sync' })

const warnCreatePrerequisite = (missingAssignment = false) => toast.add({
  title: t('common.warning'),
  description: t(missingAssignment ? 'assignments.read_only_description' : 'agreement.child_records.work_prerequisite'),
  color: 'warning'
})
const checkCreatePrerequisites = async (owner: string, shouldProceed: () => boolean): Promise<boolean> => {
  try {
    const [record, roster, collection] = await Promise.all([
      $fetch<FundingCaseAgreementProfileRow, string>(`/api/agreements/${owner}`),
      $fetch<{ is_assigned: boolean }, string>(`/api/entity-assignments/fundingcaseagreement/${owner}`),
      $fetch<FundingCaseAgreementAmendmentListResponse, string>(`/api/agreements/${owner}/amendments`)
    ])
    if (!shouldProceed()) return false
    if (roster.is_assigned !== true) {
      warnCreatePrerequisite(true)
      return false
    }
    if (record.can_create_child_records_role === true && record.can_create_child_records === true && collection.can_create === true) return true
  } catch {
    if (!shouldProceed()) return false
  }
  if (shouldProceed()) warnCreatePrerequisite()
  return false
}
const openCreate = async () => {
  if (!canCreate || createDisposed || isOpeningCreate.value) return
  invalidateCreateActions()
  const owner = agreementId
  const generation = createGeneration
  const token = Symbol('amendment-open')
  createOperation = token
  isOpeningCreate.value = true
  const shouldProceed = () => !createDisposed && agreementId === owner && canCreate
    && createGeneration === generation && createOperation === token
  try {
    if (!await checkCreatePrerequisites(owner, shouldProceed) || !shouldProceed()) return
    selectedTypeIds.value = []
    selectedSubtypeIds.value = []
    amendmentNameEn.value = ''
    amendmentNameFr.value = ''
    isCreateOpen.value = true
  } finally {
    if (createOperation === token) {
      createOperation = null
      isOpeningCreate.value = false
    }
  }
}

const createAmendment = async () => {
  if (!canCreate || createDisposed || !isCreateOpen.value || !hasAmendmentName.value || selectedTypeIds.value.length === 0 || (!typeMetadataReady.value || !hasRequiredSubtypes.value) || isSaving.value) return

  const payload = {
    egcs_fc_name_en: amendmentNameEn.value,
    egcs_fc_name_fr: amendmentNameFr.value,
    amendment_type_ids: [...selectedTypeIds.value],
    amendment_subtype_ids: [...selectedSubtypeIds.value]
  }
  const owner = agreementId
  const generation = createGeneration
  const token = Symbol('amendment-create')
  createOperation = token
  const shouldProceed = () => !createDisposed && agreementId === owner && canCreate
    && createGeneration === generation && createOperation === token
  try {
    isSaving.value = true
    if (!await checkCreatePrerequisites(owner, shouldProceed) || !shouldProceed()) return
    await saveJson(`/api/agreements/${owner}/amendments`, 'POST', payload)
    if (!shouldProceed()) return
    isCreateOpen.value = false
    await refresh()
    if (!shouldProceed()) return
    toast.add({ title: t('common.success'), description: t('agreement.amendments.created_success'), color: 'success' })
  } catch (error: unknown) {
    if (shouldProceed()) showError(error)
  } finally {
    if (createOperation === token) {
      createOperation = null
      isSaving.value = false
    }
  }
}
</script>

<template>
  <div class="w-full">
    <UAlert
      v-if="canCreate && hasOpenAmendment"
      class="mb-4"
      color="info"
      icon="i-lucide-info"
      :title="t('agreement.amendments.open_exists')" />
    <CommonResourceLayoutCard
      v-model:search="search"
      v-model:pagination="pagination"
      :data="amendments"
      :columns="columns"
      :total-records="response.total"
      :loading="status === 'pending'"
      :request-status="status"
      :button-label="t('agreement.amendments.add')"
      :show-button="canCreate"
      :search-placeholder="t('agreement.amendments.search')"
      @add="openCreate"
      @retry="refresh">
      <template #number-cell="{ row }">
        {{ row.original.egcs_fc_amendmentnumber === null ? t('agreement.amendments.working') : row.original.egcs_fc_amendmentnumber }}
      </template>

      <template #name-cell="{ row }">
        <CommonBilingualName
          :name-en="row.original.egcs_fc_name_en"
          :name-fr="row.original.egcs_fc_name_fr"
          :to="localePath(appRouteLocations.agreementAmendmentDetail(agreementId, String(row.original.id)))" />
      </template>

      <template #types-cell="{ row }">
        <div class="flex flex-wrap gap-2">
          <CommonStatusBadge
            v-for="type in row.original.amendment_types"
            :key="type.id"
            variant="meta"
            size="sm"
            :label="getBilingualValue(type, 'egcs_tp_name', String(type.id))" />
        </div>
      </template>

      <template #snapshots-cell="{ row }">
        <div class="flex flex-wrap gap-2">
          <CommonStatusBadge v-if="row.original.has_budget_snapshot" variant="count" size="sm" :label="t('agreement.budget.title')" />
          <CommonStatusBadge v-if="row.original.has_activity_snapshot" variant="count" size="sm" :label="t('agreement.activities.title')" />
          <span v-if="!row.original.has_budget_snapshot && !row.original.has_activity_snapshot" class="text-sm text-zinc-500">{{ t('common.none') }}</span>
        </div>
      </template>

      <template #budget_differences-cell="{ row }">
        <span :class="row.original.budget_differences?.every(item => compareMoney(item.difference, ZERO_MONEY) === 0) ? 'text-muted' : 'font-medium text-default'">
          {{ formatBudgetDifference(row.original) }}
        </span>
      </template>

      <template #status-cell="{ row }">
        <CommonRecordState
          :status-id="row.original.egcs_fc_status"
          :is-completed="row.original.isCompleted" />
      </template>

      <template #actions-cell="{ row }">
        <div class="flex justify-end">
          <UButton
            :to="localePath(appRouteLocations.agreementAmendmentDetail(agreementId, String(row.original.id)))"
            icon="i-lucide-arrow-right"
            color="neutral"
            variant="ghost"
            class="cursor-default"
            :aria-label="t('common.open')" />
        </div>
      </template>
    </CommonResourceLayoutCard>

    <UModal
      v-model:open="isCreateOpen"
      :title="t('agreement.amendments.add')"
      :description="t('common.form_dialog_description')">
      <template #body>
        <form class="space-y-4" @submit.prevent="createAmendment">
          <div class="grid gap-4 md:grid-cols-2">
            <UFormField :label="t('agreement.amendments.name_en')">
              <UInput v-model="amendmentNameEn" :aria-describedby="nameRequirementId" class="w-full" />
            </UFormField>
            <UFormField :label="t('agreement.amendments.name_fr')">
              <UInput v-model="amendmentNameFr" :aria-describedby="nameRequirementId" class="w-full" />
            </UFormField>
          </div>
          <p :id="nameRequirementId" class="text-sm text-zinc-500 dark:text-zinc-400">
            {{ t('agreement.amendments.name_help') }}
          </p>
          <p class="text-sm text-zinc-600 dark:text-zinc-300">
            {{ t('agreement.amendments.type_help') }}
          </p>
          <UFormField :label="t('agreement.amendments.type')" required>
            <CommonServerLookupMultiSelect
              v-model="selectedTypeIds"
              :fetch-url="`/api/agreements/${agreementId}/amendments/lookups/types`"
              value-key="id"
              label-en-key="egcs_tp_name_en"
              label-fr-key="egcs_tp_name_fr"
              required
              @resolved-items="onResolvedTypes" />
          </UFormField>
          <UFormField
            v-if="selectedTypeIds.length > 0"
            :label="t('agreement.amendments.subtypes')"
            :required="subtypeRequired">
            <CommonServerLookupMultiSelect
              v-model="selectedSubtypeIds"
              :fetch-url="`/api/agreements/${agreementId}/amendments/lookups/subtypes`"
              value-key="id"
              label-en-key="egcs_tp_name_en"
              label-fr-key="egcs_tp_name_fr"
              :query="subtypeQuery"
              :required="subtypeRequired" />
          </UFormField>
          <UButton v-if="subtypeRequirementFailed" :label="t('common.retry')" color="neutral" variant="ghost" @click="loadRequiredSubtypes" />
          <div class="flex justify-end gap-2 pt-4">
            <UButton class="cursor-default" color="neutral" variant="ghost" :label="t('common.cancel')" @click="isCreateOpen = false" />
            <CommonSaveButton
              :label="t('common.add')"
              :loading="isSaving"
              :disabled="isSaving || !hasAmendmentName || selectedTypeIds.length === 0 || (!typeMetadataReady || !hasRequiredSubtypes)" />
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>
