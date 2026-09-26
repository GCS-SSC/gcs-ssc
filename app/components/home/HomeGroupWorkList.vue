<script setup lang="ts">
import { ASSIGNABLE_ENTITY_TYPE_ENUM } from '~~/shared/constants/enums'
import { buildAssignedWorkRoute } from '~~/shared/utils/entity-assignments'
import type { AssignableEntityType } from '~~/shared/types/schemas'
import type { GroupWorkItem } from '~~/shared/types/assigned-work'
import { appRouteLocations } from '~/utils/route-locations'

type GroupItem = GroupWorkItem
const { items, claimable = false, busyId = null } = defineProps<{ items: GroupItem[], claimable?: boolean, busyId?: string | null }>()
const emit = defineEmits<{ claim: [item: GroupItem] }>()
const { t } = useI18n()
const localePath = useLocalePath()
const { getBilingualValue } = useBilingualValue()
/**
 * Builds the group item's main line with its owning business identity.
 * @param item Group work item.
 * @returns Main line.
 */
const itemTitle = (item: GroupItem): string => {
  if (item.kind === 'intake') return `${t('funding_case_intake.application_id')} ${item.name_en}`
  const parent = getBilingualValue(item, 'parent', '')
  const id = item.kind === 'additional_reviewer' ? item.entity_id : item.id
  return parent ? `#${id} (${parent})` : `#${id}`
}
/**
 * Builds the group item's localized work description.
 * @param item Group work item.
 * @returns Description line.
 */
const itemDescription = (item: GroupItem): string => {
  let kind = t(`enums.review_type.${item.variant === 'checklist' ? 'checklist' : 'assessment'}`)
  if (item.kind === 'approval') kind = t('home_dashboard.work_labels.approval')
  if (item.kind === 'intake') return t('funding_case_intake.title')
  const name = getBilingualValue(item, 'detail_name', '').trim()
  return name ? `${kind} - ${name}` : kind
}
/**
 * Builds the route for a group work item when one is available.
 * @param item - Group work item.
 * @returns Localized route or null.
 */
const itemUrl = (item: GroupItem): string | null => {
  if (item.entity_type === 'commonreview') return localePath(item.variant === 'checklist' ? appRouteLocations.checklistDetail(item.entity_id) : appRouteLocations.assessmentDetail(item.entity_id))
  if (item.entity_type === 'fundingcaseintake') return localePath(appRouteLocations.fundingCaseIntakeDetail(item.entity_id))
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
        <NuxtLink v-if="itemUrl(item)" :to="itemUrl(item)!" class="block break-words font-semibold text-highlighted hover:text-primary hover:underline">{{ itemTitle(item) }}</NuxtLink>
        <span v-else class="block break-words font-semibold text-highlighted">{{ itemTitle(item) }}</span>
        <span class="block break-words text-xs text-muted">{{ itemDescription(item) }}</span>
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
