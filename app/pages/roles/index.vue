<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param -- Page-local request and modal callbacks are covered by focused request tests. */
import { onScopeDispose } from 'vue'
import { useActionContext } from '~/composables/useActionContext'
import type { ComputedRef, Ref } from 'vue'
import type { RoleInput } from '~~/shared/types/schemas/rbac'
import type { RoleRow } from '~~/shared/types/roles'

definePageMeta({
  i18n: {
    paths: {
      en: '/roles',
      fr: '/roles'
    }
  }
})

const { t } = useI18n()
const { getHeroCollapsed } = useDashboard()
const isHeroCollapsed = getHeroCollapsed('roles')
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
  responseQuery,
  refresh,
  retry,
  status,
  error: listError
} = useResourceTable<RoleRow>({
  fetchUrl: '/api/roles',
  initialPageSize: 50
})

const isModalOpen: Ref<boolean> = ref(false)
const selectedRole: Ref<Partial<RoleInput> | null> = ref(null)
const isSavingRole: Ref<boolean> = ref(false)
const deletingRoleId: Ref<string | null> = ref(null)
const deletedRoleIds: Ref<Set<string>> = ref(new Set())
const unreconciledDeletedRoleFilters: Ref<Map<string, string>> = ref(new Map())
const canCreateRole: ComputedRef<boolean> = computed(
  () => canAny('role', 'create', ['global', 'agency'])
)
const isMutationPending: ComputedRef<boolean> = computed(
  () => isSavingRole.value || deletingRoleId.value !== null
)
const responseFilterKey: ComputedRef<string> = computed(() => JSON.stringify({
  search: responseQuery.value?.search,
  status: responseQuery.value?.status
}))
const unreconciledDeleteCount: ComputedRef<number> = computed(
  () => unreconciledDeletedRoleFilters.value.size
)
const filteredUnreconciledDeleteCount: ComputedRef<number> = computed(() =>
  Array.from(unreconciledDeletedRoleFilters.value.values())
    .filter(filterKey => filterKey === responseFilterKey.value)
    .length
)
const displayedTotalRecords: ComputedRef<number> = computed(() => {
  return Math.max(totalRecords.value - filteredUnreconciledDeleteCount.value, 0)
})
const displayedStatsTotal: ComputedRef<number> = computed(() => {
  const statsTotal = response.value?.stats?.total
  const normalizedStatsTotal = typeof statsTotal === 'number' && !Number.isNaN(statsTotal)
    ? statsTotal
    : 0
  return Math.max(normalizedStatsTotal - unreconciledDeleteCount.value, 0)
})

const roleScope = (role: Partial<RoleInput>) => {
  if (role.agency_id) {
    return { type: 'agency', agencyId: String(role.agency_id) } as const
  }
  return { type: 'global' } as const
}

const findListedRole = (roleId: string): RoleRow | null =>
  items.value.find(role => role.id === roleId) ?? null

const editContext = useActionContext({
  identity: [
    () => selectedRole.value?.id,
    () => selectedRole.value?.id ? findListedRole(selectedRole.value.id)?.agency_id : selectedRole.value?.agency_id
  ],
  authority: () => {
    const draft = selectedRole.value
    if (!draft) return false
    const currentRole = draft.id ? findListedRole(draft.id) : draft
    return Boolean(currentRole && can('role', draft.id ? 'update' : 'create', roleScope(currentRole)))
  },
  eligible: () => Boolean(selectedRole.value && (!selectedRole.value.id
    || (findListedRole(selectedRole.value.id) && !deletedRoleIds.value.has(selectedRole.value.id))))
})
const collectionContext = useActionContext({ identity: [], authority: () => canAny('role', 'read', ['global', 'agency']) })
const deleteContext = useActionContext({
  identity: [],
  authority: () => canAny('role', 'delete', ['global', 'agency'])
})

const reconcileConfirmedDeletes = () => {
  if (status.value === 'success' && unreconciledDeletedRoleFilters.value.size > 0) {
    unreconciledDeletedRoleFilters.value.clear()
  }
}

watch(listError, error => {
  if (error && isPageActive()) {
    showError(error)
  }
})

watch(status, reconcileConfirmedDeletes)

const refreshRoleList = async (isCurrent: () => boolean = isPageActive): Promise<boolean> => {
  if (!isPageActive() || !isCurrent()) return false
  try {
    await refresh()
    if (!isPageActive() || !isCurrent()) return false
    const succeeded = status.value === 'success'
    if (succeeded) {
      reconcileConfirmedDeletes()
    }
    return succeeded
  } catch (error: unknown) {
    if (isPageActive() && isCurrent()) showError(error)
    return false
  }
}

const roleHeroStats = computed(() => [
  {
    label: t('role.total'),
    value: displayedStatsTotal.value
  }
])

const openCreateModal = () => {
  if (!isPageActive() || !canCreateRole.value || isMutationPending.value) return
  selectedRole.value = { permissions: [], transfer_payment_ids: [] }
  isModalOpen.value = true
}

/** Opens an authorized role as isolated modal state. */
const openUpdateModal = (role: RoleRow) => {
  const listedRole = findListedRole(role.id)
  if (
    !isPageActive()
    || !listedRole
    || !can('role', 'update', roleScope(listedRole))
    || deletedRoleIds.value.has(listedRole.id)
    || isMutationPending.value
  ) return

  selectedRole.value = {
    id: listedRole.id,
    name_en: listedRole.name_en,
    name_fr: listedRole.name_fr,
    description_en: listedRole.description_en,
    description_fr: listedRole.description_fr,
    agency_id: listedRole.agency_id,
    permissions: listedRole.permissions.map(permission => ({ ...permission })),
    transfer_payment_ids: [...listedRole.transfer_payment_ids]
  }
  isModalOpen.value = true
}

