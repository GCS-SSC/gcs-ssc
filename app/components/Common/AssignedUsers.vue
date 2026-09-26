<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- concise component-local action handlers are self-documenting */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { AssignableEntityType } from '~~/shared/types/schemas'
import { useBilingualValue } from '~/composables/useBilingualValue'

const { entityType, entityId } = defineProps<{ entityType: AssignableEntityType; entityId: string }>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useI18n()
const toast = useToast()
const confirm = useConfirmDialog()
const { showError } = useApiErrorToast()
type UserOption = { id: string; name: string }
type GroupOption = { id: string, egcs_cn_name_en: string, egcs_cn_name_fr: string }
const fetchUserOptions = $fetch as unknown as (url: string) => Promise<UserOption[]>
const mutateAssignment = $fetch as unknown as (
  url: string,
  options: { method: 'POST' | 'PATCH' | 'DELETE'; body?: { userId: string } }
) => Promise<unknown>
const selectedUserId: Ref<string | null> = ref(null)
const groups: Ref<GroupOption[]> = ref([])
const isSaving: Ref<boolean> = ref(false)
const isGroupConfirming: Ref<boolean> = ref(false)
const baseUrl = computed(() => `/api/entity-assignments/${entityType}/${entityId}`)
const {
  roster,
  error: rosterError,
  status: rosterStatus,
  refresh
} = useEntityAssignmentRoster(() => entityType, () => entityId, { enabled: false })
const canManage = computed(() => rosterStatus.value === 'success' && !rosterError.value
  && roster.value?.can_manage_assignments === true)
const users: Ref<UserOption[]> = ref([])
const isLoadingUsers: Ref<boolean> = ref(false)
let usersRequestGeneration = 0
let targetGeneration = 0
let disposed = false
const usersError: Ref<boolean> = ref(false)
const loadUsers = async () => {
  const requestedBaseUrl = baseUrl.value
  const requestGeneration = ++usersRequestGeneration
  users.value = []
  usersError.value = false

  isLoadingUsers.value = true
  try {
    await refresh()
    if (disposed || requestGeneration !== usersRequestGeneration || requestedBaseUrl !== baseUrl.value) return
    if (!canManage.value) return
    const nextUsers = await fetchUserOptions(`${requestedBaseUrl}/users`)
    const groupUrl = entityType === 'commonreview'
      ? `/api/reviews/${entityId}/groups`
      : `/api/funding-case-intakes/${entityId}/groups`
    const nextGroups = entityType === 'commonreview' || entityType === 'fundingcaseintake'
      ? await ($fetch as unknown as (url: string) => Promise<{ items: GroupOption[] }>)(groupUrl)
      : null
    if (disposed || requestGeneration !== usersRequestGeneration || requestedBaseUrl !== baseUrl.value) return
    users.value = nextUsers
    groups.value = nextGroups?.items ?? []
  } catch (error: unknown) {
    if (disposed || requestGeneration !== usersRequestGeneration || requestedBaseUrl !== baseUrl.value) return
    users.value = []
    usersError.value = true
    showError(error)
  } finally {
    if (requestGeneration === usersRequestGeneration) isLoadingUsers.value = false
  }
}
watch(baseUrl, () => {
  targetGeneration++
  isSaving.value = false
  isGroupConfirming.value = false
  selectedUserId.value = null
  void loadUsers()
}, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => {
  disposed = true
  targetGeneration++
  usersRequestGeneration++
})
const availableUsers = computed(() => users.value
  .filter(user => !roster.value?.assignments.some(assignment => assignment.user_id === user.id))
  .map(user => ({ label: user.name, value: user.id })))
const currentGroupId = computed(() => roster.value?.group?.id ?? null)
const { getBilingualValue } = useBilingualValue()
const groupOptions = computed(() => {
  const options = groups.value.map(group => ({
    label: getBilingualValue(group, 'egcs_cn_name', group.id), value: group.id
  }))
  const current = roster.value?.group
  if (current?.id && !options.some(option => option.value === current.id)) {
    options.push({ label: getBilingualValue({ egcs_cn_name_en: current.name_en, egcs_cn_name_fr: current.name_fr }, 'egcs_cn_name', current.id), value: current.id })
  }
  return options
})
const currentGroupLabel = computed(() => groupOptions.value.find(option => option.value === currentGroupId.value)?.label ?? t('common.none'))
const assignmentCount = computed(() => roster.value?.assignments.length ?? 0)

