<script setup lang="ts">
import { useCrudModalPending } from '~/composables/useCrudModal'
import { useBusinessStatusState } from '~/composables/useBusinessStatusState'
/* eslint-disable jsdoc/require-jsdoc -- Monitor table callbacks are exercised by focused component tests. */
import { computed, ref, shallowReactive, watch } from 'vue'
import type { Ref } from 'vue'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { useAgreementOverview } from '~/composables/useAgreementOverview'
import { useJsonRequest } from '~/composables/useJsonRequest'
import { appRouteLocations } from '~/utils/route-locations'
import type { FundingCaseAgreementMonitorForm, FundingCaseAgreementMonitorRow } from '~~/shared/types/funding-case-agreement-ui'
import { FundingCaseAgreementMonitorCreateSchema } from '~~/shared/types/schemas'

const { agreementId, canCreate, canUpdate, canDelete } = defineProps<{
  agreementId: string
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}>()
const agreementIdRef = computed(() => agreementId)

const { t } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const { getBilingualValue } = useBilingualValue()
const { saveJson } = useJsonRequest()
const { isRecordLocked } = useBusinessStatusState()

const search: Ref<string> = ref('')
const pagination: Ref<{ pageIndex: number, pageSize: number }> = ref({ pageIndex: 0, pageSize: 25 })
const pendingMonitorDeletes = shallowReactive(new Set<string>())

const monitorModal = useCrudModal<FundingCaseAgreementMonitorRow, FundingCaseAgreementMonitorForm>({
  createState: () => ({
    egcs_fc_onsite: false,
    egcs_fc_tentativequarter: 1
  }),
  updateState: monitor => ({
    id: monitor.id,
    egcs_fc_type: monitor.egcs_fc_type,
    egcs_fc_onsite: monitor.egcs_fc_onsite,
    egcs_fc_tentativefiscalyear: monitor.egcs_fc_tentativefiscalyear,
    egcs_fc_tentativequarter: monitor.egcs_fc_tentativequarter
  })
})
const monitorPending = useCrudModalPending(monitorModal.captureSession)
const isSavingMonitor = monitorPending.isPending
watch(agreementIdRef, () => monitorModal.close(), { flush: 'sync' })

const selectedMonitor = monitorModal.selected
const isMonitorModalOpen = monitorModal.isOpen
const validateMonitor = createValidator(FundingCaseAgreementMonitorCreateSchema)
const {
  overview,
  overviewStatus,
  refreshOverview
} = useAgreementOverview<{ monitors: FundingCaseAgreementMonitorRow[] }>(computed(() => `/api/agreements/${agreementId}/monitors-overview`))

const columns: TableColumnInput<FundingCaseAgreementMonitorRow>[] = [
  { id: 'type', accessorKey: 'monitor_type_name_en', headerKey: 'agreement.monitors.type' },
  { id: 'fiscalYear', accessorKey: 'fiscal_year_display', headerKey: 'agreement.monitors.tentative_fiscal_year' },
  { id: 'quarter', accessorKey: 'egcs_fc_tentativequarter', headerKey: 'agreement.monitors.tentative_quarter' },
  { id: 'onsite', accessorKey: 'egcs_fc_onsite', headerKey: 'agreement.monitors.onsite' },
  { id: 'status', accessorKey: 'egcs_fc_status', headerKey: 'common.status' },
  { id: 'actions', headerKey: 'common.actions' }
]

const normalizedSearch = computed(() => search.value.trim().toLowerCase())
const monitors = computed<FundingCaseAgreementMonitorRow[]>(() =>
  (overview.value?.monitors ?? []).filter((monitor: FundingCaseAgreementMonitorRow) => {
    if (!normalizedSearch.value) {
      return true
    }

    return [
      getBilingualValue(monitor, 'monitor_type_name', ''),
      monitor.fiscal_year_display,
      monitor.egcs_fc_tentativequarter,
      monitor.egcs_fc_onsite ? t('common.yes') : t('common.no')
    ].some(value => String(value ?? '').toLowerCase().includes(normalizedSearch.value))
  })
)

const saveMonitor = async () => {
  if (!selectedMonitor.value) {
    return
  }
  const monitorState = selectedMonitor.value
  const isUpdate = Boolean(monitorState.id)
  const session = monitorModal.captureSession()
  if (!monitorPending.begin(session)) return

  try {
    await saveJson(
      isUpdate
        ? `/api/agreements/${agreementId}/monitors/${monitorState.id}`
        : `/api/agreements/${agreementId}/monitors`,
      isUpdate ? 'PATCH' : 'POST',
      monitorState
    )
    if (!monitorModal.closeSession(session)) return
    if (!await refreshOverview()) return
    toast.add({ title: t('common.success'), description: isUpdate ? t('common.updated_success') : t('common.added_success'), color: 'success' })
  } catch (error: unknown) {
    showError(error)
  } finally {
    monitorPending.end(session)
  }
}

