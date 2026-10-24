<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
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
const toast = useLocalizedToast()
const { canAny } = useCan()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const localePath = useLocalePath()

let disposed = false
onBeforeUnmount(() => {
  disposed = true
})
const deletingId = ref<string | null>(null)
const editingId = ref<string | null>(null)
const listView = ref('all')
const listViewQuery = computed(() => ({ list_view: listView.value }))

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
} = useResourceTable<ApplicantRecipientProfileRow>({
  query: listViewQuery,
  fetchUrl: '/api/applicant-recipients'
})

watch(listView, () => {
  pagination.value.pageIndex = 0
}, { flush: 'sync' })

const openCreateProfile = async () => {
  await navigateTo(localePath(appRouteLocations.proponentCreate()))
}

/** Rechecks exact profile assignment before entering its edit view.
 * @param profile Profile selected from the current collection.
 */
const openUpdateProfile = async (profile: ApplicantRecipientProfileRow) => {
  if (disposed || editingId.value || profile.can_update_role !== true) return
  const ownerId = String(profile.id)
  const current = () => !disposed && status.value === 'success' && profiles.value.some(item => String(item.id) === ownerId && item.can_update_role === true)
  editingId.value = ownerId
  try {
    const live = await $fetch<Pick<ApplicantRecipientProfileRow, 'can_update'>, string>(`/api/applicant-recipients/${ownerId}`)
    if (!current()) return
    if (!live.can_update) {
      toast.add({ title: toast.localized('common.warning'), description: toast.localized('workflow.action_prerequisite_unavailable'), color: 'warning' })
      return
    }
    await navigateTo(localePath(appRouteLocations.proponentEdit(ownerId)))
  } catch (error: unknown) {
    if (current()) showError(error)
  } finally {
    editingId.value = null
  }
}

/**
 * Soft deletes the selected applicant recipient profile.
 *
 * @param profile - Profile to delete.
 */
const deleteProfile = async (profile: ApplicantRecipientProfileRow) => {
  if (disposed || deletingId.value || profile.can_delete_role !== true) return
  const ownerId = String(profile.id)
  const current = () => !disposed && status.value === 'success' && profiles.value.some(item => String(item.id) === ownerId && item.can_delete_role === true)
  deletingId.value = ownerId
  try {
    const live = await $fetch<Pick<ApplicantRecipientProfileRow, 'can_delete'>, string>(`/api/applicant-recipients/${ownerId}`)
    if (!current()) return
    if (!live.can_delete) {
      toast.add({ title: toast.localized('common.warning'), description: toast.localized('workflow.action_prerequisite_unavailable'), color: 'warning' })
      return
    }
    const deleted = await confirmDeleteRequest(`/api/applicant-recipients/${ownerId}`, { shouldProceed: current })
    if (!deleted || !current()) return
    await refresh()
    if (disposed) return
    toast.add({
      title: toast.localized('common.success'),
      description: toast.localized('common.deleted_success'),
      color: 'success'
    })
  } catch (error: unknown) {
    if (current()) showError(error)
  } finally {
    deletingId.value = null
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
const canCreateProfile: ComputedRef<boolean> = computed(() => canAny('applicant_recipient', 'create', ['global', 'agency']))

/**
 * Evaluates whether the current user can edit the provided profile.
 *
 * @param profile - Applicant recipient row rendered in the table.
 * @returns True when the API has marked the row as editable.
 */
const canUpdateProfile = (profile: ApplicantRecipientProfileRow) => {
  return profile.can_update_role === true
}

/**
 * Evaluates whether the current user can delete the provided profile.
 *
 * @param profile - Applicant recipient row rendered in the table.
 * @returns True when delete actions should be enabled for the row.
 */
const canDeleteProfile = (profile: ApplicantRecipientProfileRow) => {
  return profile.can_delete_role === true
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
            <CommonActionButton
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
          @delete="deleteProfile">
          <template #filters>
            <CommonAssignedListViewSelect v-model="listView" resource="applicant_recipient" />
          </template>
        </ApplicantRecipientProfilesTable>
      </div>
    </template>
  </UDashboardPanel>
</template>
