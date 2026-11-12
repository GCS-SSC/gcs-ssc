<script setup lang="ts">
import { useActionContext } from '~/composables/useActionContext'
import { useEditorMutationCoordinator } from '~/composables/useEditorMutationCoordinator'
import { usePageResourceError } from '~/composables/usePageResourceError'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { computed, onBeforeUnmount, ref, toRaw, watch } from 'vue'
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
const { user, permissionRevision } = useAuth()
const id = route.params.id
const isChildDetailRoute = computed(() => 'creditMemoId' in route.params && typeof route.params.creditMemoId === 'string')
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
const profileFormSession = ref(0)
const actionContext = useActionContext({
  identity: [() => String(route.params.id), () => isChildDetailRoute.value],
  authority: () => profile.value?.can_update_role === true,
  eligible: () => profile.value?.can_update === true && !isChildDetailRoute.value
})
const mutations = useEditorMutationCoordinator({ getDraft: () => selectedProfile.value, context: actionContext })
const isSaving = mutations.isPending
let disposed = false
onBeforeUnmount(() => {
  disposed = true
})
const hasLoadError = computed(() => Boolean(error.value) || status.value === 'error')
const isLoadingProfile = computed(() => status.value === 'pending' && !profile.value)
const isGeneralTab = computed(() => selectedTab.value === 'general')

/**
 * Replaces the editable profile from accepted server evidence.
 * @param value - Current persisted profile, or absent evidence.
 */
const hydrateProfile = (value: typeof profile.value) => {
  profileFormSession.value += 1
  if (!value) {
    selectedProfile.value = null
    return
  }

  selectedProfile.value = structuredClone(toRaw(value))
}
watch(profile, value => {
  if (!mutations.isPending.value && (!value || value.id !== selectedProfile.value?.id || !mutations.isDirty.value)) {
    mutations.replaceSessionDraft(() => hydrateProfile(value))
  }
}, { immediate: true, flush: 'sync' })
watch([() => user.value?.id, permissionRevision, () => String(route.params.id), () => profile.value?.can_update_role], () => {
  mutations.replaceSessionDraft(() => hydrateProfile(profile.value))
}, { flush: 'sync' })

const warnPrerequisite = () => toast.add({ title: toast.localized('common.warning'), description: toast.localized('workflow.action_prerequisite_unavailable'), color: 'warning' })

/**
 * Saves applicant recipient changes from the inline edit view and refreshes the detail page.
 */
const submit = async () => {
  if (disposed || isChildDetailRoute.value || !selectedProfile.value || !profile.value?.can_update_role || isSaving.value) return

  await mutations.run('update', async token => {
    const draft = selectedProfile.value
    if (!draft) return
    const proceed = () => mutations.isTokenCurrent(token) && !disposed
    const canDispatch = () => mutations.canContinue(token) && !isChildDetailRoute.value
    const ownsDraft = () => canDispatch() && selectedProfile.value === draft && JSON.stringify(selectedProfile.value) === token.expectedDraft
    let stage: 'checking' | 'writing' = 'checking'
    try {
      const current = await $fetch<{ can_update?: boolean }, string>(`/api/applicant-recipients/${id}`)
      if (!ownsDraft()) return
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
      } = draft

      const updateUrl = getClientRequestUrl(`/api/applicant-recipients/${id}`)
      stage = 'writing'
      const response = await fetch(updateUrl, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!response.ok) await throwFetchResponseError(response)

      if (!proceed()) return
      mutations.acceptCommittedDraft(token)
      await refreshProfile()
      if (!proceed() || status.value === 'error') return
      mutations.applyMutationRefresh(token, { apply: () => hydrateProfile(profile.value) })

      toast.add({
        title: toast.localized('common.success'),
        description: toast.localized('common.updated_success'),
        color: 'success'
      })
    } catch (caughtError: unknown) {
      if (proceed() && (stage === 'writing' || ownsDraft())) showError(caughtError)
    }
  })
}

/**
 * Resets unsaved inline edits back to the last loaded profile state.
 */
const cancel = () => {
  mutations.replaceSessionDraft(() => hydrateProfile(profile.value))
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

    <CommonDetailPage v-else-if="profile" id="applicant-recipient-detail" v-model:collapsed="isHeroCollapsed" data-help-view="proponent.detail" :breadcrumb-items="breadcrumbItems" class="min-w-0 flex-1">
      <template #body>
        <div class="flex flex-1 flex-col">
          <ApplicantRecipientProfileHero
            :profile="profile"
            :is-collapsed="isHeroCollapsed"
            :title="getBilingualValue(profile, 'egcs_ar_legalname', getBilingualValue(profile, 'egcs_ar_operatingname', id))"
            :subtitle="t('applicant_recipient.update_title')"
            show-status
            show-lead-agency />

          <CommonDetailWorkspace v-model="selectedTab" help-navigation-group-target="proponent.detail.section-navigation" data-field-container="Page navigation state, not a business input field." :items="tabs" content-test-id="proponent-detail-content">
            <ApplicantRecipientProfileFormPage
              v-if="isGeneralTab && selectedProfile && profile.can_update_role"
              v-model:model="selectedProfile"
              :editor-session="profileFormSession"
              :action-context="actionContext"
              :persisted-profile="profile"
              :submit-label="t('common.update')"
              :cancel-label="t('common.cancel')"
              :pending="isSaving"
              lead-agency-permission-action="update"
              @submit="submit"
              @unavailable="warnPrerequisite"
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
