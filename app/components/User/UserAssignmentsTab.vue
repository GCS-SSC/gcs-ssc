<script setup lang="ts">
import type { UserAssignment } from '~~/shared/types/admin'

const {
  assignments,
  getLocalizedName,
  canAdd = false,
  deletingAssignmentId = null
} = defineProps<{
  assignments: UserAssignment[]
  getLocalizedName: (item: UserAssignment, field: string) => string
  canAdd?: boolean
  deletingAssignmentId?: string | null
}>()

const emit = defineEmits<{
  add: []
  delete: [assignmentId: string]
}>()

const { t } = useI18n()
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 py-4">
    <div class="mb-4 flex items-center justify-between">
      <h3 class="text-lg font-bold text-zinc-900 dark:text-white">
        {{ t('role.assignment.title') }}
      </h3>
      <UButton
        v-if="canAdd"
        :label="t('role.assignment.new')"
        icon="i-lucide-plus"
        @click="emit('add')" />
    </div>

    <div
      v-if="assignments.length === 0"
      class="rounded-2xl border-2 border-dashed border-zinc-200 bg-zinc-50 py-12 text-center dark:border-zinc-700 dark:bg-zinc-800/50">
      <UIcon name="i-lucide-shield-off" class="mb-4 size-12 text-zinc-300 dark:text-zinc-600" />
      <p class="text-zinc-500">
        {{ t('user.no_assignments') }}
      </p>
    </div>

    <div v-else class="grid grid-cols-1 gap-4">
      <UCard v-for="assignment in assignments" :key="assignment.id" class="relative overflow-hidden">
        <div class="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div class="flex items-center gap-4">
            <div class="bg-primary/10 rounded-lg p-3">
              <UIcon name="i-lucide-shield" class="text-primary size-6" />
            </div>
            <div>
              <h4 class="font-bold text-zinc-900 dark:text-white">
                {{ getLocalizedName(assignment, 'role_name') }}
              </h4>
              <p class="text-sm text-zinc-500">
                {{ getLocalizedName(assignment, 'agency_name') }}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <UButton
              v-if="assignment.can_delete"
              icon="i-lucide-trash"
              variant="soft"
              color="error"
              :loading="deletingAssignmentId === assignment.id"
              :disabled="deletingAssignmentId !== null"
              :aria-label="t('role.assignment.delete_named', {
                role: getLocalizedName(assignment, 'role_name'),
                agency: getLocalizedName(assignment, 'agency_name')
              })"
              @click="emit('delete', assignment.id)" />
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
