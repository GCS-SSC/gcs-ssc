<script setup lang="ts">
import { onScopeDispose, watch } from 'vue'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import { appRouteLocations } from '~/utils/route-locations'
import { buildTransferPaymentProfileSaveRequest, completeTransferPaymentProfileSave } from '~/utils/transfer-payment-profile-save'
import type { TransferPaymentProfileItem } from '~~/shared/types/schemas'
import type { TransferPaymentProfileForm } from '~~/shared/types/transfer-payment-ui'
import { useCrudModalPending } from '~/composables/useCrudModal'
import { useActionContext } from '~/composables/useActionContext'

const { agencyId } = defineProps<{
  agencyId: string
}>()

const { t } = useI18n()
const { can } = useCan()
const localePath = useLocalePath()
const toast = useLocalizedToast()
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
const canCreateTransferPayment = computed(() =>
  can('transfer_payment', 'create', { type: 'agency', agencyId: String(agencyId) })
)
const profileActionContext = useActionContext({
  identity: [() => agencyId],
  authority: canCreateTransferPayment
})

const collectionActionContext = useActionContext({
  identity: [() => agencyId],
  authority: () => can('agency', 'read', { type: 'agency', agencyId: String(agencyId) })
})
const { isWizardOpen, isSavingWizard, saveWizard } = useTransferPaymentWizard(refresh, {
  context: profileActionContext,
  collectionContext: collectionActionContext
})

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
let latestProfileSession: ReturnType<typeof captureProfileSession> = null
watch(captureProfileSession, session => {
  if (session !== null) latestProfileSession = session
}, { flush: 'sync' })
type ProfileContext = { kind: 'active'; agencyId: string } | { kind: 'disposed' }
let profileContext: ProfileContext = { kind: 'active', agencyId }
watch(() => agencyId, (currentAgency, previousAgency) => {
  if (profileContext.kind === 'disposed') return
  profileContext = { kind: 'active', agencyId: currentAgency }
  if (currentAgency !== previousAgency) {
    isProfileModalOpen.value = false
    selectedProfile.value = null
  }
}, { flush: 'sync' })
onScopeDispose(() => {
  profileContext = { kind: 'disposed' }
})

/**
 * Saves or updates a transfer payment profile.
 * Performs a POST if the profile has no ID (new), or a PATCH if it does (update).
 * Refreshes the dataset and provides user feedback via toasts on success or error.
 */
const saveProfile = async () => {
  const operation = profileActionContext.capture()
  const context = profileContext
  const payload = selectedProfile.value
  const session = captureProfileSession()
  if (!operation?.canDispatch() || context.kind !== 'active' || !payload || session === null) return
  if (!profilePending.begin(session)) return
  const ownsContext = () => profileContext === context && operation.isCurrent()
  const ownsSession = () => ownsContext() && captureProfileSession() === session
  let closedSession = false
  const ownsFeedback = () => ownsContext() && latestProfileSession === session && (
    captureProfileSession() === session || (closedSession && captureProfileSession() === null)
  )

  try {
    const request = buildTransferPaymentProfileSaveRequest(payload, context.agencyId)
    await ($fetch as (url: string, options: Record<string, unknown>) => Promise<unknown>)(request.url, {
      method: request.method,
      body: request.body
    })
    if (!ownsContext()) return
    if (!ownsSession()) {
      await refresh()
      return
    }
    await completeTransferPaymentProfileSave({
      isUpdate: request.isUpdate,
      close: () => {
        closedSession = closeProfileSession(session)
      },
      refresh,
      t,
      toast
    })
  } catch (error: unknown) {
    if (ownsFeedback()) showError(error)
  } finally {
    profilePending.end(session)
  }
}
</script>

<template>
  <div class="space-y-6" data-field-scope="agency.transfer-payments">
    <CommonResourceLayout
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
        <USelect v-model="statusFilter" :items="availabilityItems" :aria-label="t('common.status_filter')" class="min-w-40" data-ui-target="agency.transfer-payments.statusFilter" />
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
    </CommonResourceLayout>

    <TransferPaymentWizardModal
      v-model:open="isWizardOpen"
      :action-context="profileActionContext"
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
      :action-context="profileActionContext"
      @submit="saveProfile" />
  </div>
</template>
