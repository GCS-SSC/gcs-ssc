<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param -- page-local handlers are clear from their names and types */
import { onScopeDispose } from 'vue'
import { useActionContext } from '~/composables/useActionContext'
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
const toast = useLocalizedToast()
const localePath = useLocalePath()
const { getHeroCollapsed } = useDashboard()
const isHeroCollapsed = getHeroCollapsed('users')
const { can, canAny } = useCan()
const { showError } = useApiErrorToast()
const { saveJson } = useJsonRequest()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
let pageLifetime: 'active' | 'disposed' = 'active'
onScopeDispose(() => {
  pageLifetime = 'disposed'
})
const isPageActive = () => pageLifetime === 'active'

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

const findListedUser = (userId: string): UserListItem | null =>
  items.value.find(user => user.id === userId) ?? null
const editContext = useActionContext({
  identity: [() => selectedUser.value?.id],
  authority: () => selectedUser.value?.id
    ? canAny('user', 'update', ['global', 'agency'])
    : canCreateUser.value,
  eligible: () => selectedUser.value !== null && (!selectedUser.value.id
    || (findListedUser(selectedUser.value.id)?.can_update === true
      && !deletedUserIds.value.has(selectedUser.value.id)))
})
const activationContext = useActionContext({
  identity: [() => activatingUserId.value],
  authority: () => can('user', 'update', { type: 'global' }),
  eligible: () => {
    const user = activatingUserId.value ? findListedUser(activatingUserId.value) : null
    return user?.can_activate === true && !user.emailVerified
  }
})
const collectionContext = useActionContext({ identity: [], authority: () => canAny('user', 'read', ['global', 'agency']) })
const deleteContext = useActionContext({
  identity: [],
  authority: () => canAny('user', 'delete', ['global', 'agency'])
})

watch(listError, error => {
  if (error && isPageActive()) {
    showError(error)
  }
})

const refreshUserList = async (): Promise<boolean> => {
  if (!isPageActive()) return false
  await refresh()
  return isPageActive() && !listError.value
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
  if (!isPageActive() || !canCreateUser.value || isMutationPending.value) return
  selectedUser.value = {}
  isModalOpen.value = true
}

const openUpdateModal = (user: UserListItem) => {
  const userId = user.id
  if (!userId) return
  const currentUser = findListedUser(userId)
  if (
    !isPageActive()
    || currentUser?.can_update !== true
    || deletedUserIds.value.has(userId)
    || isMutationPending.value
  ) return
  selectedUser.value = {
    id: userId,
    name: currentUser.name,
    email: currentUser.email,
    image: currentUser.image
  }
  isModalOpen.value = true
}

/** Persists the canonical editable profile fields and refreshes row capabilities. */
const saveUser = async () => {
  const item = selectedUser.value
  if (!isPageActive() || !item || isMutationPending.value) return
  const collection = collectionContext.capture()
  let committed = false
  const operation = editContext.capture()
  if (!operation?.canDispatch()) return
  const isUpdate = !!item.id
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
    if (!isPageActive() || !operation.isCurrent() || selectedUser.value !== item) return
    isModalOpen.value = false
    selectedUser.value = null
    committed = true
    await refreshUserList()
  } catch (error: unknown) {
    if (isPageActive() && (operation.isCurrent() || (committed && collection?.isCurrent()))) showError(error)
  } finally {
    isSavingUser.value = false
  }
}