const runAction = async (action: () => Promise<unknown>, successMessage: string) => {
  if (disposed || isSaving.value || !canManage.value) return
  const generation = targetGeneration
  const isCurrent = () => !disposed && generation === targetGeneration
  isSaving.value = true
  try {
    await action()
    if (!isCurrent()) return
    selectedUserId.value = null
    await refresh()
    if (!isCurrent() || rosterError.value || rosterStatus.value !== 'success') return
    emit('changed')
    toast.add({
      title: t('common.success'),
      description: successMessage,
      color: 'success'
    })
  } catch (error: unknown) {
    if (isCurrent()) showError(error)
  } finally {
    if (isCurrent()) isSaving.value = false
  }
}
const addUser = async () => {
  if (!selectedUserId.value || !availableUsers.value.some(user => user.value === selectedUserId.value)) return
  const userId = selectedUserId.value
  await runAction(
    () => mutateAssignment(baseUrl.value, { method: 'POST', body: { userId } }),
    t('assignments.added_success')
  )
}
const changeGroup = async (groupId: string | null) => {
  if ((entityType !== 'commonreview' && entityType !== 'fundingcaseintake') || !canManage.value || isSaving.value || isGroupConfirming.value
    || (entityType === 'fundingcaseintake' && !groupId && assignmentCount.value === 0)
    || groupId === currentGroupId.value || (groupId && !groups.value.some(group => group.id === groupId))) return
  const generation = targetGeneration
  const targetId = entityId
  const name = groupOptions.value.find(option => option.value === groupId)?.label ?? ''
  isGroupConfirming.value = true
  try {
    const confirmed = await confirm({
      title: t(groupId ? 'groups.assign_confirm_title' : 'groups.clear_confirm_title'),
      description: groupId ? t('groups.assign_confirm_description', { name }) : t('groups.clear_confirm_description'),
      confirmLabel: t('common.confirm'),
      cancelLabel: t('common.cancel'),
      confirmColor: 'primary'
    })
    if (!confirmed || disposed || generation !== targetGeneration || !canManage.value) return
    await runAction(
      () => ($fetch as unknown as (url: string, options: { method: 'PATCH', body: { egcs_cn_group?: string | null, egcs_fi_group?: string | null } }) => Promise<unknown>)(
        entityType === 'commonreview' ? `/api/reviews/${targetId}/group` : `/api/funding-case-intakes/${targetId}/group`,
        { method: 'PATCH', body: entityType === 'commonreview' ? { egcs_cn_group: groupId } : { egcs_fi_group: groupId } }
      ),
      t('common.updated_success')
    )
  } finally {
    if (generation === targetGeneration) isGroupConfirming.value = false
  }
}
const canPromote = (userId: string) => canManage.value && roster.value?.assignments.some(
  assignment => assignment.user_id === userId && !assignment.is_primary && assignment.is_eligible
) === true
const canRemove = (userId: string) => canManage.value && assignmentCount.value > 1
  && roster.value?.assignments.some(assignment => assignment.user_id === userId && !assignment.is_primary) === true
const promote = async (userId: string) => {
  if (!canPromote(userId)) return
  await runAction(
    () => mutateAssignment(`${baseUrl.value}/primary`, { method: 'PATCH', body: { userId } }),
    t('assignments.primary_updated_success')
  )
}

const remove = async (userId: string, name: string) => {
  const generation = targetGeneration
  const requestedBaseUrl = baseUrl.value
  if (disposed || !canRemove(userId)) return
  const confirmed = await confirm({
    title: t('assignments.remove_title'),
    description: t('assignments.remove_description', { name }),
    confirmLabel: t('assignments.remove'),
    cancelLabel: t('common.cancel'),
    confirmColor: 'error'
  })
  if (!confirmed || disposed || generation !== targetGeneration || requestedBaseUrl !== baseUrl.value || !canRemove(userId)) return

  await runAction(
    () => mutateAssignment(`${baseUrl.value}/${userId}`, { method: 'DELETE' }),
    t('assignments.removed_success')
  )
}
</script>

