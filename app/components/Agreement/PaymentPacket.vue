<script setup lang="ts">
import { computed } from 'vue'
import type { JsonValue } from '~~/shared/types/database'

const { submission } = defineProps<{ submission: { egcs_fc_submittedat: string, egcs_fc_canonicalhash: string, egcs_fc_packet: JsonValue } }>()
const { t, locale } = useI18n()
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
  egcs_fc_offsets: Array.isArray(packet.value.egcs_fc_offsets)
    ? packet.value.egcs_fc_offsets.map(value => {
        const allocation = asRecord(value)
        return { egcs_fc_number: text(allocation.egcs_fc_number), egcs_fc_amount: text(allocation.egcs_fc_amount) }
      })
    : []
}))
const hasCurrency = computed(() => typeof header.value.egcs_fc_currency === 'string')
</script>

<template>
  <CommonWorkflowPacket :title="t('agreement.payments.packet_title')" :packet-id="`payment-${submission.egcs_fc_canonicalhash}`" :captured-label="t('workflow.packet.submitted_at', { date: formatDate(submission.egcs_fc_submittedat) })" :hash="submission.egcs_fc_canonicalhash" :hash-label="t('workflow.packet.hash')">
    <template #summary>
      <p class="font-semibold">
        {{ text(header.egcs_fc_agreementnumber) }}
      </p>
      <p class="text-sm text-muted">
        {{ t('agreement.payments.payee') }}: {{ text(locale === 'fr' ? header.egcs_fc_payeename_fr : header.egcs_fc_payeename_en) }}
      </p>
    </template>
    <AgreementPaymentRecoverySummary v-if="hasCurrency" :payment="payment" />
    <dl v-else class="grid gap-4 text-sm sm:grid-cols-3">
      <div v-for="field in [{ key: 'gross', amount: packet.egcs_fc_grossamount }, { key: 'offset', amount: packet.egcs_fc_offsetamount }, { key: 'net', amount: packet.egcs_fc_netamount }]" :key="field.key">
        <dt class="text-muted">
          {{ t(`agreement.payments.${field.key}`) }}
        </dt><dd class="font-semibold">
          {{ text(field.amount) }}
        </dd>
      </div>
    </dl>
  </CommonWorkflowPacket>
</template>
