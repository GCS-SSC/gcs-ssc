<script setup lang="ts">
import type { RolePermissionInput, RoleAccessLevel } from '~~/shared/types/schemas/rbac'
import type { RoleAbilitySubject } from '~~/shared/utils/abilities'
import { canSubjectManageAssignments } from '~~/shared/utils/role-scope'

const { allowedSubjects, rolePermissions, canUpdateRole, pending = false } = defineProps<{
  allowedSubjects: RoleAbilitySubject[]
  rolePermissions: RolePermissionInput[]
  canUpdateRole: boolean
  pending?: boolean
}>()
const emit = defineEmits<{ change: [subject: RoleAbilitySubject, permission: RolePermissionInput | null] }>()
const { t } = useI18n()
const levelItems = computed(() => [
  { label: t('role.access_levels.none'), value: 'none' },
  { label: t('role.access_levels.viewer'), value: 'viewer' },
  { label: t('role.access_levels.contributor'), value: 'contributor' },
  { label: t('role.access_levels.manager'), value: 'manager' }
])
const getPermission = (subject: RoleAbilitySubject): RolePermissionInput | null =>
  rolePermissions.find(permission => permission.subject === subject) ?? null
/**
 * Updates one subject's cumulative access level while preserving its independent roster grant.
 * @param subject Authorization subject to update.
 * @param value Selected level or `none`.
 */
const updateLevel = (subject: RoleAbilitySubject, value: string): void => {
  const existing = getPermission(subject)
  const accessLevel = value === 'none' ? null : value as RoleAccessLevel
  const canManage = existing?.can_manage_assignments ?? false
  emit('change', subject, accessLevel === null && !canManage
    ? null
    : {
        subject, access_level: accessLevel, can_manage_assignments: canManage
      })
}
/**
 * Updates the independent roster-management grant while preserving the access level.
 * @param subject Authorization subject to update.
 * @param enabled Whether roster management is granted.
 */
const updateAssignmentManagement = (subject: RoleAbilitySubject, enabled: boolean): void => {
  const accessLevel = getPermission(subject)?.access_level ?? null
  emit('change', subject, accessLevel === null && !enabled
    ? null
    : {
        subject, access_level: accessLevel, can_manage_assignments: enabled
      })
}
</script>

<template>
  <div class="mx-auto max-w-5xl divide-y divide-default rounded-sm border border-default">
    <div v-for="subject in allowedSubjects" :key="subject" class="grid gap-4 p-4 md:grid-cols-[1fr_14rem_12rem] md:items-center">
      <div>
        <p class="font-medium">
          {{ t(`role.subjects.${subject}`) }}
        </p>
        <p class="text-sm text-muted">
          {{ t('role.permission_level_help') }}
        </p>
      </div>
      <CommonEnumSelect
        name="role_access_level"
        :aria-label="`${t(`role.subjects.${subject}`)}: ${t('role.permission_level')}`"
        :items="levelItems"
        :model-value="getPermission(subject)?.access_level ?? 'none'"
        :disabled="!canUpdateRole || pending"
        @update:model-value="value => updateLevel(subject, value ?? 'none')" />
      <USwitch
        v-if="canSubjectManageAssignments(subject)"
        :model-value="getPermission(subject)?.can_manage_assignments ?? false"
        :label="`${t('role.manage_assignments')}: ${t(`role.subjects.${subject}`)}`"
        :disabled="!canUpdateRole || pending"
        @update:model-value="value => updateAssignmentManagement(subject, value)" />
    </div>
  </div>
</template>
