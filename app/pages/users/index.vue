<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param -- page-local handlers are clear from their names and types */
import type { ComputedRef, Ref } from 'vue'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { appRouteLocations } from '~/utils/route-locations'
import type { UserListItem } from '~~/shared/types/users'
import type { UserActivation } from '~~/shared/types/schemas/user'

definePageMeta({
  i18n: {
    paths: {
      en: '/users',
      fr: '/utilisateurs'
    }
  }
})

const { t } = useI18n()
const toast = useToast()
const localePath = useLocalePath()
const { getHeroCollapsed } = useDashboard()
const isHeroCollapsed = getHeroCollapsed('users')
const { can } = useCan()
const { showError } = useApiErrorToast()
const { saveJson } = useJsonRequest()
const { confirmDeleteRequest } = useConfirmDeleteRequest()

const {
  search,
  pagination,
  items,
  totalRecords,
  response,
  refresh,
  retry,
  status,
  error: listError
} = useResourceTable<UserListItem>({
  fetchUrl: '/api/users'
})

const isModalOpen = ref(false)
const selectedUser: Ref<Partial<UserListItem> | null> = ref(null)
const isSavingUser: Ref<boolean> = ref(false)
const deletingUserId: Ref<string | null> = ref(null)
const activatingUserId: Ref<string | null> = ref(null)
const isActivatingUser: Ref<boolean> = ref(false)
const activationState: Ref<Partial<UserActivation> | null> = ref(null)
const isActivationModalOpen: Ref<boolean> = ref(false)
const deletedUserIds: Ref<Set<string>> = ref(new Set())
const canCreateUser: ComputedRef<boolean> = computed(() => can('user', 'create', { type: 'global' }))
const isMutationPending: ComputedRef<boolean> = computed(
  () => isSavingUser.value || deletingUserId.value !== null || isActivatingUser.value
)

watch(listError, error => {
  if (error) {
    showError(error)
  }
})

const refreshUserList = async (): Promise<boolean> => {
  await refresh()
  return !listError.value
}

const userHeroStats = computed(() => [
  {
    label: t('user.total'),
    value: Number(response.value?.stats?.total ?? 0)
  },
  {
    label: t('user.verified_count'),
    value: Number(response.value?.stats?.active ?? 0),
    accent: true,
    visible: response.value?.stats?.active !== undefined
  }
])

const openCreateModal = () => {
  if (!canCreateUser.value || isMutationPending.value) return
  selectedUser.value = {}
  isModalOpen.value = true
}

const openUpdateModal = (user: UserListItem) => {
  if (
    !user.can_update
    || !user.id
    || deletedUserIds.value.has(user.id)
    || isMutationPending.value
  ) return
  selectedUser.value = {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    can_update: user.can_update
  }
  isModalOpen.value = true
}

/** Persists the canonical editable profile fields and refreshes row capabilities. */
const saveUser = async () => {
  const item = selectedUser.value
  if (!item || isMutationPending.value) return
  const isUpdate = !!item.id
  if (isUpdate && item.can_update !== true) return
  if (item.id && deletedUserIds.value.has(item.id)) return
  if (!isUpdate && !canCreateUser.value) return
  const method = isUpdate ? 'PATCH' : 'POST'

  try {
    isSavingUser.value = true
    await saveJson(isUpdate ? `/api/users/${item.id}` : '/api/users', method, {
      name: item.name,
      email: item.email,
      image: item.image
    })
    isModalOpen.value = false
    selectedUser.value = null
    await refreshUserList()
  } catch (error: unknown) {
    showError(error)
  } finally {
    isSavingUser.value = false
  }
}

/** Deletes an authorized row and records success before refreshing the list. */
const deleteUser = async (user: UserListItem) => {
  if (
    !user.can_delete
    || !user.id
    || isMutationPending.value
    || deletedUserIds.value.has(user.id)
  ) return

  try {
    deletingUserId.value = user.id
    const deleted = await confirmDeleteRequest(`/api/users/${user.id}`, {
      description: t('agency.delete_confirm')
    })
    if (!deleted) return
    deletedUserIds.value.add(user.id)
    if (selectedUser.value?.id === user.id) {
      isModalOpen.value = false
      selectedUser.value = null
    }
    const refreshed = await refreshUserList()

    if (refreshed) {
      const pageSize = pagination.value.pageSize
      const lastPageIndex = Math.max(Math.ceil(totalRecords.value / pageSize) - 1, 0)
      if (pagination.value.pageIndex > lastPageIndex) {
        pagination.value.pageIndex = lastPageIndex
      }
    }
  } catch (error: unknown) {
    showError(error)
  } finally {
    deletingUserId.value = null
  }
}

