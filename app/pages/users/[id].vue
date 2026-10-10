<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param -- page-local handlers are clear from their names and types */
import type { Ref } from 'vue'
import { appRouteLocations } from '~/utils/route-locations'
import UserAssignmentsTab from '~/components/User/UserAssignmentsTab.vue'
import UserDetailGeneralTab from '~/components/User/UserDetailGeneralTab.vue'
import { useRouteTabMap } from '~/composables/useRouteTabMap'
import type { UserProfileItem } from '~~/shared/types/schemas'
import type { UserRoleAssignment } from '~~/shared/types/schemas/rbac'
import type { RoleOptionItem, UserAssignment } from '~~/shared/types/admin'
import type { UserDetail } from '~~/shared/types/users'
import { canAssignUserRole } from '~~/shared/utils/user-role-assignment-access'

definePageMeta({
  i18n: {
    paths: {
      en: '/users/[id]',
      fr: '/utilisateurs/[id]'
    }
  }
})

const { t, locale } = useI18n()
const { formatDate } = useDateHelpers()
const toast = useToast()
const { showError } = useApiErrorToast()
const { saveJson } = useJsonRequest()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const localePath = useLocalePath()
const route = useRoute()
const id = route.params.id as string
const userUrl: string = `/api/users/${id}`

const user: Ref<UserDetail | null> = ref(null)
const refresh = async () => {
  user.value = await $fetch<UserDetail, string>(userUrl)
}
await refresh()

const isUpdateModalOpen = ref(false)
const selectedUser: Ref<Partial<UserProfileItem> | null> = ref(null)
const isSavingUser: Ref<boolean> = ref(false)

const isAssignmentModalOpen = ref(false)
const selectedAssignment: Ref<Partial<UserRoleAssignment> | null> = ref(null)
const isSavingAssignment: Ref<boolean> = ref(false)
const deletingAssignmentId: Ref<string | null> = ref(null)
const isMutationPending = computed(() =>
  isSavingUser.value
  || isSavingAssignment.value
  || deletingAssignmentId.value !== null
)
const openUpdateModal = () => {
  if (!user.value?.can_update || isMutationPending.value) return
  selectedUser.value = { ...user.value }
  isUpdateModalOpen.value = true
}

const openAssignmentModal = () => {
  const access = user.value?.role_assignment_access
  if (
    !access
    || isMutationPending.value
    || (!access.has_global_access && access.agency_ids.length === 0)
  ) return
  selectedAssignment.value = { user_id: id }
  isAssignmentModalOpen.value = true
}

const updateUser = async () => {
  if (!selectedUser.value || !user.value?.can_update || isMutationPending.value) return
  const profilePatch = Object.fromEntries(
    (['name', 'email', 'image'] as const)
      .filter(key => selectedUser.value && key in selectedUser.value && selectedUser.value[key] !== user.value?.[key])
      .map(key => [key, selectedUser.value?.[key]])
  )
  if (Object.keys(profilePatch).length === 0) {
    isUpdateModalOpen.value = false
    return
  }
  try {
    isSavingUser.value = true
    await saveJson(userUrl, 'PATCH', profilePatch)
    isUpdateModalOpen.value = false
    await refresh()
    toast.add({
      title: t('common.success'),
      description: t('common.updated_success'),
      color: 'success'
    })
  } catch (error: unknown) {
    showError(error)
  } finally {
    isSavingUser.value = false
  }
}

const canAssignRole = (role: RoleOptionItem): boolean => {
  const access = user.value?.role_assignment_access
  return access ? canAssignUserRole(role, access) : false
}

/** Adds an authorized role assignment and refreshes the user detail. */
const addAssignment = async (role: RoleOptionItem) => {
  const assignment = selectedAssignment.value
  if (!assignment || !canAssignRole(role) || isMutationPending.value) return
  if (!assignment.role_id) {
    toast.add({
      title: t('common.error'),
      description: t('validation.required'),
      color: 'error'
    })
    return
  }
  if (String(assignment.role_id) !== String(role.id)) return

  try {
    isSavingAssignment.value = true
    await saveJson(`/api/users/${id}/assignments`, 'POST', {
      user_id: id,
      role_id: role.id
    })
    isAssignmentModalOpen.value = false
    await refresh()
    toast.add({
      title: t('common.success'),
      description: t('common.added_success'),
      color: 'success'
    })
  } catch (error: unknown) {
    showError(error)
  } finally {
    isSavingAssignment.value = false
  }
}

