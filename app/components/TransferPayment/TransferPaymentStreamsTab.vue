<script setup lang="ts">
import { useActionContext } from '~/composables/useActionContext'
import { useCrudModalPending } from '~/composables/useCrudModal'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { onBeforeUnmount, watch } from 'vue'
import type { Ref } from 'vue'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import { appRouteLocations } from '~/utils/route-locations'
import type { TransferPaymentStreamItem, TransferPaymentStreamPolymorphicWizard } from '~~/shared/types/schemas'
import type { TransferPaymentStreamRow } from '~~/shared/types/transfer-payment-ui'

const { programId, canUpdateChild, canDeleteChild } = defineProps<{
  programId: string
  canUpdateChild: boolean
  canDeleteChild: boolean
}>()

const { t } = useI18n()
const toast = useLocalizedToast()
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
const wizardContext = useActionContext({
  identity: [() => programId],
  authority: () => canUpdateChild
})
const deleteContext = useActionContext({
  identity: [() => programId],
  authority: () => canDeleteChild
})
const collectionContext = useActionContext({ identity: [() => programId], authority: true })
const { isStreamWizardOpen, isSavingStreamWizard, saveStreamWizard } = useTransferPaymentStreamWizard(
  () => programId,
  async () => {
    await refreshStreams()
    return streamStatusState.value === 'success'
  },
  { context: wizardContext, collectionContext }
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

const persistedStream: Ref<TransferPaymentStreamRow | null> = ref(null)
const persistedProgramId: Ref<string | null> = ref(null)
const streamModal = useCrudModal<TransferPaymentStreamRow, Partial<TransferPaymentStreamItem>>({
  /**
   * Starts a new draft without a saved parent reference.
   * @returns Default flags for a new Stream.
   */
  createState: () => {
    persistedStream.value = null
    persistedProgramId.value = null
    return { egcs_tp_allowsfurtherdistribution: false, egcs_tp_active: false }
  },
  /**
   * Captures the saved parent independently of the editable draft.
   * @param stream - Saved row whose parent label belongs to this edit session.
   * @returns A separate editable Stream draft.
   */
  updateState: stream => {
    persistedStream.value = { ...stream }
    persistedProgramId.value = programId
    return { ...stream }
  }
})

const profileContext = useActionContext({
  identity: [() => programId],
  authority: () => canUpdateChild,
  eligible: () => persistedStream.value === null || streams.value.some(row => row.id === persistedStream.value?.id)
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
  const operation = profileContext.capture()
  const collectionOperation = collectionContext.capture()
  if (!operation) return
  const session = streamModal.captureSession()
  if (!streamPending.begin(session)) return
  const generation = contextGeneration
  const requestedProgramId = programId
  const targetId = persistedStream.value?.id ?? null
  const payload = {
    ...selectedStream.value,
    egcs_tp_parentstream: selectedStream.value.egcs_tp_parentstream || null
  }
  const isUpdate = targetId !== null
  let closedSession = false
  try {
    const response = await fetch(getClientRequestUrl(targetId
      ? `/api/transfer-payments/${requestedProgramId}/streams/${targetId}`
      : `/api/transfer-payments/${requestedProgramId}/streams`), {
      method: isUpdate ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    })
    if (!response.ok) await throwFetchResponseError(response)
    if (!operation.isCurrent() || !isCurrentContext(generation)) {
      if (collectionOperation?.isCurrent()) await refreshStreams()
      return
    }
    closedSession = streamModal.closeSession(session)
  } catch (error: unknown) {
    if (operation.isCurrent() && isCurrentContext(generation) && streamModal.captureSession() === session) showError(error)
    return
  } finally {
    streamPending.end(session)
  }

  try {
    await refreshStreams()
    if (!operation.isCurrent() || !isCurrentContext(generation) || !closedSession || !streamModal.isLatestSession(session) || streamStatusState.value === 'error') return
    toast.add({
      title: toast.localized('common.success'),
      description: toast.localized(isUpdate ? 'common.updated_success' : 'common.added_success'),
      color: 'success'
    })
  } catch (error: unknown) {
    if (operation.isCurrent() && isCurrentContext(generation)) showError(error)
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
  if (disposed || !canDeleteChild) return
  const operation = deleteContext.capture()
  if (!operation) return
  const targetId = stream.id
  const requestedProgramId = programId
  try {
    const ok = await confirmDeleteRequest(`/api/transfer-payments/${requestedProgramId}/streams/${targetId}`, {
      operation,
      target: {
        id: targetId,
        resolve: () => streams.value.find(row => row.id === targetId),
        eligible: () => canDeleteChild
      }
    })
    if (!ok || !operation.isCurrent()) return
    await refreshStreams()
    if (!operation.isCurrent() || streamStatusState.value === 'error') return
    toast.add({ title: toast.localized('common.success'), description: toast.localized('common.deleted_success'), color: 'success' })
  } catch (error: unknown) {
    if (operation.isCurrent()) showError(error)
  }
}

watch(() => programId, () => {
  contextGeneration += 1
  streamModal.close()
  isStreamWizardOpen.value = false
}, { flush: 'sync' })
watch(wizardContext.version, () => {
  streamModal.close()
  isStreamWizardOpen.value = false
}, { flush: 'sync' })
onBeforeUnmount(() => {
  disposed = true
  contextGeneration += 1
})
</script>

<template>
  <div class="space-y-6" data-field-scope="transfer-payment.streams-tab">
    <CommonResourceLayout
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
          class="min-w-40" data-ui-target="transfer-payment.streams-tab.streamStatus" />
      </template>
      <template #actions>
        <UButton
          v-if="canUpdateChild"
          :label="t('transfer_payment.stream_wizard_new')"
          icon="i-lucide-wand-sparkles"
          color="neutral"
          variant="outline"
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
          <CommonActionButton
            v-if="canUpdateChild"
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="t('common.edit_named', { name: getStreamActionTarget(row.original) })"
            @click="openUpdateStream(row.original)" />
          <CommonActionButton
            v-if="canDeleteChild"
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            size="sm"
            :aria-label="t('common.delete_named', { name: getStreamActionTarget(row.original) })"
            @click="deleteStream(row.original)" />
        </div>
      </template>
    </CommonResourceLayout>

    <TransferPaymentStreamModal
      v-if="selectedStream && canUpdateChild"
      v-model:open="isStreamModalOpen"
      v-model:state="selectedStream"
      :title="selectedStream.id ? t('common.update') : t('common.add')"
      :submit-label="selectedStream.id ? t('common.update') : t('common.add')"
      :program-id="programId"
      :persisted-stream="persistedStream ?? undefined"
      :persisted-program-id="persistedProgramId ?? undefined"
      :action-context="profileContext"
      :pending="isSavingStream"
      @submit="saveStream" />

    <TransferPaymentStreamWizardModal
      v-if="canUpdateChild"
      :key="programId"
      v-model:open="isStreamWizardOpen"
      :program-id="programId"
      :action-context="wizardContext"
      :pending="isSavingStreamWizard"
      @submit="submitStreamWizard" />
  </div>
</template>
