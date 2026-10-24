<script setup lang="ts">
import { usePageResourceError } from '~/composables/usePageResourceError'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { ApplicantRecipientProfileForm } from '~~/shared/types/applicant-recipient-ui'

definePageMeta({
  key: route => route.path,
  i18n: {
    paths: {
      en: '/proponents/edit/[id]',
      fr: '/promoteurs/modifier/[id]'
    }
  }
})

type ApplicantRecipientDetailForm = ApplicantRecipientProfileForm & {
  can_update_role?: boolean
  can_delete_role?: boolean
  can_create_child_records_role?: boolean
  can_update_child_records_role?: boolean
  can_delete_child_records_role?: boolean
  can_update?: boolean
  can_delete?: boolean
  can_create_child_records?: boolean
  can_update_child_records?: boolean
  can_delete_child_records?: boolean
}

const { t } = useI18n()
const toast = useLocalizedToast()
const { showError } = useApiErrorToast()
const { getBilingualValue } = useBilingualValue()
const route = useRoute()
const id = route.params.id as string
const isChildDetailRoute = computed(() => typeof route.params.creditMemoId === 'string')
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
  isHeroCollapsed
} = useApplicantRecipientDetailState(id, { enabled: computed(() => !isChildDetailRoute.value) })

usePageResourceError({
  identity: () => route.path,
  errors: [() => isChildDetailRoute.value ? null : error.value],
  pending: () => status.value === 'pending',
  hasContent: () => Boolean(profile.value)
})

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

/**
 * Saves applicant recipient changes from the inline edit view and refreshes the detail page.
 */
const submit = async () => {
  if (disposed || isChildDetailRoute.value || !selectedProfile.value || !profile.value?.can_update_role || isSaving.value) return

  try {
    isSaving.value = true
    const current = await $fetch<{ can_update?: boolean }, string>(`/api/applicant-recipients/${id}`)
    if (disposed || isChildDetailRoute.value) return
    if (!current.can_update) {
      toast.add({ title: toast.localized('common.warning'), description: toast.localized('workflow.action_prerequisite_unavailable'), color: 'warning' })
      return
    }
    const {
      can_update_role: _canUpdateRole,
      can_delete_role: _canDeleteRole,
      can_create_child_records_role: _canCreateChildRecordsRole,
      can_update_child_records_role: _canUpdateChildRecordsRole,
      can_delete_child_records_role: _canDeleteChildRecordsRole,
      can_create_child_records: _canCreateChildRecords,
      can_update_child_records: _canUpdateChildRecords,
      can_delete_child_records: _canDeleteChildRecords,
      can_delete: _canDelete,
      can_update: _canUpdate,
      ...body
    } = selectedProfile.value

    const updateUrl = getClientRequestUrl(`/api/applicant-recipients/${id}`)
    const response = await fetch(updateUrl, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!response.ok) await throwFetchResponseError(response)

    if (disposed || isChildDetailRoute.value) return
    await refreshProfile()
    if (disposed || isChildDetailRoute.value) return

    toast.add({
      title: toast.localized('common.success'),
      description: toast.localized('common.updated_success'),
      color: 'success'
    })
  } catch (caughtError: unknown) {
    if (!disposed && !isChildDetailRoute.value) showError(caughtError)
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
  <NuxtPage v-if="isChildDetailRoute" />
  <div v-else class="flex min-w-0 flex-1 flex-col">
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

    <CommonDetailPage v-else-if="profile" id="applicant-recipient-detail" v-model:collapsed="isHeroCollapsed" :breadcrumb-items="breadcrumbItems" class="min-w-0 flex-1">
      <template #body>
        <div class="flex flex-1 flex-col">
          <ApplicantRecipientProfileHero
            :profile="profile"
            :is-collapsed="isHeroCollapsed"
            :title="getBilingualValue(profile, 'egcs_ar_legalname', getBilingualValue(profile, 'egcs_ar_operatingname', id))"
            :subtitle="t('applicant_recipient.update_title')"
            show-status
            show-lead-agency />

          <CommonDetailWorkspace v-model="selectedTab" data-field-container="Page navigation state, not a business input field." :items="tabs" content-test-id="proponent-detail-content">
            <ApplicantRecipientProfileFormPage
              v-if="isGeneralTab && selectedProfile && profile.can_update_role"
              v-model:model="selectedProfile"
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
          </CommonDetailWorkspace>
        </div>
      </template>
    </CommonDetailPage>
  </div>
</template>