const deleteMonitor = async (monitorId: string) => {
  if (pendingMonitorDeletes.has(monitorId)) return
  pendingMonitorDeletes.add(monitorId)
  try {
    const ok = await confirmDeleteRequest(`/api/agreements/${agreementId}/monitors/${monitorId}`)
    if (!ok) return
    await refreshOverview()
    toast.add({ title: t('common.success'), description: t('common.deleted_success'), color: 'success' })
  } catch (error: unknown) {
    showError(error)
  } finally {
    pendingMonitorDeletes.delete(monitorId)
  }
}
</script>

<template>
  <div class="w-full">
    <CommonResourceLayoutCard
      v-model:search="search"
      v-model:pagination="pagination"
      :data="monitors"
      :columns="columns"
      :total-records="monitors.length"
      :loading="overviewStatus === 'pending'"
      :request-status="overviewStatus"
      :button-label="t('agreement.monitors.add')"
      :show-button="canCreate"
      :search-placeholder="t('agreement.monitors.search')"
      @add="monitorModal.openCreate"
      @retry="refreshOverview">
      <template #type-cell="{ row }">
        <ULink
          :to="localePath(appRouteLocations.agreementMonitorDetail(agreementId, String(row.original.id)))"
          class="font-bold text-zinc-900 transition-colors hover:text-primary dark:text-white">
          {{ getBilingualValue(row.original, 'monitor_type_name', String(row.original.id)) }}
        </ULink>
      </template>

      <template #onsite-cell="{ row }">
        {{ row.original.egcs_fc_onsite ? t('common.yes') : t('common.no') }}
      </template>

      <template #status-cell="{ row }">
        <CommonRecordState
          :status-id="row.original.egcs_fc_status"
          :is-completed="row.original.isCompleted" />
      </template>

      <template #actions-cell="{ row }">
        <div class="flex items-center justify-end gap-2">
          <UButton
            :to="localePath(appRouteLocations.agreementMonitorDetail(agreementId, String(row.original.id)))"
            icon="i-lucide-arrow-right"
            color="neutral"
            variant="ghost"
            class="cursor-default"
            :aria-label="t('common.open')" />
          <UButton
            v-if="canUpdate && !isRecordLocked(row.original)"
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            class="cursor-default"
            :aria-label="t('common.edit')"
            @click="monitorModal.openUpdate(row.original)" />
          <UButton
            v-if="canDelete && !isRecordLocked(row.original)"
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            class="cursor-default"
            :disabled="pendingMonitorDeletes.has(String(row.original.id))"
            :aria-label="t('common.delete')"
            @click="deleteMonitor(String(row.original.id))" />
        </div>
      </template>
    </CommonResourceLayoutCard>

    <UModal
      v-if="selectedMonitor"
      v-model:open="isMonitorModalOpen"
      :title="selectedMonitor.id ? t('agreement.monitors.edit') : t('agreement.monitors.add')">
      <template #body>
        <UForm :state="selectedMonitor" :validate="validateMonitor" :validate-on="[]" class="space-y-4" @submit="saveMonitor">
          <UFormField :label="t('agreement.monitors.type')" name="egcs_fc_type">
            <CommonServerLookupSelect
              v-model="selectedMonitor.egcs_fc_type"
              :fetch-url="`/api/agreements/${agreementId}/monitors/lookups/monitor-types`"
              value-key="id"
              label-en-key="label_en"
              label-fr-key="label_fr"
              :query="{ permission_action: selectedMonitor.id ? 'update' : 'create' }"
              searchable />
          </UFormField>
          <UFormField :label="t('agreement.monitors.tentative_fiscal_year')" name="egcs_fc_tentativefiscalyear">
            <CommonServerLookupSelect
              v-model="selectedMonitor.egcs_fc_tentativefiscalyear"
              :fetch-url="`/api/agreements/${agreementId}/monitors/lookups/fiscal-years`"
              value-key="id"
              label-en-key="label_en"
              label-fr-key="label_fr"
              :show-value-in-label="false"
              :query="{ permission_action: selectedMonitor.id ? 'update' : 'create' }"
              searchable />
          </UFormField>
          <UFormField :label="t('agreement.monitors.tentative_quarter')" name="egcs_fc_tentativequarter">
            <UInputNumber v-model="selectedMonitor.egcs_fc_tentativequarter" :min="1" :max="4" />
          </UFormField>
          <UFormField :label="t('agreement.monitors.onsite')" name="egcs_fc_onsite">
            <USwitch v-model="selectedMonitor.egcs_fc_onsite" />
          </UFormField>
          <div class="flex justify-end gap-2 pt-4">
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="isMonitorModalOpen = false" />
            <CommonSaveButton :label="selectedMonitor.id ? t('common.update') : t('common.add')" :loading="isSavingMonitor" :disabled="isSavingMonitor" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
