<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- Local table callbacks are self-describing and remain covered by component tests. */
import type { ComputedRef } from 'vue'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import { appRouteLocations } from '~/utils/route-locations'
import type { RoleRow } from '~~/shared/types/roles'
import type { ResourceTableStatus } from '~~/shared/types/resource-table'

const {
  roles,
  totalRecords,
  loading = false,
  requestStatus,
  mutationPending = false,
  savingRoleId = null,
  deletingRoleId = null,
  deletedRoleIds = new Set<string>(),
  canCreate = false
} = defineProps<{
  roles: RoleRow[]
  totalRecords: number
  loading?: boolean
  requestStatus?: ResourceTableStatus
  mutationPending?: boolean
  savingRoleId?: string | null
  deletingRoleId?: string | null
  deletedRoleIds?: Set<string>
  canCreate?: boolean
}>()

const emit = defineEmits<{
  (event: 'add' | 'retry'): void
  (event: 'edit' | 'delete', role: RoleRow): void
}>()

const search = defineModel<string>('search', { default: '' })
const pagination = defineModel<{ pageIndex: number; pageSize: number }>('pagination', { required: true })

const { t } = useI18n()
const localePath = useLocalePath()
const { can } = useCan()
const { getBilingualValue } = useBilingualValue()

const roleScope = (role: RoleRow) => {
  if (role.agency_id) {
    return { type: 'agency', agencyId: String(role.agency_id) } as const
  }
  return { type: 'global' } as const
}

const canUpdateRole = (role: RoleRow) => {
  return can('role', 'update', roleScope(role))
}

const canDeleteRole = (role: RoleRow) => {
  return can('role', 'delete', roleScope(role))
}

const columns: TableColumnInput<RoleRow>[] = [
  { id: 'name', accessorKey: 'name_en', headerKey: 'role.name_en' },
  { id: 'permissions', headerKey: 'role.permissions' },
  { id: 'actions', headerKey: 'common.actions' }
]

const bilingualColumns: BilingualColumnConfig<RoleRow>[] = [
  {
    id: 'name',
    accessorKey: { en: 'name_en', fr: 'name_fr' }
  }
]

const visibleRoles: ComputedRef<RoleRow[]> = computed(
  () => roles.filter(role => !deletedRoleIds.has(role.id))
)
const rolePermissions = (role: RoleRow) => role.permissions ?? []
const roleName = (role: RoleRow): string => getBilingualValue(role, 'name', role.name_en || role.name_fr)
const permissionLabel = (permission: RoleRow['permissions'][number]): string => {
  const grants = [
    permission.access_level ? t(`role.access_levels.${permission.access_level}`) : null,
    permission.can_manage_assignments ? t('role.manage_assignments') : null
  ].filter((grant): grant is string => grant !== null)
  return `${t(`role.subjects.${permission.subject}`)}: ${grants.join(', ')}`
}
const buttonLabel: ComputedRef<string | undefined> = computed(() => (canCreate ? t('role.new') : undefined))
</script>

<template>
  <CommonResourceLayoutPage
    v-model:search="search"
    v-model:pagination="pagination"
    :columns="columns"
    :data="visibleRoles"
    :bilingual-columns="bilingualColumns"
    :total-records="totalRecords"
    :loading="loading"
    :request-status="requestStatus"
    :button-label="buttonLabel"
    :show-button="canCreate"
    :button-disabled="mutationPending"
    @add="emit('add')"
    @retry="emit('retry')">
    <template #name-cell="{ row }">
      <CommonBilingualName
        :name-en="row.original.name_en"
        :name-fr="row.original.name_fr"
        :to="localePath(appRouteLocations.roleDetail(row.original.id))" />
    </template>

    <template #permissions-cell="{ row }">
      <div class="flex flex-wrap gap-1">
        <CommonStatusBadge
          v-for="permission in rolePermissions(row.original).slice(0, 3)"
          :key="permission.subject"
          variant="meta"
          size="sm"
          :label="permissionLabel(permission)" />
        <CommonStatusBadge v-if="rolePermissions(row.original).length > 3" variant="count" size="sm" :label="`+${rolePermissions(row.original).length - 3}`" />
      </div>
    </template>
    <template #actions-cell="{ row }">
      <div class="flex items-center gap-2">
        <UButton
          v-if="canUpdateRole(row.original) && !deletedRoleIds.has(row.original.id)"
          icon="i-lucide-edit-3"
          variant="soft"
          color="neutral"
          size="sm"
          data-testid="role-edit"
          :aria-label="t('role.edit_named', { name: roleName(row.original) })"
          :disabled="mutationPending"
          :loading="savingRoleId === row.original.id"
          @click.stop="emit('edit', row.original)" />
        <UButton
          v-if="canDeleteRole(row.original) && !deletedRoleIds.has(row.original.id)"
          icon="i-lucide-trash"
          variant="soft"
          color="error"
          size="sm"
          data-testid="role-delete"
          :aria-label="t('role.delete_named', { name: roleName(row.original) })"
          :disabled="mutationPending"
          :loading="deletingRoleId === row.original.id"
          @click.stop="emit('delete', row.original)" />
      </div>
    </template>
  </CommonResourceLayoutPage>
</template>
