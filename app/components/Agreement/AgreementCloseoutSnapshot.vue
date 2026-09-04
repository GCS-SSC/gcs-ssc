<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- local immutable-packet presentation helpers are self-documenting. */
import { computed } from 'vue'
import type { Selectable } from 'kysely'
import type { AgreementCloseoutReadiness, CloseoutBlocker } from '~~/shared/types/agreement-closeout'
import type { FundingCaseAgreementCloseoutSnapshotTable } from '~~/shared/types/database'

const { snapshot } = defineProps<{
  snapshot: Selectable<FundingCaseAgreementCloseoutSnapshotTable>
}>()
const { t, locale } = useI18n()
const statusCatalog = useStatusCatalog()
void statusCatalog.load()
const { formatDate } = useDateHelpers({ formatterOptions: { dateStyle: 'medium', timeStyle: 'short' } })
const packet = computed(() => snapshot.egcs_fc_packet as unknown as AgreementCloseoutReadiness)
const blockerStatusLabel = (blocker: CloseoutBlocker): string => {
  if (blocker.category === 'workflow') return t(`enums.runtime_state.${blocker.status}`)
  const definition = statusCatalog.getById(blocker.status)
  return definition ? (locale.value === 'fr' ? definition.nameFr : definition.nameEn) : t('common.unknown')
}
const blockerLabel = (blocker: CloseoutBlocker): string =>
  locale.value === 'fr' ? blocker.labelFr : blocker.labelEn
</script>

<template>
  <CommonWorkflowPacket
    :title="t('agreement.closeout.snapshot_captured', { date: formatDate(snapshot.egcs_fc_capturedat) })"
    :packet-id="String(snapshot.id)"
    icon="i-lucide-shield-check"
    :hash-label="t('agreement.closeout.snapshot_hash')"
    :hash="snapshot.egcs_fc_canonicalhash">
    <template #summary>
      <div class="flex flex-wrap items-center gap-2">
        <CommonStatusBadge :status-id="packet.agreementStatus" />
        <CommonStatusBadge :variant="packet.ready ? 'successful' : 'unsuccessful'" />
      </div>
    </template>

    <CommonSection :title="t('agreement.closeout.financial_situation')" badge="01" :grid-cols="1">
      <AgreementCloseoutFinancialTable :rows="packet.financial.rows" :totals="packet.financial.totals" />
    </CommonSection>

    <CommonSection :title="t('agreement.closeout.outstanding_followups')" badge="02" :grid-cols="1">
      <div v-if="packet.outstandingFollowups.length" class="divide-y divide-default overflow-hidden rounded-lg border border-default text-sm">
        <div v-for="item in packet.outstandingFollowups" :key="item.id" class="px-4 py-3">
          <p class="font-medium text-highlighted">
            {{ item.name }}
          </p>
          <p class="text-sm text-muted">
            {{ t(`enums.monitor_responsible_party.${item.responsibleParty}`) }} ·
            {{ t(`enums.follow_up_status.${item.status}`) }} · {{ formatDate(item.dueDate) }}
          </p>
        </div>
      </div>
      <p v-else class="rounded-lg border border-default px-4 py-5 text-sm text-muted">
        {{ t('agreement.closeout.no_outstanding_followups') }}
      </p>
    </CommonSection>

    <CommonSection :title="t('agreement.closeout.child_readiness')" badge="03" :grid-cols="1">
      <div v-if="packet.blockers.length" class="divide-y divide-default overflow-hidden rounded-lg border border-default text-sm">
        <div v-for="blocker in packet.blockers" :key="`${blocker.entityType}-${blocker.entityId}-${blocker.reason}`" class="px-4 py-3">
          <p class="font-medium text-highlighted">
            {{ blockerLabel(blocker) }}
          </p>
          <p class="text-sm text-muted">
            {{ t(`assignments.entity_types.${blocker.entityType}`) }} · {{ blockerStatusLabel(blocker) }} ·
            {{ t(`agreement.closeout.blocker_reasons.${blocker.reason}`) }}
          </p>
        </div>
      </div>
      <p v-else class="rounded-lg border border-default px-4 py-5 text-sm text-muted">
        {{ t('agreement.closeout.all_children_terminal') }}
      </p>
    </CommonSection>
  </CommonWorkflowPacket>
</template>
