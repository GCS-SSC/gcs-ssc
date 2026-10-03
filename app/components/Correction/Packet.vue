<script setup lang="ts">
import { computed } from 'vue'
import type { JsonValue } from '~~/shared/types/database'
import type { TransferPaymentStreamChartOfAccountDimension } from '~~/shared/types/schemas/transfer-payment'
import { formatCorrectionReference } from '~~/shared/utils/correction'

const { submission } = defineProps<{ submission: {
  egcs_fc_submittedat: string
  egcs_fc_canonicalhash: string
  egcs_fc_packet: JsonValue
} }>()
const { t, locale } = useI18n()
const { formatDate } = useDateHelpers()
type PacketRecord = Record<string, JsonValue>
const asRecord = (value: JsonValue | undefined): PacketRecord => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as PacketRecord : {}
const asRecords = (value: JsonValue | undefined): PacketRecord[] => Array.isArray(value) ? value.map(asRecord) : []
const packet = computed(() => asRecord(submission.egcs_fc_packet))
const header = computed(() => asRecord(packet.value.correction))
const reference = computed(() => typeof header.value.egcs_fc_agreementnumber === 'string' && typeof header.value.egcs_fc_number === 'number'
  ? formatCorrectionReference({ egcs_fc_agreementnumber: header.value.egcs_fc_agreementnumber, egcs_fc_number: header.value.egcs_fc_number })
  : t('common.not_available'))
const lines = computed(() => asRecords(packet.value.lines))
const sources = computed(() => asRecords(packet.value.sources))
const attachments = computed(() => asRecords(packet.value.attachments))
const policy = computed(() => asRecord(packet.value.policy))
const text = (value: JsonValue | undefined) => typeof value === 'string' || typeof value === 'number' ? String(value) : t('common.none')
const money = (value: JsonValue | undefined) => typeof value === 'string' ? value : null
const dimensions = (value: JsonValue | undefined) => asRecords(value) as unknown as TransferPaymentStreamChartOfAccountDimension[]
const financialLines = computed(() => lines.value.map(line => ({
  id: text(line.id),
  egcs_fc_commitmentlinenumber: text(line.egcs_fc_commitmentlinenumber),
  egcs_fc_fiscalyeardisplay: text(line.egcs_fc_fiscalyeardisplay),
  egcs_fc_accountingdimensions: dimensions(line.egcs_fc_accountingdimensions),
  egcs_fc_originalpaid: money(line.egcs_fc_originalpaid),
  egcs_fc_jveffect: money(line.egcs_fc_jveffect),
  egcs_fc_priorcorrections: money(line.egcs_fc_priorcorrections),
  egcs_fc_arrecoveries: money(line.egcs_fc_arrecoveries) ?? '0.00',
  egcs_fc_adjustment: money(line.egcs_fc_adjustment),
  egcs_fc_commitmentamount: money(line.egcs_fc_commitmentamount),
  egcs_fc_correctedpaid: money(line.egcs_fc_correctedpaid),
  egcs_fc_remaining: money(line.egcs_fc_remaining)
})))
const sourcePayments = computed(() => sources.value.map(source => {
  const evidence = asRecord(source.egcs_fc_evidence)
  const sourceHeader = asRecord(evidence.header)
  return {
    id: text(source.id),
    egcs_fc_payment: text(source.egcs_fc_payment),
    egcs_fc_evidence: {
      header: {
        egcs_fc_fiscalyeardisplay: text(sourceHeader.egcs_fc_fiscalyeardisplay),
        egcs_fc_currency: text(sourceHeader.egcs_fc_currency)
      },
      allocations: asRecords(evidence.allocations).map(allocation => ({
        egcs_fc_commitmentlinenumber: text(allocation.egcs_fc_commitmentlinenumber),
        egcs_fc_accountingdimensions: dimensions(allocation.egcs_fc_accountingdimensions),
        egcs_fc_amount: money(allocation.egcs_fc_amount)
      }))
    }
  }
}))
const attachmentName = (attachment: PacketRecord) => text(locale.value === 'fr' ? attachment.egcs_cn_name_fr : attachment.egcs_cn_name_en)
</script>

<template>
  <CommonWorkflowPacket :title="t('correction.packet.title')" :packet-id="`correction-${text(header.id)}-${submission.egcs_fc_canonicalhash}`" :captured-label="`${t('correction.packet.captured')}: ${formatDate(submission.egcs_fc_submittedat)}`" :hash="submission.egcs_fc_canonicalhash" :hash-label="t('workflow.packet.hash')">
    <template #summary>
      <p class="font-semibold">
        {{ reference }}
      </p>
      <p class="text-sm text-muted">
        {{ t('correction.creator_approval_policy') }}: {{ t(policy.creatorApprovalAllowed === true ? 'common.yes' : 'common.no') }}
      </p>
    </template>
    <CommonSection :title="t('correction.financial_lines')" :grid-cols="1">
      <CorrectionFinancialLine
        v-for="line in financialLines"
        :key="line.id"
        :line="line"
        :currency="text(header.egcs_fc_currency)"
        :corrected-paid="line.egcs_fc_correctedpaid"
        :remaining="line.egcs_fc_remaining" />
      <p class="text-sm text-muted">
        {{ t('correction.basis_provenance') }}
      </p>
    </CommonSection>
    <CommonSection :title="t('correction.rationale')" :grid-cols="2">
      <div>
        <h4 class="mb-2 text-sm font-semibold">
          {{ t('correction.narrative_en') }}
        </h4><p class="whitespace-pre-wrap text-sm">
          {{ text(header.egcs_fc_narrative_en) }}
        </p>
      </div>
      <div>
        <h4 class="mb-2 text-sm font-semibold">
          {{ t('correction.narrative_fr') }}
        </h4><p class="whitespace-pre-wrap text-sm">
          {{ text(header.egcs_fc_narrative_fr) }}
        </p>
      </div>
    </CommonSection>
    <CommonSection :title="t('correction.financial_basis')" :grid-cols="1">
      <p class="text-sm text-muted">
        {{ t('correction.financial_basis_description') }}
      </p>
      <CorrectionSourcePayments :sources="sourcePayments" />
    </CommonSection>
    <CommonSection :title="t('attachments.title')" :grid-cols="1">
      <ul v-if="attachments.length" class="space-y-2 text-sm">
        <li v-for="attachment in attachments" :key="text(attachment.id)">
          {{ attachmentName(attachment) }} · {{ text(attachment.egcs_cn_filename) }}
        </li>
      </ul>
      <p v-else class="text-sm text-muted">
        {{ t('common.none') }}
      </p>
    </CommonSection>
  </CommonWorkflowPacket>
</template>
