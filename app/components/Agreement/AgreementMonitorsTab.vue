<script setup lang="ts">
import { useCrudModalPending } from '~/composables/useCrudModal'
import { useBusinessStatusState } from '~/composables/useBusinessStatusState'
/* eslint-disable jsdoc/require-jsdoc -- Monitor table callbacks are exercised by focused component tests. */
import { computed, onBeforeUnmount, ref, shallowReactive, watch } from 'vue'
import type { Ref } from 'vue'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { useAgreementOverview } from '~/composables/useAgreementOverview'
import { useJsonRequest } from '~/composables/useJsonRequest'
import { appRouteLocations } from '~/utils/route-locations'
import type { FundingCaseAgreementMonitorForm, FundingCaseAgreementMonitorRow, FundingCaseAgreementProfileRow } from '~~/shared/types/funding-case-agreement-ui'
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
const toast = useLocalizedToast()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const confirmDelete = useDeleteConfirm()
const statusCatalog = useStatusCatalog()
const { getBilingualValue } = useBilingualValue()
const { saveJson } = useJsonRequest()
const { isRecordLocked } = useBusinessStatusState()

const search: Ref<string> = ref('')
const pagination: Ref<{ pageIndex: number, pageSize: number }> = ref({ pageIndex: 0, pageSize: 25 })
const pendingMonitorDeletes = shallowReactive(new Set<string>())
const pendingMonitorActions = shallowReactive(new Set<string>())
let actionGeneration = 0
let modalIntent = 0
let disposed = false
onBeforeUnmount(() => {
  disposed = true
  actionGeneration += 1
})

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
watch(agreementIdRef, () => {
  actionGeneration += 1
  monitorModal.close()
  pendingMonitorActions.clear()
}, { flush: 'sync' })

const editingMonitor: Ref<FundingCaseAgreementMonitorRow | null> = ref(null)
const selectedMonitor = monitorModal.selected
const savedMonitorTypeOptions = computed(() => {
  const saved = editingMonitor.value
  if (!saved || selectedMonitor.value?.id !== saved.id || selectedMonitor.value.egcs_fc_type !== saved.egcs_fc_type) return []
  return [{ value: saved.egcs_fc_type, label: getBilingualValue(saved, 'monitor_type_name', saved.egcs_fc_type) }]
})
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

const checkPrerequisites = async (action: 'create' | 'update' | 'delete', monitorId?: string, isCurrent: () => boolean = () => true) => {
  const owner = agreementId
  const generation = actionGeneration
  const current = () => !disposed && owner === agreementId && generation === actionGeneration && isCurrent()
  try {
    const [parent, record, roster] = await Promise.all([
      $fetch<FundingCaseAgreementProfileRow, string>(`/api/agreements/${owner}`),
      monitorId ? $fetch<FundingCaseAgreementMonitorRow, string>(`/api/agreements/${owner}/monitors/${monitorId}`) : Promise.resolve(null),
      monitorId ? $fetch<{ is_assigned: boolean }, string>(`/api/entity-assignments/fundingcasemonitor/${monitorId}`) : Promise.resolve(null)
    ])
    if (!current()) return false
    await statusCatalog.load()
    if (!current()) return false
    const permitted = action === 'create'
      ? parent.can_create_child_records_role
      : action === 'update' ? parent.can_update_child_records_role : parent.can_delete_child_records_role
    if (permitted === true && !isRecordLocked(parent)
      && (action === 'create' ? parent.can_create_child_records === true : record && !isRecordLocked(record) && roster?.is_assigned === true)) return record ?? true
    toast.add({ title: toast.localized('common.warning'), description: toast.localized(action === 'create' ? 'agreement.child_records.create_prerequisite' : 'agreement.child_records.work_prerequisite'), color: 'warning' })
  } catch (error) {
    if (current()) showError(error)
  }
  return false
}
const openMonitor = async (monitor?: FundingCaseAgreementMonitorRow) => {
  const key = monitor ? String(monitor.id) : 'create'
  if (pendingMonitorActions.has(key) || pendingMonitorDeletes.has(key)) return
  const session = monitorModal.captureSession()
  const intent = ++modalIntent
  const generation = actionGeneration
  pendingMonitorActions.add(key)
  try {
    const ready = await checkPrerequisites(monitor ? 'update' : 'create', monitor ? String(monitor.id) : undefined,
      () => intent === modalIntent && monitorModal.captureSession() === session)
    if (!ready) return
    editingMonitor.value = monitor && typeof ready === 'object' ? ready : null
    if (editingMonitor.value) monitorModal.openUpdate(editingMonitor.value)
    else monitorModal.openCreate()
  } finally { if (generation === actionGeneration) pendingMonitorActions.delete(key) }
}

