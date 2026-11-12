<script setup lang="ts">
import { onScopeDispose } from 'vue'
import { useActionContext } from '~/composables/useActionContext'
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
const toast = useLocalizedToast()
const { can, canAny } = useCan()
const { toDateInput } = useDateHelpers()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
let pageLifetime: 'active' | 'disposed' = 'active'
onScopeDispose(() => {
  pageLifetime = 'disposed'
})
const isPageActive = () => pageLifetime === 'active'

const {
  search,
  statusFilter,
  pagination,
  columnFilters,
  columnVisibility,
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

const profilePending = useCrudModalPending(captureProfileSession)
const isSavingProfile = profilePending.isPending

/**
 * Persists a transfer payment profile via the API.
 * Performs a PATCH if the profile has an ID (update), or a POST if it doesn't (new).
 * Closes the modal, refreshes the table data, and provides success feedback.
 */
const saveProfile = async () => {
  const payload = selectedProfile.value
  const operation = profileContext.capture()
  const pageOperation = pageContext.capture()
  if (!isPageActive() || !payload || !operation?.canDispatch()) return
  const session = captureProfileSession()
  if (session === null || !profilePending.begin(session)) return

  let completed = false
  try {
    const request = buildTransferPaymentProfileSaveRequest(payload)
    const response = await fetch(getClientRequestUrl(request.url), {
      method: request.method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request.body)
    })
    if (!response.ok) await throwFetchResponseError(response)

    if (!isPageActive() || !pageOperation?.isCurrent()) return
    if (!operation.isCurrent() || captureProfileSession() !== session) {
      await refresh()
      return
    }
    completed = true
    await completeTransferPaymentProfileSave({
      isUpdate: request.isUpdate,
      close: () => closeProfileSession(session),
      refresh,
      t,
      toast
    })
  } catch (error: unknown) {
    if (isPageActive() && pageOperation?.isCurrent() && ((operation.isCurrent() && captureProfileSession() === session) || (completed && captureProfileSession() === null))) showError(error)
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
  const operation = deleteContext.capture()
  const profileId = profile.id
  const agencyId = profile.egcs_tp_agency
  const currentTarget = () => profiles.value.find(row => row.id === profileId && row.egcs_tp_agency === agencyId)
  const target = currentTarget()
  if (!isPageActive() || !operation?.canDispatch() || !target || !canDeleteProfile(target)) return
  try {
    const deleted = await confirmDeleteRequest(`/api/transfer-payments/${profile.id}`, {
      operation,
      target: { id: profileId, resolve: currentTarget, eligible: canDeleteProfile },
      shouldProceed: () => {
        const current = currentTarget()
        return isPageActive() && Boolean(current && canDeleteProfile(current))
      }
    })
    if (!deleted || !isPageActive() || !operation.isCurrent()) return
    await refresh()
    if (!isPageActive() || !operation.isCurrent()) return
    toast.add({
      title: toast.localized('common.success'),
      description: toast.localized('common.deleted_success'),
      color: 'success'
    })
  } catch (error: unknown) {
    if (isPageActive() && operation.isCurrent()) showError(error)
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
const canUpdateProfile = (profile: Pick<TransferPaymentProfileForm, 'id' | 'egcs_tp_agency'>) => {
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
const pageContext = useActionContext({ identity: [], authority: () => canAny('transfer_payment', 'read', ['global', 'agency', 'program']) })
const wizardContext = useActionContext({ identity: [], authority: canCreateProfile })
const { isWizardOpen, isSavingWizard, saveWizard } = useTransferPaymentWizard(refresh, {
  context: wizardContext,
  collectionContext: pageContext
})
const currentProfile = computed(() => profiles.value.find(profile => profile.id === selectedProfile.value?.id))
const profileContext = useActionContext({
  identity: [() => selectedProfile.value?.id, () => currentProfile.value?.egcs_tp_agency ?? selectedProfile.value?.egcs_tp_agency],
  authority: () => selectedProfile.value?.id
    ? canUpdateProfile(selectedProfile.value)
    : canAny('transfer_payment', 'create', ['global', 'agency']),
  eligible: () => !selectedProfile.value?.id || Boolean(currentProfile.value
    && currentProfile.value.egcs_tp_agency === selectedProfile.value.egcs_tp_agency)
})
const deleteContext = useActionContext({
  identity: [],
  authority: () => canAny('transfer_payment', 'delete', ['global', 'agency', 'program'])
})
</script>

<template>
  <CommonDetailPage id="transfer-payments" v-model:collapsed="isHeroCollapsed" :title="t('transfer_payment.title')">
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
        :action-context="wizardContext"
        :pending="isSavingWizard"
        @submit="saveWizard" />

      <TransferPaymentModal
        v-if="selectedProfile"
        v-model:open="isProfileModalOpen"
        v-model:state="selectedProfile"
        :title="selectedProfile.id ? t('transfer_payment.update_title') : t('transfer_payment.create_title')"
        :submit-label="selectedProfile.id ? t('common.update') : t('common.add')"
        :pending="isSavingProfile"
        :action-context="profileContext"
        @submit="saveProfile" />
    </template>
  </CommonDetailPage>
</template>
