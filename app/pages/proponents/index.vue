<script setup lang="ts">
import type { ComputedRef } from 'vue'
import { appRouteLocations } from '~/utils/route-locations'
import type { ApplicantRecipientProfileRow } from '~~/shared/types/applicant-recipient-ui'

definePageMeta({
  i18n: {
    paths: {
      en: '/proponents',
      fr: '/promoteurs'
    }
  }
})

const { t } = useI18n()
const toast = useToast()
const { can } = useCan()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const localePath = useLocalePath()

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
} = useResourceTable<ApplicantRecipientProfileRow>({
  fetchUrl: '/api/applicant-recipients'
})

const openCreateProfile = async () => {
  await navigateTo(localePath(appRouteLocations.proponentCreate()))
}

const openUpdateProfile = async (profile: ApplicantRecipientProfileRow) => {
  await navigateTo(localePath(appRouteLocations.proponentEdit(String(profile.id))))
}

/**
 * Soft deletes the selected applicant recipient profile.
 *
 * @param profile - Profile to delete.
 */
const deleteProfile = async (profile: ApplicantRecipientProfileRow) => {
  try {
    const deleted = await confirmDeleteRequest(`/api/applicant-recipients/${profile.id}`)
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
const isHeroCollapsed = getHeroCollapsed('applicant-recipients')
const totalProfiles: ComputedRef<number> = computed(() => response.value?.stats?.total ?? 0)
const activeProfiles: ComputedRef<number> = computed(() => response.value?.stats?.active ?? 0)
const proponentHeroStats = computed(() => [
  {
    label: t('applicant_recipient.title'),
    value: totalProfiles.value
  },
  {
    label: t('applicant_recipient.active_count'),
    value: activeProfiles.value,
    accent: true,
    visible: response.value?.stats?.active !== undefined
  }
])
const canCreateProfile: ComputedRef<boolean> = computed(() => can('applicant_recipient', 'create', { type: 'global' }))

/**
 * Evaluates whether the current user can edit the provided profile.
 *
 * @param profile - Applicant recipient row rendered in the table.
 * @returns True when the API has marked the row as editable.
 */
const canUpdateProfile = (profile: ApplicantRecipientProfileRow) => {
  return Boolean(profile.can_update)
}

/**
 * Evaluates whether the current user can delete the provided profile.
 *
 * @param profile - Applicant recipient row rendered in the table.
 * @returns True when delete actions should be enabled for the row.
 */
const canDeleteProfile = (profile: ApplicantRecipientProfileRow) => {
  return Boolean(profile.can_delete)
}
</script>

<template>
  <UDashboardPanel id="applicant-recipients">
    <template #header>
      <UDashboardNavbar :title="t('applicant_recipient.title')">
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
          icon="i-lucide-store"
          :title="t('applicant_recipient.title')"
          :description="t('applicant_recipient.description')"
          :stats="proponentHeroStats" />

        <ApplicantRecipientProfilesTable
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
          @edit="openUpdateProfile"
          @delete="deleteProfile" />
      </div>
    </template>
  </UDashboardPanel>
</template>