/** Persists canonical role fields after rechecking the selected scope. */
const saveRole = async () => {
  const item = selectedRole.value
  if (!isPageActive() || !item || isMutationPending.value) return
  const collection = collectionContext.capture()
  const operation = editContext.capture()
  if (!operation?.canDispatch()) return
  const isUpdate = !!item.id
  const listedRole = item.id ? findListedRole(item.id) : null
  if (isUpdate && !listedRole) return
  const action = isUpdate ? 'update' : 'create'
  if (!can('role', action, roleScope(listedRole ?? item))) return
  if (item.id && deletedRoleIds.value.has(item.id)) return
  const submittedDraft = JSON.stringify(item)
  const method = isUpdate ? 'PATCH' : 'POST'
  const requestBody = isUpdate
    ? Object.fromEntries((['name_en', 'name_fr', 'description_en', 'description_fr', 'transfer_payment_ids'] as const)
        .filter(key => key in item)
        .map(key => [key, item[key]]))
    : item

  try {
    isSavingRole.value = true
    await saveJson(isUpdate ? `/api/roles/${item.id}` : '/api/roles', method, requestBody)
    if (!isPageActive() || !operation.isCurrent() || selectedRole.value !== item) return
    if (JSON.stringify(item) === submittedDraft) {
      isModalOpen.value = false
      selectedRole.value = null
    }
    await refreshRoleList(() => collection?.isCurrent() === true)
  } catch (error: unknown) {
    if (isPageActive() && operation.isCurrent()) showError(error)
  } finally {
    isSavingRole.value = false
  }
}

/** Deletes an authorized role and reconciles local list state. */
const deleteRole = async (role: RoleRow) => {
  const listedRole = findListedRole(role.id)
  if (
    !isPageActive()
    || !listedRole
    || !can('role', 'delete', roleScope(listedRole))
    || isMutationPending.value
    || deletedRoleIds.value.has(listedRole.id)
  ) return

  const operation = deleteContext.capture()
  if (!operation?.canDispatch()) return
  const roleId = listedRole.id
  const agencyId = listedRole.agency_id
  const canDeleteTarget = () => {
    const currentRole = findListedRole(roleId)
    return Boolean(currentRole && currentRole.agency_id === agencyId
      && can('role', 'delete', roleScope(currentRole)) && !deletedRoleIds.value.has(roleId))
  }
  const deletedRoleFilterKey = responseFilterKey.value
  try {
    deletingRoleId.value = roleId
    const deleted = await confirmDeleteRequest(`/api/roles/${roleId}`, {
      description: t('agency.delete_confirm'),
      operation,
      target: {
        id: roleId,
        resolve: () => findListedRole(roleId),
        eligible: current => current.agency_id === agencyId
          && can('role', 'delete', roleScope(current)) && !deletedRoleIds.value.has(current.id)
      },
      shouldProceed: canDeleteTarget
    })
    if (!deleted || !isPageActive() || !operation.isCurrent()) return
    deletedRoleIds.value.add(roleId)
    unreconciledDeletedRoleFilters.value.set(roleId, deletedRoleFilterKey)
    if (selectedRole.value?.id === roleId) {
      isModalOpen.value = false
      selectedRole.value = null
    }
    await refreshRoleList(operation.isCurrent)
    if (!operation.isCurrent()) return

    const pageSize = pagination.value.pageSize
    const lastPageIndex = Math.max(Math.ceil(displayedTotalRecords.value / pageSize) - 1, 0)
    if (pagination.value.pageIndex > lastPageIndex) {
      pagination.value.pageIndex = lastPageIndex
    }
  } catch (error: unknown) {
    if (isPageActive() && operation.isCurrent()) showError(error)
  } finally {
    deletingRoleId.value = null
  }
}
</script>

<template>
  <CommonDetailPage id="roles" v-model:collapsed="isHeroCollapsed" :title="t('role.title')">
    <template #body>
      <div class="flex flex-1 flex-col overflow-hidden">
        <CommonEntityHero
          :is-collapsed="isHeroCollapsed"
          icon="i-lucide-shield"
          :title="t('role.title')"
          :description="t('role.description')"
          :stats="roleHeroStats" />

        <RoleTable
          v-model:search="search"
          v-model:pagination="pagination"
          :roles="items"
          :total-records="displayedTotalRecords"
          :loading="status === 'pending'"
          :request-status="status"
          :mutation-pending="isMutationPending"
          :saving-role-id="isSavingRole ? selectedRole?.id : null"
          :deleting-role-id="deletingRoleId"
          :deleted-role-ids="deletedRoleIds"
          :can-create="canCreateRole"
          @retry="retry"
          @add="openCreateModal"
          @edit="openUpdateModal"
          @delete="deleteRole" />
      </div>

      <RoleModal
        v-if="selectedRole"
        v-model:open="isModalOpen"
        v-model:state="selectedRole"
        :title="selectedRole.id ? t('role.update_title') : t('role.create_title')"
        :submit-label="selectedRole.id ? t('common.update') : t('common.save')"
        :pending="isMutationPending"
        :action-context="editContext"
        @submit="saveRole"
      />
    </template>
  </CommonDetailPage>
</template>