const saveMonitor = async () => {
  if (!selectedMonitor.value) {
    return
  }
  const monitorState = selectedMonitor.value
  const owner = agreementId
  const generation = actionGeneration
  const isUpdate = Boolean(monitorState.id)
  const session = monitorModal.captureSession()
  if (!monitorPending.begin(session)) return

  try {
    if (!await checkPrerequisites(isUpdate ? 'update' : 'create', isUpdate ? String(monitorState.id) : undefined,
      () => monitorModal.captureSession() === session)) return
    await saveJson(
      isUpdate
        ? `/api/agreements/${owner}/monitors/${monitorState.id}`
        : `/api/agreements/${owner}/monitors`,
      isUpdate ? 'PATCH' : 'POST',
      monitorState
    )
    if (!monitorModal.closeSession(session)) return
    if (!await refreshOverview() || disposed || owner !== agreementId || generation !== actionGeneration) return
    toast.add({ title: toast.localized('common.success'), description: isUpdate ? toast.localized('common.updated_success') : toast.localized('common.added_success'), color: 'success' })
  } catch (error: unknown) {
    if (!disposed && owner === agreementId && generation === actionGeneration && monitorModal.captureSession() === session) showError(error)
  } finally {
    monitorPending.end(session)
  }
}

const deleteMonitor = async (monitorId: string) => {
  if (pendingMonitorDeletes.has(monitorId) || pendingMonitorActions.has(monitorId)) return
  pendingMonitorDeletes.add(monitorId)
  const owner = agreementId
  const generation = actionGeneration
  const current = () => !disposed && owner === agreementId && generation === actionGeneration
  try {
    if (!await checkPrerequisites('delete', monitorId, current)) return
    const ok = await confirmDeleteRequest(`/api/agreements/${owner}/monitors/${monitorId}`, {
      shouldProceed: current,
      confirm: async () => Boolean(await confirmDelete()) && current() && Boolean(await checkPrerequisites('delete', monitorId, current))
    })
    if (!ok || !current()) return
    await refreshOverview()
    if (!current()) return
    toast.add({ title: toast.localized('common.success'), description: toast.localized('common.deleted_success'), color: 'success' })
  } catch (error: unknown) {
    if (current()) showError(error)
  } finally {
    pendingMonitorDeletes.delete(monitorId)
  }
}
</script>