<template>
  <section class="space-y-5" :aria-labelledby="`assigned-users-${entityType}-${entityId}`">
    <div class="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-800">
      <div class="space-y-1">
        <div class="flex items-center gap-2">
          <h2 :id="`assigned-users-${entityType}-${entityId}`" class="text-base font-semibold text-highlighted">
            {{ t('assignments.title') }}
          </h2>
          <CommonStatusBadge v-if="rosterStatus === 'success'" variant="count" :label="String(assignmentCount)" />
        </div>
        <p class="max-w-3xl text-sm text-muted">
          {{ t('assignments.description') }}
        </p>
      </div>
      <UBadge v-if="roster?.is_primary" color="primary" variant="subtle" icon="i-lucide-star">
        {{ t('assignments.you_are_primary') }}
      </UBadge>
    </div>

    <div v-if="rosterStatus === 'pending'" class="space-y-2" aria-live="polite">
      <USkeleton v-for="index in 2" :key="index" class="h-16 w-full" />
    </div>

    <UAlert
      v-else-if="rosterError"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      :title="t('assignments.load_failed')"
      :description="t('assignments.load_failed_description')">
      <template #actions>
        <UButton color="error" variant="soft" size="sm" icon="i-lucide-refresh-cw" :label="t('common.retry')" @click="loadUsers" />
      </template>
    </UAlert>

    <div v-else-if="assignmentCount === 0" class="rounded-sm border border-dashed border-zinc-300 p-6 text-center dark:border-zinc-700">
      <UIcon name="i-lucide-users" class="mx-auto mb-2 size-6 text-muted" />
      <p class="text-sm text-muted">
        {{ t('assignments.empty') }}
      </p>
    </div>

    <ul v-else class="divide-y divide-default overflow-hidden rounded-sm border border-default bg-white dark:bg-zinc-950">
      <li v-for="assignment in roster?.assignments" :key="assignment.user_id" class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="truncate font-medium">{{ assignment.name }}</span>
            <UBadge v-if="assignment.is_current_user" color="neutral" variant="subtle">
              {{ t('assignments.you') }}
            </UBadge>
            <UBadge v-if="assignment.is_primary" color="primary" variant="subtle">
              {{ t('assignments.primary') }}
            </UBadge>
            <UBadge v-if="assignment.is_inactive" color="neutral" variant="subtle">
              {{ t('assignments.inactive') }}
            </UBadge>
            <UBadge v-else-if="!assignment.is_eligible" color="warning" variant="subtle">
              {{ t('assignments.ineligible') }}
            </UBadge>
          </div>
          <p class="truncate text-xs text-muted">
            {{ assignment.email }}
          </p>
        </div>
        <div v-if="canManage" class="flex gap-1">
          <UButton
            v-if="!assignment.is_primary"
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-star"
            :label="t('assignments.make_primary')"
            :disabled="isSaving || !canPromote(assignment.user_id)"
            @click="promote(assignment.user_id)" />
          <UButton
            v-if="canRemove(assignment.user_id)"
            size="xs"
            color="error"
            variant="ghost"
            icon="i-lucide-user-minus"
            :aria-label="t('assignments.remove_named', { name: assignment.name })"
            :disabled="isSaving"
            @click="remove(assignment.user_id, assignment.name)" />
        </div>
      </li>
    </ul>

    <UAlert v-if="usersError && canManage" color="error" :title="t('assignments.load_failed')">
      <template #actions>
        <UButton :label="t('common.retry')" :disabled="isLoadingUsers" @click="loadUsers" />
      </template>
    </UAlert>
    <div v-if="canManage" class="flex flex-col gap-3 rounded-sm bg-elevated p-4 sm:flex-row sm:items-end">
      <UFormField :label="t('assignments.add_assignee')" required class="min-w-0 flex-1">
        <USelectMenu
          :model-value="selectedUserId ?? undefined"
          :items="availableUsers"
          value-key="value"
          label-key="label"
          searchable
          :loading="isLoadingUsers"
          :placeholder="t('assignments.select_user')"
          :search-input="{ placeholder: t('assignments.search_users') }"
          class="w-full"
          @update:model-value="value => selectedUserId = value ?? null" />
      </UFormField>
      <UButton
        icon="i-lucide-user-plus"
        :label="t('assignments.add')"
        :loading="isSaving"
        :disabled="!selectedUserId || isSaving || isLoadingUsers || usersError"
        @click="addUser" />
    </div>
    <div v-if="(entityType === 'commonreview' || entityType === 'fundingcaseintake') && rosterStatus === 'success'" class="flex flex-col gap-3 rounded-sm bg-slate-200/60 p-4 dark:bg-slate-700/35 sm:flex-row sm:items-end">
      <UFormField v-if="canManage" :label="t('groups.group')" :name="entityType === 'commonreview' ? 'egcs_cn_group' : 'egcs_fi_group'" class="min-w-0 flex-1">
        <USelectMenu
          :model-value="currentGroupId ?? undefined"
          :items="groupOptions"
          value-key="value"
          label-key="label"
          searchable
          :search-input="{ placeholder: t('groups.search_groups') }"
          :placeholder="t('common.none')"
          :disabled="isSaving || isGroupConfirming || isLoadingUsers || usersError"
          class="w-full"
          @update:model-value="value => changeGroup(value ?? null)" />
      </UFormField>
      <p v-else class="text-sm text-muted">
        {{ t('groups.group') }}: {{ currentGroupLabel }}
      </p>
      <UButton
        v-if="canManage && currentGroupId"
        color="warning"
        variant="soft"
        icon="i-lucide-x"
        :label="t('groups.clear_group')"
        :disabled="isSaving || isGroupConfirming || (entityType === 'fundingcaseintake' && assignmentCount === 0)"
        class="w-full bg-amber-100 text-amber-700 ring-1 ring-inset ring-amber-300 hover:bg-amber-200 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/30 dark:hover:bg-amber-400/20 sm:w-auto sm:self-end"
        @click="changeGroup(null)" />
    </div>
  </section>
</template>
