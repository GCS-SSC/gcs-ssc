<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- concise component-local action handlers are self-documenting */
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { AssignableEntityType } from '~~/shared/types/schemas'

const { entityType, entityId } = defineProps<{ entityType: AssignableEntityType; entityId: string }>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useI18n()
const toast = useToast()
const confirm = useConfirmDialog()
const { showError } = useApiErrorToast()
type UserOption = { id: string; name: string }
const fetchUserOptions = $fetch as unknown as (url: string) => Promise<UserOption[]>
const mutateAssignment = $fetch as unknown as (
  url: string,
  options: { method: 'POST' | 'PATCH' | 'DELETE'; body?: { userId: string } }
) => Promise<unknown>
const selectedUserId: Ref<string | null> = ref(null)
const isSaving: Ref<boolean> = ref(false)
const baseUrl = computed(() => `/api/entity-assignments/${entityType}/${entityId}`)
const {
  roster,
  error: rosterError,
  status: rosterStatus,
  refresh
} = useEntityAssignmentRoster(() => entityType, () => entityId)
const users: Ref<UserOption[]> = ref([])
const isLoadingUsers: Ref<boolean> = ref(false)
let usersRequestGeneration = 0
watch(baseUrl, async requestedBaseUrl => {
  const requestGeneration = ++usersRequestGeneration
  selectedUserId.value = null
  users.value = []

  isLoadingUsers.value = true
  try {
    await refresh()
    if (requestGeneration !== usersRequestGeneration || requestedBaseUrl !== baseUrl.value) return
    if (roster.value?.can_manage_assignments !== true) return
    const nextUsers = await fetchUserOptions(`${requestedBaseUrl}/users`)
    if (requestGeneration !== usersRequestGeneration || requestedBaseUrl !== baseUrl.value) return
    users.value = nextUsers
  } catch (error: unknown) {
    if (requestGeneration !== usersRequestGeneration || requestedBaseUrl !== baseUrl.value) return
    users.value = []
    showError(error)
  } finally {
    if (requestGeneration === usersRequestGeneration) isLoadingUsers.value = false
  }
}, { immediate: true })
const availableUsers = computed(() => users.value
  .filter(user => !roster.value?.assignments.some(assignment => assignment.user_id === user.id))
  .map(user => ({ label: user.name, value: user.id })))
const assignmentCount = computed(() => roster.value?.assignments.length ?? 0)

const runAction = async (action: () => Promise<unknown>, successMessage: string) => {
  if (isSaving.value) return
  isSaving.value = true
  try {
    await action()
    selectedUserId.value = null
    await refresh()
    emit('changed')
    toast.add({
      title: t('common.success'),
      description: successMessage,
      color: 'success'
    })
  } catch (error: unknown) {
    showError(error)
  } finally {
    isSaving.value = false
  }
}
const addUser = async () => {
  if (!selectedUserId.value) return
  const userId = selectedUserId.value
  await runAction(
    () => mutateAssignment(baseUrl.value, { method: 'POST', body: { userId } }),
    t('assignments.added_success')
  )
}
const promote = async (userId: string) => await runAction(
  () => mutateAssignment(`${baseUrl.value}/primary`, { method: 'PATCH', body: { userId } }),
  t('assignments.primary_updated_success')
)
const remove = async (userId: string, name: string) => {
  const confirmed = await confirm({
    title: t('assignments.remove_title'),
    description: t('assignments.remove_description', { name }),
    confirmLabel: t('assignments.remove'),
    cancelLabel: t('common.cancel'),
    confirmColor: 'error'
  })
  if (!confirmed) return

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
        <UButton color="error" variant="soft" size="sm" icon="i-lucide-refresh-cw" :label="t('common.retry')" @click="() => refresh()" />
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
        <div v-if="roster?.can_manage_assignments" class="flex gap-1">
          <UButton
            v-if="!assignment.is_primary"
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-star"
            :label="t('assignments.make_primary')"
            :disabled="isSaving || !assignment.is_eligible"
            @click="promote(assignment.user_id)" />
          <UButton
            v-if="!assignment.is_primary && assignmentCount > 1"
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

    <div v-if="roster?.can_manage_assignments" class="flex flex-col gap-3 rounded-sm bg-elevated p-4 sm:flex-row sm:items-end">
      <UFormField :label="t('assignments.add_assignee')" class="min-w-0 flex-1">
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
        :disabled="!selectedUserId || isSaving"
        @click="addUser" />
    </div>
  </section>
</template>