/** Deletes an authorized role assignment while preventing duplicate requests. */
const deleteAssignment = async (assignmentId: string) => {
  const assignment = user.value?.assignments.find(item => item.id === assignmentId)
  if (!assignment?.can_delete || isMutationPending.value) return

  try {
    deletingAssignmentId.value = assignmentId
    const deleted = await confirmDeleteRequest(`/api/users/${id}/assignments/${assignmentId}`, {
      description: t('agency.delete_confirm')
    })
    if (!deleted) {
      return
    }

    await refresh()
    toast.add({
      title: t('common.success'),
      description: t('common.deleted_success'),
      color: 'success'
    })
  } catch (error: unknown) {
    showError(error)
  } finally {
    deletingAssignmentId.value = null
  }
}

const breadcrumbItems = computed(() => [
  { label: t('nav.users'), to: localePath(appRouteLocations.users()) },
  { label: user.value?.name || t('common.loading') }
])

const { getHeroCollapsed } = useDashboard()
const isHeroCollapsed = getHeroCollapsed('user-detail')

const getLocalizedName = (item: UserAssignment, field: string) => {
  const localeSuffix = locale.value === 'fr' ? 'fr' : 'en'
  const value = item[`${field}_${localeSuffix}` as keyof UserAssignment]
  return typeof value === 'string' ? value : ''
}

const heroActions = computed(() => user.value?.can_update
  ? [{
      label: t('common.edit'),
      icon: 'i-lucide-edit-3',
      onClick: openUpdateModal
    }]
  : [])

const tabMap: TabMap = new Map([
  [
    'general',
    {
      key: 'agency.tabs.general',
      icon: 'i-lucide-info',
      component: UserDetailGeneralTab,
      getProps: () => (user.value ? { user: user.value, formatDate } : {})
    }
  ],
  [
    'assignments',
    {
      key: 'role.assignment.title',
      icon: 'i-lucide-shield-user',
      component: UserAssignmentsTab,
      getProps: () => ({
        showHeader: false,
        assignments: user.value?.assignments ?? [],
        getLocalizedName,
        canAdd: (
          user.value?.role_assignment_access.has_global_access === true
          || Boolean(user.value?.role_assignment_access.agency_ids.length)
        ),
        deletingAssignmentId: deletingAssignmentId.value
      })
    }
  ]
])

const { tabs: routeTabs, selectedTab, activeTabComponent, activeTabProps } = useRouteTabMap({
  tabMap,
  defaultTabId: 'general'
})
</script>

<template>
  <CommonDetailPage v-if="user" id="user-detail" v-model:collapsed="isHeroCollapsed" :breadcrumb-items="breadcrumbItems">
    <template #body>
      <div class="flex flex-1 flex-col">
        <CommonEntityHero
          :is-collapsed="isHeroCollapsed"
          icon="i-lucide-user"
          :title="user.name"
          :meta-items="[user.email]"
          :badges="[{
            variant: user.emailVerified ? 'verified' : 'unverified'
          }]"
          :actions="heroActions" />

        <CommonDetailWorkspace v-model="selectedTab" :items="routeTabs">
          <component
            :is="activeTabComponent"
            v-if="activeTabComponent"
            v-bind="activeTabProps"
            @add="openAssignmentModal"
            @delete="deleteAssignment" />
        </CommonDetailWorkspace>
      </div>

      <UserModal
        v-if="selectedUser"
        v-model:open="isUpdateModalOpen"
        v-model:state="selectedUser"
        :title="t('user.update_title')"
        :submit-label="t('common.update')"
        :pending="isMutationPending"
        @submit="updateUser" />

      <RoleAssignmentModal
        v-if="selectedAssignment"
        v-model:open="isAssignmentModalOpen"
        v-model:state="selectedAssignment"
        :title="t('role.assignment.new')"
        :submit-label="t('common.add')"
        :pending="isMutationPending"
        :role-assignment-access="user.role_assignment_access"
        hide-user
        @submit="addAssignment" />
    </template>
  </CommonDetailPage>
</template>
