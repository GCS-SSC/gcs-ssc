<script setup lang="ts">
import { computed } from 'vue'
import type { PublicationState, RuntimeState } from '~~/shared/constants/system-lifecycle'

type EntityHeroActionBase = {
  label?: string
  ariaLabel?: string
  icon?: string
  color?: 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'
  variant?: 'solid' | 'outline' | 'soft' | 'subtle' | 'ghost' | 'link'
  loading?: boolean
  disabled?: boolean
  visible?: boolean
}

type EntityHeroAction = EntityHeroActionBase & (
  | { onClick: () => void, to?: never }
  | { onClick?: never, to: string | Record<string, unknown> }
)

const {
  isCollapsed = false,
  icon,
  iconText,
  title,
  description,
  metaItems = [],
  badges = [],
  stats = [],
  actions = []
} = defineProps<{
  isCollapsed?: boolean
  icon?: string
  iconText?: string
  title: string
  description?: string
  metaItems?: Array<string | number | null | undefined>
  badges?: Array<{
    statusId?: string
    isCompleted?: boolean
    lifecycleEngine?: 'publication' | 'runtime'
    lifecycleState?: PublicationState | RuntimeState
    enumName?: string
    status?: string
    variant?: string
    labelKey?: string
    label?: string
    uiVariant?: 'solid' | 'outline' | 'soft' | 'subtle'
    prefixLabel?: string
  }>
  stats?: Array<{
    label: string
    value: string | number | null | undefined
    accent?: boolean
    visible?: boolean
  }>
  actions?: EntityHeroAction[]
}>()

const visibleMetaItems = computed(() => metaItems.filter(item => item !== undefined && item !== null && String(item).trim() !== ''))
const visibleStats = computed(() => stats.filter(stat => stat.visible !== false && stat.value !== undefined && stat.value !== null && stat.label.trim() !== ''))
const visibleActions = computed(() => actions.filter(action =>
  action.visible !== false
  && (String(action.label ?? '').trim() !== '' || String(action.icon ?? '').trim() !== '')
  && (Boolean(action.onClick) !== Boolean(action.to))
))
</script>

<template>
  <div
    class="border-default relative shrink-0 overflow-hidden bg-white transition-all duration-300 dark:bg-zinc-900/50"
    :class="[isCollapsed ? 'border-b px-6 pb-3 opacity-100 md:px-8' : 'border-b px-6 py-3 opacity-100 md:px-8']">
    <div class="bg-grid-pattern absolute inset-0 opacity-10" />

    <div class="relative flex flex-col justify-between gap-6 md:flex-row md:items-end">
      <div class="space-y-2">
        <h1 v-if="!isCollapsed" class="flex items-center gap-4 text-2xl font-black tracking-tight text-zinc-900 md:text-4xl dark:text-white">
          <span
            v-if="icon || iconText"
            class="bg-primary/10 border-primary/20 hidden h-14 min-w-14 shrink-0 items-center justify-center rounded-lg border px-4 shadow-sm md:flex">
            <UIcon v-if="icon" :name="icon" class="text-primary size-8" />
            <span v-else class="text-primary text-2xl font-black tracking-tighter">
              {{ iconText }}
            </span>
          </span>
          <span>{{ title }}</span>
        </h1>

        <p v-if="description && !isCollapsed" class="max-w-3xl font-medium text-zinc-500 dark:text-zinc-400">
          {{ description }}
        </p>

        <div v-if="visibleMetaItems.length > 0 || badges.length > 0" class="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
          <template v-for="(item, index) in visibleMetaItems" :key="`${index}:${item}`">
            <span v-if="index > 0" class="hidden size-1 rounded-full bg-zinc-300 sm:inline dark:bg-zinc-700" />
            <span>{{ item }}</span>
          </template>

          <template v-if="badges.length > 0">
            <span v-if="visibleMetaItems.length > 0" class="hidden size-1 rounded-full bg-zinc-300 sm:inline dark:bg-zinc-700" />
            <div
              v-for="(badge, badgeIndex) in badges"
              :key="`${badgeIndex}:${badge.statusId ?? badge.enumName ?? badge.variant ?? badge.status ?? badge.label ?? badge.labelKey}`"
              class="flex items-center gap-2">
              <span v-if="badge.prefixLabel" class="text-xs font-black tracking-widest text-zinc-400 uppercase dark:text-zinc-500">
                {{ badge.prefixLabel }}
              </span>
              <CommonRecordState
                v-if="badge.statusId"
                :status-id="badge.statusId"
                :is-completed="badge.isCompleted" />
              <CommonLifecycleBadge
                v-else-if="badge.lifecycleEngine && badge.lifecycleState"
                :engine="badge.lifecycleEngine"
                :state="badge.lifecycleState" />
              <CommonStatusBadge
                v-else
                :enum-name="badge.enumName"
                :status="badge.status"
                :variant="badge.variant"
                :label-key="badge.labelKey"
                :label="badge.label"
                :ui-variant="badge.uiVariant" />
            </div>
          </template>
        </div>
      </div>

      <div v-if="!isCollapsed && (visibleStats.length > 0 || visibleActions.length > 0)" class="flex flex-wrap items-center gap-4 md:justify-end">
        <div v-if="visibleStats.length > 0" class="flex items-center gap-6">
          <template v-for="(stat, statIndex) in visibleStats" :key="`${statIndex}:${stat.label}`">
            <div v-if="statIndex > 0" class="h-10 w-px bg-zinc-200 dark:bg-zinc-800" />
            <div class="flex flex-col">
              <span class="text-xs font-black tracking-widest text-zinc-400 uppercase dark:text-zinc-500">
                {{ stat.label }}
              </span>
              <span
                class="text-3xl font-black tabular-nums"
                :class="stat.accent ? 'text-primary' : 'text-zinc-900 dark:text-white'">
                {{ stat.value }}
              </span>
            </div>
          </template>
        </div>

        <div v-if="visibleActions.length > 0" class="flex flex-wrap items-center gap-2">
          <template v-for="(action, actionIndex) in visibleActions" :key="`${actionIndex}:${action.label}`">
            <UButton
              v-if="action.onClick"
              :label="action.label"
              :icon="action.icon"
              :color="action.color"
              :variant="action.variant"
              :loading="action.loading"
              :disabled="action.disabled"
              :aria-label="action.ariaLabel"
              class="px-6"
              @click="action.onClick" />
            <UButton
              v-else-if="action.to"
              :label="action.label"
              :icon="action.icon"
              :color="action.color"
              :variant="action.variant"
              :to="action.to"
              :loading="action.loading"
              :disabled="action.disabled"
              :aria-label="action.ariaLabel"
              class="px-6" />
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
