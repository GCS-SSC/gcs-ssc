<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- local status presentation helpers are self-describing */
import type { ReviewRuntimeNavigationItem, ReviewRuntimeStatus } from '~/types/review-runtime'

const {
  eyebrow,
  title,
  items,
  selectedValue,
  isSaving = false,
  canSave = true
} = defineProps<{
  eyebrow: string
  title: string
  items: ReviewRuntimeNavigationItem[]
  selectedValue: string
  isSaving?: boolean
  canSave?: boolean
}>()

const emit = defineEmits<{
  select: [value: string]
  save: []
}>()

const { t } = useI18n()
const getStatusIcon = (status: ReviewRuntimeStatus) => {
  if (status === 'completed') return 'i-lucide-circle-check-big'
  if (status === 'in_progress') return 'i-lucide-circle-dot'
  return 'i-lucide-circle-dashed'
}
const getStatusIconClass = (status: ReviewRuntimeStatus) => {
  if (status === 'completed') return 'text-green-600 dark:text-green-400'
  if (status === 'in_progress') return 'text-orange-500 dark:text-orange-400'
  return 'text-zinc-400 dark:text-zinc-500'
}
const getStatusLabel = (status: ReviewRuntimeStatus) => t(`assessment.runtime_status.${status}`)
const handleSelect = (value: string) => {
  if (value) emit('select', value)
}
const handleSave = () => {
  if (canSave) emit('save')
}
</script>

<template>
  <div class="rounded-sm bg-white text-sm dark:bg-zinc-900">
    <div class="px-4 py-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary-700/80 dark:text-primary-200/80">
            {{ eyebrow }}
          </p>
          <p class="mt-1 text-base font-semibold text-zinc-950 dark:text-white">
            {{ title }}
          </p>
        </div>

        <CommonSaveButton
          :label="t('common.save')"
          :loading="isSaving"
          :disabled="isSaving || !canSave"
          type="button"
          variant="subtle"
          :ui="{ base: 'rounded-sm' }"
          @click="handleSave" />
      </div>
    </div>

    <div class="space-y-4 px-4 py-4">
      <div class="divide-y divide-primary-500/40 dark:divide-primary-600/40">
        <button
          v-for="item in items"
          :key="item.key"
          type="button"
          class="group block w-full cursor-default px-3 py-3 text-left transition-colors"
          :class="selectedValue === item.value
            ? 'bg-primary-50 dark:bg-primary-950/20'
            : 'hover:bg-primary-50/70 dark:hover:bg-primary-950/14'"
          @click="handleSelect(item.value)">
          <div class="flex items-start gap-3">
            <UIcon
              :name="item.icon"
              class="mt-0.5 size-4 shrink-0 text-primary-700 dark:text-primary-200" />
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between gap-3">
                <p class="text-sm font-semibold text-zinc-950 dark:text-white">
                  {{ item.label }}
                </p>
                <UIcon
                  v-if="item.status"
                  :name="getStatusIcon(item.status)"
                  aria-hidden="true"
                  class="size-4 shrink-0"
                  :class="getStatusIconClass(item.status)" />
                <span v-if="item.status" class="sr-only">
                  {{ getStatusLabel(item.status) }}
                </span>
              </div>
              <div v-if="item.rows.length > 0" class="mt-2 space-y-1.5">
                <div
                  v-for="row in item.rows"
                  :key="row.key"
                  class="flex items-center justify-between gap-3 text-sm text-zinc-700 dark:text-zinc-300">
                  <span class="min-w-0 flex-1 truncate">
                    {{ row.label }}
                  </span>
                  <UIcon
                    :name="getStatusIcon(row.status)"
                    aria-hidden="true"
                    class="size-4 shrink-0"
                    :class="getStatusIconClass(row.status)" />
                  <span class="sr-only">
                    {{ getStatusLabel(row.status) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </button>
      </div>

      <slot name="result" />
    </div>
  </div>
</template>