/** Opens password setup for an inactive, manually managed user. */
const openActivationModal = (user: UserListItem) => {
  if (!user.can_activate || user.emailVerified || !user.id || isMutationPending.value) return
  activatingUserId.value = user.id
  activationState.value = {}
  isActivationModalOpen.value = true
}

/** Creates credentials and activates the selected manually managed user. */
const activateUser = async () => {
  const userId = activatingUserId.value
  const state = activationState.value
  if (!userId || !state?.password || isMutationPending.value) return

  try {
    isActivatingUser.value = true
    await saveJson(`/api/users/${userId}/activate`, 'POST', { password: state.password })
    toast.add({ title: t('user.activated_success'), color: 'success' })
    isActivationModalOpen.value = false
    activationState.value = null
    activatingUserId.value = null
    await refreshUserList()
  } catch (error: unknown) {
    showError(error)
  } finally {
    isActivatingUser.value = false
  }
}

const columns: TableColumnInput<UserListItem>[] = [
  { accessorKey: 'name', headerKey: 'role.assignment.user' },
  { accessorKey: 'email', headerKey: 'user.email' },
  { accessorKey: 'emailVerified', headerKey: 'user.status' },
  { id: 'actions', headerKey: 'common.actions' }
]
</script>

<template>
  <UDashboardPanel id="users">
    <template #header>
      <UDashboardNavbar :title="t('nav.users')">
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
          icon="i-lucide-users"
          :title="t('nav.users')"
          :description="t('user.description')"
          :stats="userHeroStats" />

        <CommonResourceLayoutPage
          v-model:search="search"
          v-model:pagination="pagination"
          :columns="columns"
          :data="items"
          :total-records="totalRecords"
          :loading="status === 'pending'"
          :request-status="status"
          :button-label="canCreateUser ? t('common.add') : undefined"
          :show-button="canCreateUser"
          :button-disabled="isMutationPending"
          @retry="retry"
          @add="openCreateModal">
          <template #name-cell="{ row }">
            <div class="flex items-center gap-3">
              <UAvatar :src="row.original.image ?? undefined" :alt="row.original.name" size="sm" />
              <ULink
                :to="localePath(appRouteLocations.userDetail(String(row.original.id)))"
                class="hover:text-primary font-bold text-zinc-900 transition-colors dark:text-white">
                {{ row.original.name }}
              </ULink>
            </div>
          </template>
          <template #emailVerified-cell="{ row }">
            <CommonStatusBadge :variant="row.original.emailVerified ? 'active' : 'inactive'" />
          </template>
          <template #actions-cell="{ row }">
            <div class="flex items-center gap-2">
              <UButton
                v-if="row.original.can_activate && !row.original.emailVerified && row.original.id"
                icon="i-lucide-user-check"
                variant="soft"
                color="success"
                size="sm"
                :label="`${t('user.activate')}: ${row.original.name}`"
                :disabled="isMutationPending"
                :loading="isActivatingUser && activatingUserId === row.original.id"
                @click.stop="openActivationModal(row.original)" />
              <UButton
                v-if="row.original.can_update && row.original.id && !deletedUserIds.has(row.original.id)"
                icon="i-lucide-edit-3"
                variant="soft"
                color="neutral"
                size="sm"
                :aria-label="t('user.edit_named', { name: row.original.name })"
                :disabled="isMutationPending"
                :loading="isSavingUser && selectedUser?.id === row.original.id"
                @click.stop="openUpdateModal(row.original)" />
              <UButton
                v-if="row.original.can_delete && row.original.id && !deletedUserIds.has(row.original.id)"
                icon="i-lucide-trash"
                variant="soft"
                color="error"
                size="sm"
                :aria-label="t('user.delete_named', { name: row.original.name })"
                :disabled="isMutationPending"
                :loading="deletingUserId === row.original.id"
                @click.stop="deleteUser(row.original)" />
            </div>
          </template>
        </CommonResourceLayoutPage>
      </div>

      <UserModal
        v-if="selectedUser"
        v-model:open="isModalOpen"
        v-model:state="selectedUser"
        :title="selectedUser.id ? t('user.update_title') : t('user.create_title')"
        :submit-label="selectedUser.id ? t('common.update') : t('common.save')"
        :pending="isMutationPending"
        @submit="saveUser" />
      <UserActivationModal
        v-if="activationState"
        v-model:open="isActivationModalOpen"
        v-model:state="activationState"
        :pending="isActivatingUser"
        @submit="activateUser" />
    </template>
  </UDashboardPanel>
</template>
