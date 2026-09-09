<script setup lang="ts">
import { useCrudModalPending } from '~/composables/useCrudModal'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { onBeforeUnmount, watch } from 'vue'
import type { Ref } from 'vue'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import { appRouteLocations } from '~/utils/route-locations'
import type { TransferPaymentStreamItem, TransferPaymentStreamPolymorphicWizard } from '~~/shared/types/schemas'
import type { TransferPaymentStreamRow } from '~~/shared/types/transfer-payment-ui'

const { programId, agencyId, canUpdateChild, canDeleteChild } = defineProps<{
  programId: string
  agencyId?: string | null
  canUpdateChild: boolean
  canDeleteChild: boolean
}>()

const { t } = useI18n()
const toast = useToast()
const localePath = useLocalePath()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const { getBilingualValue } = useBilingualValue()
const getStreamActionTarget = (stream: TransferPaymentStreamRow) =>
  `${getBilingualValue(stream, 'egcs_tp_name', String(stream.id))} [${stream.id}]`
const availabilityItems = computed(() => [
  { label: t('common.all'), value: 'all' },
  { label: t('common.active'), value: 'active' },
  { label: t('common.inactive'), value: 'inactive' }
])

const {
  search: streamSearch,
  statusFilter: streamStatus,
  pagination: streamPagination,
  items: streams,
  totalRecords: streamTotal,
  refresh: refreshStreams,
  status: streamStatusState
} = useResourceTable<TransferPaymentStreamRow>({
  fetchUrl: computed(() => `/api/transfer-payments/${programId}/streams`)
})
const { isStreamWizardOpen, isSavingStreamWizard, saveStreamWizard } = useTransferPaymentStreamWizard(
  () => programId,
  async () => {
    await refreshStreams()
    return streamStatusState.value === 'success'
  }
)

const submitStreamWizard = async (data: TransferPaymentStreamPolymorphicWizard) => {
  if (disposed || !canUpdateChild) return
  await saveStreamWizard(data)
}

const streamColumns: TableColumnInput<TransferPaymentStreamRow>[] = [
  { id: 'name', accessorKey: 'egcs_tp_name_en', headerKey: 'transfer_payment.name_en' },
  { id: 'abbreviation', accessorKey: 'egcs_tp_abbreviation_en', headerKey: 'transfer_payment.abbreviation' },
  { accessorKey: 'egcs_tp_active', headerKey: 'transfer_payment.status' },
  { id: 'parent', accessorKey: 'parent_name_en', headerKey: 'transfer_payment.parent_stream' },
  { id: 'actions', headerKey: 'common.actions' }
]

const streamBilingualColumns: BilingualColumnConfig<TransferPaymentStreamRow>[] = [
  { id: 'name', accessorKey: { en: 'egcs_tp_name_en', fr: 'egcs_tp_name_fr' } },
  { id: 'abbreviation', accessorKey: { en: 'egcs_tp_abbreviation_en', fr: 'egcs_tp_abbreviation_fr' } },
  { id: 'parent', accessorKey: { en: 'parent_name_en', fr: 'parent_name_fr' } }
]

let contextGeneration = 0
let disposed = false
const isCurrentContext = (generation: number) => !disposed && generation === contextGeneration

const streamModal = useCrudModal<TransferPaymentStreamRow, Partial<TransferPaymentStreamItem>>({
  createState: () => ({ egcs_tp_allowsfurtherdistribution: false, egcs_tp_active: false }),
  updateState: stream => ({ ...stream })
})

const isStreamModalOpen: Ref<boolean> = streamModal.isOpen
const selectedStream: Ref<Partial<TransferPaymentStreamItem> | null> = streamModal.selected
const openCreateStream = () => {
  if (!disposed && canUpdateChild) streamModal.openCreate()
}
/** @param stream - Current table row to edit. */
const openUpdateStream = (stream: TransferPaymentStreamRow) => {
  if (disposed || !canUpdateChild) return
  const current = streams.value.find(row => String(row.id) === String(stream.id))
  if (current) streamModal.openUpdate(current)
}
const streamPending = useCrudModalPending(streamModal.captureSession)
const isSavingStream = streamPending.isPending

/**
 * Saves the currently selected stream record.
 * Performs a PATCH if the record has an ID (update), or a POST if it doesn't (new).
 * Corrects the parent stream reference, closes the modal, refreshes data, and provides success feedback.
 */
