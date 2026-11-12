<script setup lang="ts">
import { usePageResourceError } from '~/composables/usePageResourceError'
import { provideBilingualFieldScope } from '~/utils/bilingual-field-context'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { computed, ref } from 'vue'
import { useModalSession } from '~/composables/useModalSession'
import { useCrudModalPending } from '~/composables/useCrudModal'
import { useActionContext } from '~/composables/useActionContext'
import type { Ref } from 'vue'
import type { TransferPaymentProfileForm } from '~~/shared/types/transfer-payment-ui'

definePageMeta({
  key: route => route.path,
  i18n: {
    paths: {
      en: '/transfer-payments/[id]',
      fr: '/paiements-de-transfert/[id]'
    }
  }
})

const { t } = useI18n()
const toast = useLocalizedToast()
const { showError } = useApiErrorToast()
const { getBilingualValue } = useBilingualValue()
const route = useRoute()
const id = route.params.id
const isStreamRoute = computed(() => 'streamId' in route.params && typeof route.params.streamId === 'string')
const { toDateInput } = useDateHelpers()

const {
  profile,
  error,
  status,
  refreshProfile,
  canUpdateProfile,
  tabs,
  selectedTab,
  activeTabComponent,
  activeTabProps,
  handleOutcomesUpdated,
  breadcrumbItems,
  isHeroCollapsed
} = await useTransferPaymentDetailState(id)

usePageResourceError({
  identity: () => route.path,
  errors: [() => isStreamRoute.value ? null : error.value],
  pending: () => status.value === 'pending',
  hasContent: () => Boolean(profile.value)
})

const isLoadingProfile = computed(() => status.value === 'pending')
const hasLoadError = computed(() => status.value === 'error' || Boolean(error.value))

provideBilingualFieldScope(() => profile.value ? { subject: 'transfer_payment', agencyId: String(profile.value.egcs_tp_agency), permissionAction: 'update' } : null)

const profileModal = useModalSession()
const isUpdateModalOpen = profileModal.isOpen
const profilePending = useCrudModalPending(profileModal.captureSession)
const isSavingProfile = profilePending.isPending
const selectedProfile: Ref<TransferPaymentProfileForm | null> = ref(null)
const { can } = useCan()
const profileActionContext = useActionContext({
  identity: [() => String(id), () => profile.value?.egcs_tp_agency],
  authority: () => Boolean(profile.value && can('transfer_payment', 'update', {
    type: 'entity', agencyId: String(profile.value.egcs_tp_agency),
    path: [{ type: 'transfer_payment', id: String(id) }]
  })),
  eligible: () => Boolean(profile.value)
})

/**
 * Prepares the transfer payment profile data for editing and opens the update modal.
 * Formats start and end dates into a format compatible with date input fields.
 */
const openUpdateProfile = () => {
  if (!profile.value || !canUpdateProfile.value || profileModal.isDisposed()) return
  selectedProfile.value = {
    ...profile.value,
    egcs_tp_datestart: toDateInput(profile.value.egcs_tp_datestart),
    egcs_tp_dateend: toDateInput(profile.value.egcs_tp_dateend)
  }
  isUpdateModalOpen.value = true
}

/**
 * Persists changes to the transfer payment profile via an API PATCH request.
 * Closes the modal, refreshes the profile data, and provides success feedback.
 */
const updateProfile = async () => {
  const operation = profileActionContext.capture()
  const session = profileModal.captureSession()
  if (!operation?.canDispatch() || !selectedProfile.value || !canUpdateProfile.value || session === null || profileModal.isDisposed() || !profilePending.begin(session)) return
  const draft = selectedProfile.value
  let saved = false
  const ownsSave = () => !profileModal.isDisposed()
    && operation.isCurrent()
    && selectedProfile.value === draft
    && (saved ? !isUpdateModalOpen.value : profileModal.isCurrentSession(session))
  try {
    const response = await fetch(getClientRequestUrl(`/api/transfer-payments/${id}`), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(draft)
    })
    if (!response.ok) await throwFetchResponseError(response)
    if (profileModal.isDisposed() || !operation.isCurrent()) return
    if (ownsSave()) {
      saved = true
      isUpdateModalOpen.value = false
    }
    await refreshProfile()
    if (!ownsSave()) return
    toast.add({ title: toast.localized('common.success'), description: toast.localized('common.updated_success'), color: 'success' })
  } catch (error: unknown) {
    if (ownsSave()) showError(error)
  } finally {
    profilePending.end(session)
  }
}
</script>

<template>
  <NuxtPage v-if="isStreamRoute" />
  <div v-else class="flex w-full flex-col">
    <div v-if="isLoadingProfile && !profile" role="status" aria-live="polite" class="sr-only">
      <span>{{ t('common.loading_records') }}</span>
    </div>
    <UAlert
      v-else-if="hasLoadError"
      color="error"
      icon="i-lucide-circle-alert"
      :title="t('common.resource_table_load_failed')"
      :description="t('common.resource_table_load_failed_description')">
      <template #actions>
        <UButton color="error" variant="soft" icon="i-lucide-refresh-cw" :label="t('common.retry')" :loading="isLoadingProfile" @click="() => refreshProfile()" />
      </template>
    </UAlert>
    <CommonDetailPage v-if="profile" id="transfer-payment-detail" v-model:collapsed="isHeroCollapsed" :breadcrumb-items="breadcrumbItems" class="w-full">
      <template #body>
        <div class="flex flex-1 flex-col">
          <CommonEntityHero
            :is-collapsed="isHeroCollapsed"
            icon="i-lucide-banknote"
            :title="getBilingualValue(profile, 'egcs_tp_name', '')"
            :description="getBilingualValue(profile, 'egcs_tp_description', '')"
            :actions="[{
              label: t('common.edit'),
              icon: 'i-lucide-edit-3',
              visible: canUpdateProfile,
              onClick: openUpdateProfile
            }]" />

          <CommonDetailWorkspace v-model="selectedTab" data-field-container="Page navigation state, not a business input field." :items="tabs">
            <component
              :is="activeTabComponent"
              v-if="activeTabComponent"
              v-bind="activeTabProps"
              @outcomes-updated="handleOutcomesUpdated" />
          </CommonDetailWorkspace>
        </div>
      </template>
    </CommonDetailPage>

    <TransferPaymentModal
      v-if="selectedProfile"
      v-model:open="isUpdateModalOpen"
      v-model:state="selectedProfile"
      :title="t('transfer_payment.update_title')"
      :submit-label="t('common.update')"
      :pending="isSavingProfile"
      :action-context="profileActionContext"
      @submit="updateProfile" />
  </div>
</template>
