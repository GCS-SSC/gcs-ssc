<script setup lang="ts">
import { useCrudModalPending } from '~/composables/useCrudModal'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import {
  buildTransferPaymentHeroStats,
  buildTransferPaymentProfileSaveRequest,
  completeTransferPaymentProfileSave
} from '~/utils/transfer-payment-profile-save'
import type { ComputedRef } from 'vue'
import type { TransferPaymentProfileForm, TransferPaymentProfileRow } from '~~/shared/types/transfer-payment-ui'

definePageMeta({
  i18n: {
    paths: {
      en: '/transfer-payments',
      fr: '/paiements-de-transfert'
    }
  }
})

const { t } = useI18n()
const toast = useToast()
const { can, canAny } = useCan()
const { toDateInput } = useDateHelpers()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()

const {
  search,
  statusFilter,
  pagination,
  columnFilters,
  columnVisibility,
  rowSelection,
  items: profiles,
  totalRecords,
  response,
  refresh,
  retry,
  status
} = useResourceTable<TransferPaymentProfileRow>({
  fetchUrl: '/api/transfer-payments'
})

const {
  isOpen: isProfileModalOpen,
  selected: selectedProfile,
  openCreate: openCreateProfile,
  openUpdate: openUpdateProfile,
  captureSession: captureProfileSession,
  closeSession: closeProfileSession
} = useCrudModal<TransferPaymentProfileRow, TransferPaymentProfileForm>({
  createState: () => ({
    egcs_tp_active: false
  }),
  /**
   * Transforms a transfer payment profile row into a form state.
   *
   * @param profile - The profile row to transform.
   * @returns The prepared transfer payment profile form state.
   */
  updateState: profile => ({
    ...profile,
    egcs_tp_datestart: toDateInput(profile.egcs_tp_datestart),
    egcs_tp_dateend: toDateInput(profile.egcs_tp_dateend)
  })
})

const { isWizardOpen, isSavingWizard, saveWizard } = useTransferPaymentWizard(refresh)
const profilePending = useCrudModalPending(captureProfileSession)
const isSavingProfile = profilePending.isPending

/**
 * Persists a transfer payment profile via the API.
 * Performs a PATCH if the profile has an ID (update), or a POST if it doesn't (new).
 * Closes the modal, refreshes the table data, and provides success feedback.
 */
const saveProfile = async () => {
  const payload = selectedProfile.value
  if (!payload) return
  const session = captureProfileSession()
  if (!profilePending.begin(session)) return

  try {
    const request = buildTransferPaymentProfileSaveRequest(payload)
    const response = await fetch(getClientRequestUrl(request.url), {
      method: request.method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request.body)
    })
    if (!response.ok) await throwFetchResponseError(response)

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

/**
 * Initiates the deletion process for a specific transfer payment profile record.
 * Displays a confirmation dialog before calling the deletion API.
 * Refreshes the dataset and provides success feedback upon removal.
 *
 * @param {TransferPaymentProfileRow} profile - The profile record to be deleted.
 */
const deleteProfile = async (profile: TransferPaymentProfileRow) => {
  try {
    const deleted = await confirmDeleteRequest(`/api/transfer-payments/${profile.id}`)
    if (!deleted) return
    await refresh()
    toast.add({
      title: t('common.success'),
      description: t('common.deleted_success'),
      color: 'success'
    })
  } catch (error: unknown) {
    showError(error)
  }
}

const { getHeroCollapsed } = useDashboard()
const isHeroCollapsed = getHeroCollapsed('transfer-payments')
const transferPaymentHeroStats = computed(() => buildTransferPaymentHeroStats(response.value, t))

const canCreateProfile: ComputedRef<boolean> = computed(() =>
  canAny('transfer_payment', 'create', ['global', 'agency'])
)

/**
 * Determines whether the current user is authorized to update a specific transfer payment profile.
 * Performs a granular permission check based on the profile's agency and unique identifier.
 *
 * @param {TransferPaymentProfileRow} profile - The profile record to check update permissions for.
 * @returns {boolean} True if authorized.
 */
const canUpdateProfile = (profile: TransferPaymentProfileRow) => {
  return can('transfer_payment', 'update', {
    type: 'entity',
    agencyId: String(profile.egcs_tp_agency),
    path: [{ type: 'transfer_payment', id: String(profile.id) }]
  })
}

/**
 * Determines whether the current user is authorized to delete a specific transfer payment profile.
 * Performs a granular permission check based on the profile's agency and unique identifier.
 *
 * @param {TransferPaymentProfileRow} profile - The profile record to check deletion permissions for.
 * @returns {boolean} True if authorized.
 */
const canDeleteProfile = (profile: TransferPaymentProfileRow) => {
  return can('transfer_payment', 'delete', {
    type: 'entity',
    agencyId: String(profile.egcs_tp_agency),
    path: [{ type: 'transfer_payment', id: String(profile.id) }]
  })
}
</script>

<template>
  <UDashboardPanel id="transfer-payments">
    <template #header>
      <UDashboardNavbar :title="t('transfer_payment.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              :icon="isHeroCollapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'"
              :aria-label="t(isHeroCollapsed ? 'common.expand' : 'common.collapse')"
              @click="isHeroCollapsed = !isHeroCollapsed" />
            <CommonNavbarSide />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-1 flex-col overflow-hidden">
        <CommonEntityHero
          :is-collapsed="isHeroCollapsed"
          icon="i-lucide-banknote"
          :title="t('transfer_payment.title')"
          :description="t('transfer_payment.description')"
          :stats="transferPaymentHeroStats" />

        <TransferPaymentProfilesTable
          v-model:search="search"
          v-model:status-filter="statusFilter"
          v-model:pagination="pagination"
          v-model:column-filters="columnFilters"
          v-model:column-visibility="columnVisibility"
          v-model:row-selection="rowSelection"
          :profiles="profiles"
          :total-records="totalRecords"
          :loading="status === 'pending'"
          :request-status="status"
          :can-create="canCreateProfile"
          :can-update="canUpdateProfile"
          :can-delete="canDeleteProfile"
          @retry="retry"
          @add="openCreateProfile"
          @wizard="isWizardOpen = true"
          @edit="openUpdateProfile"
          @delete="deleteProfile" />
      </div>

      <TransferPaymentWizardModal
        v-model:open="isWizardOpen"
        :pending="isSavingWizard"
        @submit="saveWizard" />

      <TransferPaymentModal
        v-if="selectedProfile"
        v-model:open="isProfileModalOpen"
        v-model:state="selectedProfile"
        :title="selectedProfile.id ? t('transfer_payment.update_title') : t('transfer_payment.create_title')"
        :submit-label="selectedProfile.id ? t('common.update') : t('common.add')"
        :pending="isSavingProfile"
        @submit="saveProfile" />
    </template>
  </UDashboardPanel>
</template>
