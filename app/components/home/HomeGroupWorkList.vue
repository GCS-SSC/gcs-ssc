<script setup lang="ts">
import { ASSIGNABLE_ENTITY_TYPE_ENUM } from '~~/shared/constants/enums'
import { buildAssignedWorkRoute } from '~~/shared/utils/entity-assignments'
import type { AssignableEntityType } from '~~/shared/types/schemas'
import { appRouteLocations } from '~/utils/route-locations'

type GroupItem = {
  kind: 'review' | 'additional_reviewer' | 'approval'
  id: string
  entity_type: string
  entity_id: string
  variant: 'checklist' | 'assessment' | null
  name_en: string
  name_fr: string
  group_name_en: string
  group_name_fr: string
  agreement_id: string | null
}
const { items, claimable = false, busyId = null } = defineProps<{ items: GroupItem[], claimable?: boolean, busyId?: string | null }>()
const emit = defineEmits<{ claim: [item: GroupItem] }>()
const { t } = useI18n()
const localePath = useLocalePath()
const { getBilingualValue } = useBilingualValue()
/**
 * Builds the route for a group work item when one is available.
 * @param item - Group work item.
 * @returns Localized route or null.
 */
const itemUrl = (item: GroupItem): string | null => {
  if (item.entity_type === 'commonreview') return localePath(item.variant === 'checklist' ? appRouteLocations.checklistDetail(item.entity_id) : appRouteLocations.assessmentDetail(item.entity_id))
  if (item.entity_type === 'commonrecommendation') return localePath(appRouteLocations.recommendationDetail(item.entity_id))
  if (item.entity_type === 'fundingcaseagreement') return localePath(appRouteLocations.agreementDetail(item.entity_id))
  if (item.entity_type === 'applicantrecipient') return localePath(appRouteLocations.proponentEdit(item.entity_id))
  if (item.entity_type === 'fundingclaimreconcile') return localePath(appRouteLocations.claimReconciliationDetail(item.entity_id))
  if (item.agreement_id && ASSIGNABLE_ENTITY_TYPE_ENUM.includes(item.entity_type as AssignableEntityType)) return localePath(buildAssignedWorkRoute(item.entity_type as AssignableEntityType, item.entity_id, item.agreement_id, item.variant))
  return null
}
</script>

<template>
  <ul class="divide-y divide-default">
    <li v-for="item in items" :key="`${item.kind}:${item.id}`" class="flex items-center gap-4 px-3 py-4 sm:px-5">
      <span class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><UIcon :name="item.kind === 'approval' ? 'i-lucide-stamp' : 'i-lucide-clipboard-check'" class="size-5" /></span>
      <span class="min-w-0 flex-1">
        <NuxtLink v-if="itemUrl(item)" :to="itemUrl(item)!" class="block truncate font-semibold text-highlighted hover:text-primary hover:underline">{{ getBilingualValue(item, 'name', item.id) }}</NuxtLink>
        <span v-else class="block truncate font-semibold text-highlighted">{{ getBilingualValue(item, 'name', item.id) }}</span>
        <span class="block truncate text-xs text-muted">{{ getBilingualValue(item, 'group_name', item.id) }}</span>
      </span>
      <UButton v-if="claimable" size="sm" :label="t('groups.claim')" :loading="busyId === item.id" @click="emit('claim', item)" />
      <UIcon v-else name="i-lucide-arrow-up-right" class="size-4 text-muted" />
    </li>
    <li v-if="items.length === 0" class="px-5 py-8 text-sm text-muted">
      {{ t(claimable ? 'home_dashboard.no_available' : 'home_dashboard.no_claimed') }}
    </li>
  </ul>
</template>
