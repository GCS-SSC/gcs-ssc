<script setup lang="ts">
import type { AssignedWorkItem } from '~~/shared/types/assigned-work'
import { buildAssignedWorkRoute } from '~~/shared/utils/entity-assignments'

type WorkItem = AssignedWorkItem

const { items, compact = false, emptyMessage } = defineProps<{ items: WorkItem[], compact?: boolean, emptyMessage?: string }>()
const { t } = useI18n()
const localePath = useLocalePath()
const { getBilingualValue } = useBilingualValue()
const itemUrl = (item: WorkItem) => localePath(buildAssignedWorkRoute(item.entity_type, item.entity_id, item.agreement_id, item.variant))
const monthKeys = ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar'] as const
/**
 * Builds the main line with its owning business identity.
 * @param item Assigned work item.
 * @returns Main line.
 */
const itemTitle = (item: WorkItem): string => {
  const identifier = item.entity_type === 'applicantrecipient' || item.entity_type === 'fundingcaseagreement'
    ? getBilingualValue(item, 'identifier', item.entity_id)
    : `#${item.entity_id}`
  if (item.entity_type === 'applicantrecipient' || item.entity_type === 'fundingcaseagreement') return identifier
  const parent = getBilingualValue(item, 'parent', '')
  return parent ? `${identifier} (${parent})` : identifier
}
/**
 * Builds a localized, entity-specific work description.
 * @param item Assigned work item.
 * @returns Description line.
 */
const itemDescription = (item: WorkItem): string => {
  if (item.entity_type === 'applicantrecipient' || item.entity_type === 'fundingcaseagreement') {
    const secondary = getBilingualValue(item, 'secondary', '')
    return secondary === getBilingualValue(item, 'identifier', item.entity_id) ? '' : secondary
  }
  const name = getBilingualValue(item, 'detail_name', '').trim()
  const withName = (key: string): string => name ? `${t(key)} - ${name}` : t(key)
  let period = ''
  if (item.period_start !== null && item.period_end !== null
    && monthKeys[item.period_start] && monthKeys[item.period_end]) {
    period = `${t(`agreement.claims.months.${monthKeys[item.period_start]}`)}–${t(`agreement.claims.months.${monthKeys[item.period_end]}`)}`
  }
  switch (item.entity_type) {
    case 'commonreview': return withName(item.variant === 'checklist' ? 'enums.review_type.checklist' : 'enums.review_type.assessment')
    case 'commonrecommendation': return withName('home_dashboard.work_labels.recommendation')
    case 'fundingcaseagreementclaim': return [t('home_dashboard.work_labels.claim'), item.fiscal_year, period].filter(Boolean).join(' - ')
    case 'fundingclaimreconcile': return item.claim_id
      ? `${t('home_dashboard.work_labels.reconciliation')} - ${t('home_dashboard.work_labels.claim')} #${item.claim_id}`
      : t('home_dashboard.work_labels.reconciliation')
    case 'fundingcasepayment': return [item.payment_type === 'advance' || item.payment_type === 'reimbursement'
      ? t(`enums.payment_type.${item.payment_type}`)
      : t('assignments.entity_types.fundingcasepayment'), item.fiscal_year, period].filter(Boolean).join(' - ')
    case 'fundingcaseforecast': return [t('home_dashboard.work_labels.forecast'), item.fiscal_year].filter(Boolean).join(' - ')
    case 'fundingcasemonitor': return withName('home_dashboard.work_labels.monitor')
    case 'fundingcaseagreementcommitment': return withName('home_dashboard.work_labels.commitment')
    case 'fundingcaseamendment': return [item.detail_number === null
      ? t('home_dashboard.work_labels.amendment')
      : t('home_dashboard.work_labels.amendment_number', { number: item.detail_number }), name].filter(Boolean).join(' - ')
    case 'fundingcaseagreementcloseout': return t('home_dashboard.work_labels.closeout')
    default: return t(`assignments.entity_types.${item.entity_type}`)
  }
}
</script>

<template>
  <ul class="divide-y divide-default">
    <li v-for="item in items" :key="`${item.entity_type}:${item.entity_id}`">
      <NuxtLink :to="itemUrl(item)" class="group flex items-center gap-4 py-4 transition-colors hover:bg-elevated/50" :class="compact ? 'px-2' : 'px-3 sm:px-5'">
        <span class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <UIcon :name="item.entity_type === 'fundingcaseagreement' ? 'i-lucide-handshake' : item.entity_type === 'applicantrecipient' ? 'i-lucide-building-2' : 'i-lucide-file-check-2'" class="size-5" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block break-words font-semibold text-highlighted group-hover:text-primary">{{ itemTitle(item) }}</span>
          <span v-if="itemDescription(item)" class="block break-words text-xs text-muted">{{ itemDescription(item) }}</span>
        </span>
        <CommonAssignedWorkStatusBadge :entity-type="item.entity_type" :status="item.status" :is-completed="item.isCompleted" />
        <UIcon name="i-lucide-arrow-up-right" class="size-4 shrink-0 text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
      </NuxtLink>
    </li>
    <li v-if="items.length === 0" class="px-5 py-8 text-sm text-muted">
      {{ emptyMessage ?? t('home.no_assigned_work') }}
    </li>
  </ul>
</template>