/** Deletes an authorized row and records success before refreshing the list. */
const deleteUser = async (user: UserListItem) => {
  const userId = user.id
  if (!userId) return
  const operation = deleteContext.capture()
  const canDeleteTarget = () => findListedUser(userId)?.can_delete === true
    && !deletedUserIds.value.has(userId)
  if (
    !isPageActive()
    || !operation?.canDispatch()
    || !canDeleteTarget()
    || isMutationPending.value
    || deletedUserIds.value.has(userId)
  ) return

  try {
    deletingUserId.value = userId
    const deleted = await confirmDeleteRequest(`/api/users/${userId}`, {
      description: t('agency.delete_confirm'),
      operation,
      target: {
        id: userId,
        resolve: () => findListedUser(userId),
        eligible: current => current.can_delete === true && !deletedUserIds.value.has(userId)
      },
      shouldProceed: canDeleteTarget
    })
    if (!deleted || !isPageActive() || !operation.isCurrent()) return
    deletedUserIds.value.add(userId)
    if (selectedUser.value?.id === userId) {
      isModalOpen.value = false
      selectedUser.value = null
    }
    const refreshed = await refreshUserList()

    if (refreshed && operation.isCurrent()) {
      const pageSize = pagination.value.pageSize
      const lastPageIndex = Math.max(Math.ceil(totalRecords.value / pageSize) - 1, 0)
      if (pagination.value.pageIndex > lastPageIndex) {
        pagination.value.pageIndex = lastPageIndex
      }
    }
  } catch (error: unknown) {
    if (isPageActive() && operation.isCurrent()) showError(error)
  } finally {
    deletingUserId.value = null
  }
}

/** Opens password setup for an inactive, manually managed user. */
const openActivationModal = (user: UserListItem) => {
  const userId = user.id
  if (!userId) return
  const currentUser = findListedUser(userId)
  if (!isPageActive() || currentUser?.can_activate !== true || currentUser.emailVerified || isMutationPending.value) return
  activatingUserId.value = userId
  activationState.value = {}
  isActivationModalOpen.value = true
}

/** Creates credentials and activates the selected manually managed user. */
const activateUser = async () => {
  const userId = activatingUserId.value
  const state = activationState.value
  const collection = collectionContext.capture()
  let committed = false
  const operation = activationContext.capture()
  if (!isPageActive() || !userId || !state?.password || isMutationPending.value || !operation?.canDispatch()) return

  try {
    isActivatingUser.value = true
    await saveJson(`/api/users/${userId}/activate`, 'POST', { password: state.password })
    if (!isPageActive() || !operation.isCurrent() || activationState.value !== state) return
    toast.add({ title: toast.localized('user.activated_success'), color: 'success' })
    isActivationModalOpen.value = false
    activationState.value = null
    activatingUserId.value = null
    committed = true
    await refreshUserList()
  } catch (error: unknown) {
    if (isPageActive() && (operation.isCurrent() || (committed && collection?.isCurrent()))) showError(error)
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
  <CommonDetailPage id="users" v-model:collapsed="isHeroCollapsed" data-field-tooltip-unavailable="No owning agency exists for global user administration or authentication." :title="t('nav.users')">
    <template #body>
      <div class="flex flex-1 flex-col overflow-hidden">
        <CommonEntityHero
          :is-collapsed="isHeroCollapsed"
          icon="i-lucide-users"
          :title="t('nav.users')"
          :description="t('user.description')"
          :stats="userHeroStats" />

        <CommonResourceLayout
          v-model:search="search"
          v-model:pagination="pagination"
          layout="page"
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
              <CommonActionButton
                v-if="row.original.can_update && row.original.id && !deletedUserIds.has(row.original.id)"
                icon="i-lucide-edit-3"
                variant="soft"
                color="neutral"
                size="sm"
                :aria-label="t('user.edit_named', { name: row.original.name })"
                :disabled="isMutationPending"
                :loading="isSavingUser && selectedUser?.id === row.original.id"
                @click.stop="openUpdateModal(row.original)" />
              <CommonActionButton
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
        </CommonResourceLayout>
      </div>

      <UserModal
        v-if="selectedUser"
        v-model:open="isModalOpen"
        v-model:state="selectedUser"
        :title="selectedUser.id ? t('user.update_title') : t('user.create_title')"
        :submit-label="selectedUser.id ? t('common.update') : t('common.save')"
        :pending="isMutationPending"
        :action-context="editContext"
        @submit="saveUser" />
      <UserActivationModal
        v-if="activationState"
        v-model:open="isActivationModalOpen"
        v-model:state="activationState"
        :pending="isActivatingUser"
        :action-context="activationContext"
        @submit="activateUser" />
    </template>
  </CommonDetailPage>
</template>
