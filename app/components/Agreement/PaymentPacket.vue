<script setup lang="ts">
import { computed } from 'vue'
import type { JsonValue } from '~~/shared/types/database'
import type { AccountReceivablePaymentCreditMemo } from '~~/shared/types/account-receivable'
import { parseMoney } from '~~/shared/utils/money'
import { hasPaymentOffset } from '~/utils/payment-offset-display'
import { useBilingualValue } from '~/composables/useBilingualValue'

const { submission } = defineProps<{ submission: { egcs_fc_submittedat: string, egcs_fc_canonicalhash: string, egcs_fc_packet: JsonValue } }>()
const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()
const { formatDate } = useDateHelpers()
type PacketRecord = Record<string, JsonValue>
const asRecord = (value: JsonValue | undefined): PacketRecord => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as PacketRecord : {}
const packet = computed(() => asRecord(submission.egcs_fc_packet))
const header = computed(() => asRecord(packet.value.payment))
const text = (value: JsonValue | undefined) => typeof value === 'string' || typeof value === 'number' ? String(value) : t('common.none')
const payment = computed(() => ({
  egcs_fc_creditmemoreference: typeof packet.value.egcs_fc_creditmemoreference === 'string' ? packet.value.egcs_fc_creditmemoreference : null,
  egcs_fc_paymentamount: text(packet.value.egcs_fc_grossamount),
  egcs_fc_grossamount: text(packet.value.egcs_fc_grossamount),
  egcs_fc_offsetamount: text(packet.value.egcs_fc_offsetamount),
  egcs_fc_netamount: text(packet.value.egcs_fc_netamount),
  egcs_fc_currency: text(header.value.egcs_fc_currency),
  egcs_fc_recoverycontrol: packet.value.egcs_fc_recoverycontrol as 'allowed' | 'direct_repayment_hold' | 'recovery_pending',
  egcs_fc_creditmemos: Array.isArray(packet.value.egcs_fc_creditmemos)
    ? packet.value.egcs_fc_creditmemos.map(value => {
        const memo = asRecord(value)
        return {
          id: text(memo.id),
          egcs_fc_offsetmemo: text(memo.egcs_fc_offsetmemo),
          egcs_fc_creditmemoreference: text(memo.egcs_fc_creditmemoreference),
          egcs_fc_amount: parseMoney(text(memo.egcs_fc_amount)),
          egcs_fc_effectiveamount: parseMoney(text(memo.egcs_fc_effectiveamount)),
          egcs_fc_appliedamount: parseMoney(text(memo.egcs_fc_appliedamount)),
          egcs_fc_remainingamount: parseMoney(text(memo.egcs_fc_remainingamount)),
          egcs_fc_availableamount: parseMoney(text(memo.egcs_fc_availableamount)),
          egcs_fc_outcome: memo.egcs_fc_outcome as AccountReceivablePaymentCreditMemo['egcs_fc_outcome']
        }
      })
    : [],
  egcs_fc_offsets: Array.isArray(packet.value.egcs_fc_offsets)
    ? packet.value.egcs_fc_offsets.map(value => {
        const allocation = asRecord(value)
        return { egcs_fc_number: text(allocation.egcs_fc_number), egcs_fc_amount: text(allocation.egcs_fc_amount) }
      })
    : []
}))
const totals = computed(() => [
  { key: 'gross', amount: packet.value.egcs_fc_grossamount },
  ...(hasPaymentOffset(packet.value.egcs_fc_offsetamount)
    ? [{ key: 'offset', amount: packet.value.egcs_fc_offsetamount }]
    : []),
  { key: 'net', amount: packet.value.egcs_fc_netamount }
])
const hasCurrency = computed(() => typeof header.value.egcs_fc_currency === 'string')
</script>

<template>
  <CommonWorkflowPacket :title="t('agreement.payments.packet_title')" :packet-id="`payment-${submission.egcs_fc_canonicalhash}`" :captured-label="t('workflow.packet.submitted_at', { date: formatDate(submission.egcs_fc_submittedat) })" :hash="submission.egcs_fc_canonicalhash" :hash-label="t('workflow.packet.hash')">
    <template #summary>
      <p class="font-semibold">
        {{ text(header.egcs_fc_agreementnumber) }}
      </p>
      <p class="text-sm text-muted">
        {{ t('agreement.payments.payee') }}: {{ getBilingualValue(header, 'egcs_fc_payeename', t('common.none')) }}
      </p>
    </template>
    <AgreementPaymentRecoverySummary v-if="hasCurrency" :payment="payment" />
    <dl v-else class="grid gap-4 text-sm sm:grid-cols-3">
      <div v-for="field in totals" :key="field.key">
        <dt class="text-muted">
          {{ t(`agreement.payments.${field.key}`) }}
        </dt><dd class="font-semibold">
          {{ text(field.amount) }}
        </dd>
      </div>
    </dl>
  </CommonWorkflowPacket>
</template>
