<script setup lang="ts">
import { watch } from 'vue'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import { appRouteLocations } from '~/utils/route-locations'
import { buildTransferPaymentProfileSaveRequest, completeTransferPaymentProfileSave } from '~/utils/transfer-payment-profile-save'
import type { TransferPaymentProfileItem } from '~~/shared/types/schemas'
import type { TransferPaymentProfileForm } from '~~/shared/types/transfer-payment-ui'
import { useCrudModalPending } from '~/composables/useCrudModal'

const { agencyId } = defineProps<{
  agencyId: string
}>()

const { t } = useI18n()
const { can } = useCan()
const localePath = useLocalePath()
const toast = useToast()
const { showError } = useApiErrorToast()
const { formatDate, toDateInput } = useDateHelpers()
const availabilityItems = computed(() => [
  { label: t('common.all'), value: 'all' },
  { label: t('common.active'), value: 'active' },
  { label: t('common.inactive'), value: 'inactive' }
])

const { search, statusFilter, pagination, items, totalRecords, refresh, status } =
  useResourceTable<TransferPaymentProfileItem>({
    fetchUrl: computed(() => `/api/agency/${agencyId}/programs`)
  })

const columns: TableColumnInput<TransferPaymentProfileItem>[] = [
  { accessorKey: 'egcs_tp_name_en', headerKey: 'transfer_payment.title' },
  { id: 'abbreviation', accessorKey: 'egcs_tp_abbreviation_en', headerKey: 'transfer_payment.abbreviation' },
  { accessorKey: 'egcs_tp_active', headerKey: 'transfer_payment.status' },
  { accessorKey: 'egcs_tp_datestart', headerKey: 'transfer_payment.start_date' },
  { accessorKey: 'egcs_tp_dateend', headerKey: 'transfer_payment.end_date' }
]

const bilingualColumns: BilingualColumnConfig<TransferPaymentProfileItem>[] = [
  { id: 'abbreviation', accessorKey: { en: 'egcs_tp_abbreviation_en', fr: 'egcs_tp_abbreviation_fr' } }
]
const { isWizardOpen, isSavingWizard, saveWizard } = useTransferPaymentWizard(refresh)
const canCreateTransferPayment = computed(() =>
  can('transfer_payment', 'create', { type: 'agency', agencyId: String(agencyId) })
)

const {
  isOpen: isProfileModalOpen,
  selected: selectedProfile,
  openCreate: openCreateProfile,
  captureSession: captureProfileSession,
  closeSession: closeProfileSession
} = useCrudModal<TransferPaymentProfileItem, TransferPaymentProfileForm>({
  createState: () => ({
    egcs_tp_active: false,
    egcs_tp_agency: agencyId
  }),
  /**
   * Transforms a transfer payment profile item into a form state.
   *
   * @param profile - The profile item to transform.
   * @returns The prepared transfer payment profile form state.
   */
  updateState: profile => ({
    ...profile,
    egcs_tp_datestart: toDateInput(profile.egcs_tp_datestart),
    egcs_tp_dateend: toDateInput(profile.egcs_tp_dateend)
  })
})
const profilePending = useCrudModalPending(captureProfileSession)
const isSavingProfile = profilePending.isPending
watch(() => agencyId, () => {
  isProfileModalOpen.value = false
  selectedProfile.value = null
})

/**
 * Saves or updates a transfer payment profile.
 * Performs a POST if the profile has no ID (new), or a PATCH if it does (update).
 * Refreshes the dataset and provides user feedback via toasts on success or error.
 */
const saveProfile = async () => {
  const payload = selectedProfile.value
  if (!payload) return
  const session = captureProfileSession()
  if (!profilePending.begin(session)) return

  try {
    const request = buildTransferPaymentProfileSaveRequest(payload, agencyId)
    await ($fetch as (url: string, options: Record<string, unknown>) => Promise<unknown>)(request.url, {
      method: request.method,
      body: request.body
    })
    await completeTransferPaymentProfileSave({
      isUpdate: request.isUpdate,
      close: () => closeProfileSession(session),
      refresh,
      t,
      toast
    })
  } catch (error: unknown) {
    showError(error)
  } finally {
    profilePending.end(session)
  }
}
</script>

<template>
  <div class="space-y-6">
    <CommonResourceLayoutCard
      v-model:search="search"
      v-model:status-filter="statusFilter"
      v-model:pagination="pagination"
      :data="items"
      :columns="columns"
      :bilingual-columns="bilingualColumns"
      :total-records="totalRecords"
      :button-label="t('transfer_payment.new')"
      :show-button="canCreateTransferPayment"
      :loading="status === 'pending'"
      :request-status="status"
      @add="openCreateProfile"
      @retry="refresh">
      <template #filters>
        <USelect v-model="statusFilter" :items="availabilityItems" :aria-label="t('common.status_filter')" class="min-w-40" />
      </template>
      <template #actions>
        <UButton
          v-if="canCreateTransferPayment"
          :label="t('transfer_payment.wizard_new')"
          icon="i-lucide-wand-2"
          color="neutral"
          variant="outline"
          @click="isWizardOpen = true" />
      </template>

      <template #egcs_tp_name_en-cell="{ row }">
        <CommonBilingualName
          :name-en="row.original.egcs_tp_name_en"
          :name-fr="row.original.egcs_tp_name_fr"
          :to="localePath(appRouteLocations.transferPaymentDetail(String(row.original.id)))" />
      </template>

      <template #egcs_tp_active-cell="{ row }">
        <CommonStatusBadge :variant="row.original.egcs_tp_active ? 'active' : 'inactive'" />
      </template>

      <template #egcs_tp_datestart-cell="{ row }">
        <span class="text-sm text-zinc-500 dark:text-zinc-400">
          {{ formatDate(row.original.egcs_tp_datestart) }}
        </span>
      </template>

      <template #egcs_tp_dateend-cell="{ row }">
        <span class="text-sm text-zinc-500 dark:text-zinc-400">
          {{ formatDate(row.original.egcs_tp_dateend) }}
        </span>
      </template>
    </CommonResourceLayoutCard>

    <TransferPaymentWizardModal
      v-model:open="isWizardOpen"
      :fixed-agency-id="agencyId"
      :pending="isSavingWizard"
      @submit="saveWizard" />

    <TransferPaymentModal
      v-if="selectedProfile"
      v-model:open="isProfileModalOpen"
      v-model:state="selectedProfile"
      :title="selectedProfile.id ? t('transfer_payment.update_title') : t('transfer_payment.create_title')"
      :submit-label="selectedProfile.id ? t('common.update') : t('common.add')"
      :fixed-agency-id="agencyId"
      :pending="isSavingProfile"
      @submit="saveProfile" />
  </div>
</template>
