<script setup lang="ts">
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { ApplicantRecipientProfileForm } from '~~/shared/types/applicant-recipient-ui'

definePageMeta({
  i18n: {
    paths: {
      en: '/proponents/edit/[id]',
      fr: '/promoteurs/modifier/[id]'
    }
  }
})

type ApplicantRecipientDetailForm = ApplicantRecipientProfileForm & {
  can_update?: boolean
  can_delete?: boolean
  can_create_child_records?: boolean
  can_update_child_records?: boolean
  can_delete_child_records?: boolean
}

const { t } = useI18n()
const toast = useToast()
const { showError } = useApiErrorToast()
const { getBilingualValue } = useBilingualValue()
const route = useRoute()
const id = route.params.id as string
const {
  profile,
  error,
  status,
  refreshProfile,
  tabs,
  selectedTab,
  activeTabComponent,
  activeTabProps,
  breadcrumbItems,
  isHeroCollapsed,
  selectedExtensionAgencyId
} = useApplicantRecipientDetailState(id)

const selectedProfile: Ref<ApplicantRecipientDetailForm | null> = ref(null)
const isSaving: Ref<boolean> = ref(false)
let disposed = false
onBeforeUnmount(() => {
  disposed = true
})
const hasLoadError = computed(() => Boolean(error.value) || status.value === 'error')
const isLoadingProfile = computed(() => status.value === 'pending' && !profile.value)
const isGeneralTab = computed(() => selectedTab.value === 'general')

watch(profile, value => {
  if (!value) {
    selectedProfile.value = null
    return
  }

  selectedProfile.value = { ...value }
}, { immediate: true })

watch(selectedExtensionAgencyId, (next, previous) => {
  if (next !== previous && selectedProfile.value?.extensions) {
    selectedProfile.value = { ...selectedProfile.value, extensions: {} }
  }
})

/**
 * Saves applicant recipient changes from the inline edit view and refreshes the detail page.
 */
const submit = async () => {
  if (disposed || !selectedProfile.value || !profile.value?.can_update || isSaving.value) {
    return
  }

  try {
    isSaving.value = true
    const {
      can_create_child_records: _canCreateChildRecords,
      can_update_child_records: _canUpdateChildRecords,
      can_delete_child_records: _canDeleteChildRecords,
      can_delete: _canDelete,
      can_update: _canUpdate,
      ...body
    } = selectedProfile.value

    const updateUrl = getClientRequestUrl(`/api/applicant-recipients/${id}`)
    if (selectedExtensionAgencyId.value) updateUrl.searchParams.set('agencyId', selectedExtensionAgencyId.value)
    const response = await fetch(updateUrl, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!response.ok) await throwFetchResponseError(response)

    if (disposed) return
    await refreshProfile()
    if (disposed) return

    toast.add({
      title: t('common.success'),
      description: t('common.updated_success'),
      color: 'success'
    })
  } catch (caughtError: unknown) {
    if (!disposed) showError(caughtError)
  } finally {
    isSaving.value = false
  }
}

/**
 * Resets unsaved inline edits back to the last loaded profile state.
 */
const cancel = () => {
  selectedProfile.value = profile.value ? { ...profile.value } : null
}

/** Retries the masked profile request after a route-level load failure. */
const retryProfile = async () => {
  await refreshProfile()
}
</script>

<template>
  <div class="flex min-w-0 flex-1 flex-col">
    <CommonLoadingState v-if="isLoadingProfile" :label="t('common.loading')" />

    <UAlert
      v-else-if="hasLoadError"
      role="alert"
      aria-live="assertive"
      color="error"
      icon="i-lucide-circle-alert"
      :title="t('common.resource_table_load_failed')"
      :description="t('common.resource_table_load_failed_description')">
      <template #actions>
        <UButton color="error" variant="soft" :label="t('common.retry')" @click="retryProfile" />
      </template>
    </UAlert>

    <UDashboardPanel v-else-if="profile" id="applicant-recipient-detail" class="min-w-0 flex-1">
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
          <ApplicantRecipientProfileHero
            :profile="profile"
            :is-collapsed="isHeroCollapsed"
            :title="getBilingualValue(profile, 'egcs_ar_legalname', getBilingualValue(profile, 'egcs_ar_operatingname', id))"
            :subtitle="t('applicant_recipient.update_title')"
            show-status
            show-lead-agency />

          <div class="mx-auto w-full max-w-5xl px-4 py-3">
            <label for="proponent-extension-agency-context" class="mb-1 block text-sm font-medium">{{ t('applicant_recipient.extension_agency_context') }}</label>
            <CommonServerLookupSelect
              id="proponent-extension-agency-context"
              :model-value="selectedExtensionAgencyId"
              fetch-url="/api/applicant-recipients/lookups/agencies"
              value-key="id"
              label-en-key="egcs_ay_name_en"
              label-fr-key="egcs_ay_name_fr"
              :placeholder="t('applicant_recipient.extension_agency_context_placeholder')"
              :query="{ applicant_recipient_id: id, permission_action: 'read', role_scoped: 'true' }"
              searchable
              @update:model-value="value => selectedExtensionAgencyId = String(value ?? '')" />
          </div>

          <CommonEntityEditorWorkspace content-test-id="proponent-detail-content">
            <template #sidebar>
              <CommonRouteTabs
                v-model="selectedTab"
                :items="tabs"
                orientation="vertical"
                :ui="{
                  root: 'w-full',
                  list: 'w-full flex-col items-stretch p-0',
                  trigger: 'w-full justify-start'
                }" />
            </template>

            <ApplicantRecipientProfileFormPage
              v-if="isGeneralTab && selectedProfile && profile.can_update"
              v-model:model="selectedProfile"
              v-model:extension-agency-id="selectedExtensionAgencyId"
              :persisted-profile="profile"
              :submit-label="t('common.update')"
              :cancel-label="t('common.cancel')"
              :pending="isSaving"
              lead-agency-permission-action="update"
              @submit="submit"
              @cancel="cancel" />

            <ApplicantRecipientGeneralTab
              v-else-if="isGeneralTab"
              :profile="profile" />

            <component
              :is="activeTabComponent"
              v-else-if="activeTabComponent"
              class="block w-full"
              v-bind="activeTabProps" />
          </CommonEntityEditorWorkspace>
        </div>
      </template>
    </UDashboardPanel>
  </div>
</template>
