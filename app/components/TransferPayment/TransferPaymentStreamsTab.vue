<script setup lang="ts">
import { useCrudModalPending } from '~/composables/useCrudModal'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { watch } from 'vue'
import type { Ref } from 'vue'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import { appRouteLocations } from '~/utils/route-locations'
import type { TransferPaymentStreamItem } from '~~/shared/types/schemas'
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
  refreshStreams
)

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

const streamOptionsResponse: Ref<{ items: TransferPaymentStreamRow[] }> = ref({ items: [] })
const streamOptionsStatus = ref<'idle' | 'pending' | 'success' | 'error'>('idle')
/**
 *
 */
const refreshStreamOptions = async () => {
  streamOptionsStatus.value = 'pending'
  try {
    const requestUrl = getClientRequestUrl(`/api/transfer-payments/${programId}/streams`)
    requestUrl.searchParams.set('page', '1')
    requestUrl.searchParams.set('limit', '100')
    const response = await fetch(requestUrl)
    if (!response.ok) await throwFetchResponseError(response)
    streamOptionsResponse.value = await response.json() as { items: TransferPaymentStreamRow[] }
    streamOptionsStatus.value = 'success'
  } catch (error) {
    streamOptionsStatus.value = 'error'
    throw error
  }
}
await refreshStreamOptions()

const streamModal = useCrudModal<TransferPaymentStreamRow, Partial<TransferPaymentStreamItem>>({
  createState: () => ({ egcs_tp_allowsfurtherdistribution: false, egcs_tp_active: false }),
  updateState: stream => ({ ...stream })
})

const isStreamModalOpen: Ref<boolean> = streamModal.isOpen
const selectedStream: Ref<Partial<TransferPaymentStreamItem> | null> = streamModal.selected
const openCreateStream = () => {
  if (canUpdateChild && streamOptionsStatus.value === 'success') streamModal.openCreate()
}
const openUpdateStream = streamModal.openUpdate
const streamPending = useCrudModalPending(streamModal.captureSession)
const isSavingStream = streamPending.isPending

/**
 * Saves the currently selected stream record.
 * Performs a PATCH if the record has an ID (update), or a POST if it doesn't (new).
 * Corrects the parent stream reference, closes the modal, refreshes data, and provides success feedback.
 */
const saveStream = async () => {
  if (!selectedStream.value || !canUpdateChild) return
  const session = streamModal.captureSession()
  if (!streamPending.begin(session)) return
  const payload = {
    ...selectedStream.value,
    egcs_tp_parentstream: selectedStream.value.egcs_tp_parentstream || null
  }
  const isUpdate = Boolean(selectedStream.value.id)
  try {
    const response = await fetch(getClientRequestUrl(selectedStream.value.id
      ? `/api/transfer-payments/${programId}/streams/${selectedStream.value.id}`
      : `/api/transfer-payments/${programId}/streams`), {
      method: selectedStream.value.id ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    })
    if (!response.ok) await throwFetchResponseError(response)
    if (!streamModal.closeSession(session)) return
  } catch (error: unknown) {
    if (streamModal.captureSession() === session) showError(error)
    return
  } finally {
    streamPending.end(session)
  }

  toast.add({
    title: t('common.success'),
    description: t(isUpdate ? 'common.updated_success' : 'common.added_success'),
    color: 'success'
  })
  try {
    await Promise.all([refreshStreams(), refreshStreamOptions()])
  } catch (error: unknown) {
    showError(error)
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
  try {
    const ok = await confirmDeleteRequest(`/api/transfer-payments/${programId}/streams/${stream.id}`)
    if (!ok) return
    toast.add({ title: t('common.success'), description: t('common.deleted_success'), color: 'success' })
  } catch (error: unknown) {
    showError(error)
    return
  }
  try {
    await Promise.all([refreshStreams(), refreshStreamOptions()])
  } catch (error: unknown) {
    showError(error)
  }
}

watch(() => programId, async () => {
  streamModal.close()
  isStreamWizardOpen.value = false
  try {
    await refreshStreamOptions()
  } catch (error: unknown) {
    showError(error)
  }
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
      :show-button="canUpdateChild && streamOptionsStatus === 'success'"
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
          :disabled="!canUpdateChild || streamOptionsStatus !== 'success'"
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
      :parent-streams="streamOptionsResponse?.items || []"
      :pending="isSavingStream"
      @submit="saveStream" />

    <TransferPaymentStreamWizardModal
      v-if="canUpdateChild"
      v-model:open="isStreamWizardOpen"
      :program-id="programId"
      :agency-id="agencyId"
      :pending="isSavingStreamWizard"
      @submit="saveStreamWizard" />
  </div>
</template>
