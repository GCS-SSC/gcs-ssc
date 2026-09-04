<script setup lang="ts">
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { TransferPaymentProfileForm } from '~~/shared/types/transfer-payment-ui'

definePageMeta({
  key: route => route.fullPath,
  i18n: {
    paths: {
      en: '/transfer-payments/[id]',
      fr: '/paiements-de-transfert/[id]'
    }
  }
})

const { t } = useI18n()
const toast = useToast()
const { showError } = useApiErrorToast()
const { getBilingualValue } = useBilingualValue()
const route = useRoute()
const id = route.params.id as string
const isStreamRoute = computed(() => typeof route.params.streamId === 'string')
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

const isLoadingProfile = computed(() => status.value === 'pending')
const hasLoadError = computed(() => status.value === 'error' || Boolean(error.value))

watch(error, (loadError) => {
  if (loadError) showError(loadError)
}, { immediate: true })

const isUpdateModalOpen: Ref<boolean> = ref(false)
const selectedProfile: Ref<TransferPaymentProfileForm | null> = ref(null)

/**
 * Prepares the transfer payment profile data for editing and opens the update modal.
 * Formats start and end dates into a format compatible with date input fields.
 */
const openUpdateProfile = () => {
  if (!profile.value) return
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
  if (!selectedProfile.value || !canUpdateProfile.value) return
  try {
    const response = await fetch(getClientRequestUrl(`/api/transfer-payments/${id}`), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(selectedProfile.value)
    })
    if (!response.ok) await throwFetchResponseError(response)
    isUpdateModalOpen.value = false
    await refreshProfile()
    toast.add({ title: t('common.success'), description: t('common.updated_success'), color: 'success' })
  } catch (error: unknown) {
    showError(error)
  }
}
</script>

<template>
  <NuxtPage v-if="isStreamRoute" />
  <div v-else class="flex w-full flex-col">
    <div v-if="isLoadingProfile && !profile" role="status" aria-live="polite" class="flex min-h-32 items-center justify-center gap-2 text-sm text-muted">
      <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" aria-hidden="true" />
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
    <UDashboardPanel v-if="profile" id="transfer-payment-detail" class="w-full">
      <template #header>
        <UDashboardNavbar>
          <template #leading>
            <UDashboardSidebarCollapse />
            <UBreadcrumb :items="breadcrumbItems" class="ml-2" />
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

          <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-visible px-6 pt-0 pb-6 lg:flex-row lg:gap-0">
            <aside class="w-full shrink-0 lg:w-72 lg:border-r lg:border-zinc-200 lg:pr-4 dark:lg:border-zinc-800">
              <div class="pt-6">
                <CommonRouteTabs
                  v-model="selectedTab"
                  :items="tabs"
                  orientation="vertical"
                  :ui="{
                    root: 'w-full',
                    list: 'w-full flex-col items-stretch p-0',
                    trigger: 'w-full justify-start'
                  }" />
              </div>
            </aside>

            <div class="min-h-0 min-w-0 flex-1 overflow-visible pt-6 lg:pl-6">
              <component
                :is="activeTabComponent"
                v-if="activeTabComponent"
                v-bind="activeTabProps"
                @outcomes-updated="handleOutcomesUpdated" />
            </div>
          </div>
        </div>
      </template>
    </UDashboardPanel>

    <TransferPaymentModal
      v-if="selectedProfile"
      v-model:open="isUpdateModalOpen"
      v-model:state="selectedProfile"
      :title="t('transfer_payment.update_title')"
      :submit-label="t('common.update')"
      @submit="updateProfile" />
  </div>
</template>