<template>
  <div class="w-full" data-field-tooltip-context="agreement" data-field-scope="agreement.monitors-tab" data-scope-label-en="Agreements > Monitors" data-scope-label-fr="Ententes > Surveillances" data-help-view="agreement.monitors" data-help-label-en="Agreements — Monitors" data-help-label-fr="Ententes — Surveillances" data-help-target="agreement.monitors.content" data-help-kind="section">
    <CommonResourceLayout
      v-model:search="search"
      v-model:pagination="pagination"
      :data="monitors"
      :columns="columns"
      :total-records="monitors.length"
      :loading="overviewStatus === 'pending'"
      :request-status="overviewStatus"
      :button-label="t('agreement.monitors.add')"
      :show-button="canCreate"
      :button-disabled="pendingMonitorActions.has('create')"
      :search-placeholder="t('agreement.monitors.search')"
      help-add-target="agreement.monitors.add"
      help-search-target="agreement.monitors.search" @add="openMonitor()" @retry="refreshOverview">
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
          <CommonActionButton
            :to="localePath(appRouteLocations.agreementMonitorDetail(agreementId, String(row.original.id)))"
            icon="i-lucide-arrow-right"
            color="neutral"
            variant="ghost"
            class="cursor-default"
            :aria-label="t('common.open')" />
          <CommonActionButton
            v-if="canUpdate"
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            class="cursor-default"
            :disabled="pendingMonitorActions.has(String(row.original.id)) || pendingMonitorDeletes.has(String(row.original.id))"
            :aria-label="t('common.edit')"
            @click="openMonitor(row.original)" />
          <CommonActionButton
            v-if="canDelete"
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            class="cursor-default"
            :disabled="pendingMonitorDeletes.has(String(row.original.id)) || pendingMonitorActions.has(String(row.original.id))"
            :aria-label="t('common.delete')"
            @click="deleteMonitor(String(row.original.id))" />
        </div>
      </template>
    </CommonResourceLayout>

    <UModal
      v-if="selectedMonitor"
      v-model:open="isMonitorModalOpen" data-field-scope="agreement.monitors-tab" data-scope-label-en="Agreements > Monitors > Create or update Monitor" data-scope-label-fr="Ententes > Surveillances > Créer ou mettre à jour la surveillance"
      :title="selectedMonitor.id ? t('agreement.monitors.edit') : t('agreement.monitors.add')">
      <template #body>
        <UForm :state="selectedMonitor" :validate="validateMonitor" :validate-on="[]" class="space-y-4" data-help-view="agreement.monitors.monitor-dialog" data-help-label-en="Agreements — Monitor editor" data-help-label-fr="Ententes — Éditeur de surveillance" @submit="saveMonitor">
          <UFormField :label="t('agreement.monitors.type')" name="egcs_fc_type">
            <CommonServerLookupSelect
              v-model="selectedMonitor.egcs_fc_type"
              :prepend-items="savedMonitorTypeOptions"
              :fetch-url="`/api/agreements/${agreementId}/monitors/lookups/monitor-types`"
              selected-values-query-key="selected_ids"
              value-key="id"
              label-en-key="label_en"
              label-fr-key="label_fr"
              :query="selectedMonitor.id ? { permission_action: 'update', monitorId: selectedMonitor.id } : { permission_action: 'create' }"
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
              selected-values-query-key="selected_ids"
              :query="selectedMonitor.id ? { permission_action: 'update', monitorId: selectedMonitor.id } : { permission_action: 'create' }"
              searchable />
          </UFormField>
          <UFormField :label="t('agreement.monitors.tentative_quarter')" name="egcs_fc_tentativequarter">
            <UInputNumber v-model="selectedMonitor.egcs_fc_tentativequarter" :min="1" :max="4" />
          </UFormField>
          <UFormField :label="t('agreement.monitors.onsite')" name="egcs_fc_onsite">
            <USwitch v-model="selectedMonitor.egcs_fc_onsite" />
          </UFormField>
          <div class="flex justify-end gap-2 pt-4">
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" data-help-target="agreement.monitors.monitor-dialog.cancel" data-help-kind="button" data-help-label-en="Cancel" data-help-label-fr="Annuler" @click="isMonitorModalOpen = false" />
            <CommonSaveButton :label="selectedMonitor.id ? t('common.update') : t('common.add')" :loading="isSavingMonitor" :disabled="isSavingMonitor" data-help-target="agreement.monitors.monitor-dialog.save" data-help-kind="button" data-help-label-en="Save" data-help-label-fr="Enregistrer" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
