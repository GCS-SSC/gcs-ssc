<script setup lang="ts">
import type { AssignableEntityType } from '~~/shared/types/schemas'
import type { BusinessRecordStateFields } from '~~/shared/types/business-record-state'
import { buildAssignedWorkRoute } from '~~/shared/utils/entity-assignments'

type WorkItem = BusinessRecordStateFields & {
  entity_id: string
  entity_type: AssignableEntityType
  status: string
  identifier_en: string
  identifier_fr: string
  is_primary: boolean
  agreement_id: string | null
  variant: string | null
}

const { items, compact = false, emptyMessage } = defineProps<{ items: WorkItem[], compact?: boolean, emptyMessage?: string }>()
const { t } = useI18n()
const localePath = useLocalePath()
const { getBilingualValue } = useBilingualValue()
const itemUrl = (item: WorkItem) => localePath(buildAssignedWorkRoute(item.entity_type, item.entity_id, item.agreement_id, item.variant))
</script>

<template>
  <ul class="divide-y divide-default">
    <li v-for="item in items" :key="`${item.entity_type}:${item.entity_id}`">
      <NuxtLink :to="itemUrl(item)" class="group flex items-center gap-4 py-4 transition-colors hover:bg-elevated/50" :class="compact ? 'px-2' : 'px-3 sm:px-5'">
        <span class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <UIcon :name="item.entity_type === 'fundingcaseagreement' ? 'i-lucide-handshake' : item.entity_type === 'applicantrecipient' ? 'i-lucide-building-2' : 'i-lucide-file-check-2'" class="size-5" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block truncate font-semibold text-highlighted group-hover:text-primary">{{ getBilingualValue(item, 'identifier', item.entity_id) }}</span>
          <span class="block truncate text-xs text-muted">{{ t(`assignments.entity_types.${item.entity_type}`) }}</span>
        </span>
        <UBadge v-if="item.is_primary && !compact" color="primary" variant="subtle" class="hidden sm:inline-flex">{{ t('assignments.primary') }}</UBadge>
        <CommonAssignedWorkStatusBadge :entity-type="item.entity_type" :status="item.status" :is-completed="item.isCompleted" />
        <UIcon name="i-lucide-arrow-up-right" class="size-4 shrink-0 text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
      </NuxtLink>
    </li>
    <li v-if="items.length === 0" class="px-5 py-8 text-sm text-muted">
      {{ emptyMessage ?? t('home.no_assigned_work') }}
    </li>
  </ul>
</template>