const saveStream = async () => {
  if (disposed || !selectedStream.value || !canUpdateChild) return
  const session = streamModal.captureSession()
  if (!streamPending.begin(session)) return
  const generation = contextGeneration
  const requestedProgramId = programId
  const payload = {
    ...selectedStream.value,
    egcs_tp_parentstream: selectedStream.value.egcs_tp_parentstream || null
  }
  const isUpdate = Boolean(payload.id)
  let closedSession = false
  try {
    const response = await fetch(getClientRequestUrl(payload.id
      ? `/api/transfer-payments/${requestedProgramId}/streams/${payload.id}`
      : `/api/transfer-payments/${requestedProgramId}/streams`), {
      method: isUpdate ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    })
    if (!response.ok) await throwFetchResponseError(response)
    if (!isCurrentContext(generation)) return
    closedSession = streamModal.closeSession(session)
  } catch (error: unknown) {
    if (isCurrentContext(generation) && streamModal.captureSession() === session) showError(error)
    return
  } finally {
    streamPending.end(session)
  }

  try {
    await refreshStreams()
    if (!isCurrentContext(generation) || !closedSession || streamModal.captureSession() !== null || streamStatusState.value === 'error') return
    toast.add({
      title: t('common.success'),
      description: t(isUpdate ? 'common.updated_success' : 'common.added_success'),
      color: 'success'
    })
  } catch (error: unknown) {
    if (isCurrentContext(generation)) showError(error)
  }
}

/**
 * Initiates the deletion process for a specific stream record.
 * Displays a confirmation dialog before calling the deletion API.
 * Refreshes the stream dataset and provides feedback on successful removal.
 *
 * @param {TransferPaymentStreamRow} stream - The stream record to be deleted.
 */
const deleteStream = async (stream: TransferPaymentStreamRow) => {
  if (disposed || !canDeleteChild || !streams.value.some(row => String(row.id) === String(stream.id))) return
  const generation = contextGeneration
  const requestedProgramId = programId
  try {
    const ok = await confirmDeleteRequest(`/api/transfer-payments/${requestedProgramId}/streams/${stream.id}`)
    if (!ok || !isCurrentContext(generation)) return
    await refreshStreams()
    if (!isCurrentContext(generation) || streamStatusState.value === 'error') return
    toast.add({ title: t('common.success'), description: t('common.deleted_success'), color: 'success' })
  } catch (error: unknown) {
    if (isCurrentContext(generation)) showError(error)
  }
}

watch(() => programId, () => {
  contextGeneration += 1
  streamModal.close()
  isStreamWizardOpen.value = false
}, { flush: 'sync' })
onBeforeUnmount(() => {
  disposed = true
  contextGeneration += 1
})
</script>

<template>
  <div class="space-y-6">
    <CommonResourceLayoutCard
      v-model:search="streamSearch"
      v-model:status-filter="streamStatus"
      v-model:pagination="streamPagination"
      :data="streams"
      :columns="streamColumns"
      :bilingual-columns="streamBilingualColumns"
      :total-records="streamTotal"
      :loading="streamStatusState === 'pending'"
      :request-status="streamStatusState"
      :show-button="canUpdateChild"
      :button-label="t('common.add')"
      @add="openCreateStream"
      @retry="refreshStreams">
      <template #filters>
        <USelect
          v-model="streamStatus"
          :items="availabilityItems"
          :aria-label="t('common.status_filter')"
          class="min-w-40" />
      </template>
      <template #actions>
        <UButton
          :label="t('transfer_payment.stream_wizard_new')"
          icon="i-lucide-wand-sparkles"
          color="neutral"
          variant="outline"
          :disabled="!canUpdateChild"
          @click="isStreamWizardOpen = true" />
      </template>

      <template #name-cell="{ row }">
        <CommonBilingualName
          :name-en="row.original.egcs_tp_name_en"
          :name-fr="row.original.egcs_tp_name_fr"
          :to="localePath(appRouteLocations.transferPaymentStreamDetail(programId, String(row.original.id)))" />
      </template>

      <template #egcs_tp_active-cell="{ row }">
        <CommonStatusBadge :variant="row.original.egcs_tp_active ? 'active' : 'inactive'" />
      </template>

      <template #parent-cell="{ row }">
        <span class="text-sm text-zinc-500 dark:text-zinc-400">
          {{ getBilingualValue(row.original, 'parent_name', '') }}
        </span>
      </template>

      <template #actions-cell="{ row }">
        <div class="flex items-center gap-2">
          <UButton
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="!canUpdateChild"
            :aria-label="t('common.edit_named', { name: getStreamActionTarget(row.original) })"
            @click="openUpdateStream(row.original)" />
          <UButton
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            size="sm"
            :disabled="!canDeleteChild"
            :aria-label="t('common.delete_named', { name: getStreamActionTarget(row.original) })"
            @click="deleteStream(row.original)" />
        </div>
      </template>
    </CommonResourceLayoutCard>

    <TransferPaymentStreamModal
      v-if="selectedStream && canUpdateChild"
      v-model:open="isStreamModalOpen"
      v-model:state="selectedStream"
      :title="selectedStream.id ? t('common.update') : t('common.add')"
      :submit-label="selectedStream.id ? t('common.update') : t('common.add')"
      :program-id="programId"
      :pending="isSavingStream"
      @submit="saveStream" />

    <TransferPaymentStreamWizardModal
      v-if="canUpdateChild"
      :key="programId"
      v-model:open="isStreamWizardOpen"
      :program-id="programId"
      :agency-id="agencyId"
      :pending="isSavingStreamWizard"
      @submit="submitStreamWizard" />
  </div>
</template>
