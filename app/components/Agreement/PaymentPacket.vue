<script setup lang="ts">
import { computed } from 'vue'
import type { JsonValue } from '~~/shared/types/database'
import type { AccountReceivablePaymentCreditMemo } from '~~/shared/types/account-receivable'
import { isCanonicalMoney, parseMoney, type Money } from '~~/shared/utils/money'
import { useBilingualValue } from '~/composables/useBilingualValue'

const { submission } = defineProps<{ submission: { egcs_fc_submittedat: string, egcs_fc_canonicalhash: string, egcs_fc_packet: JsonValue } }>()
const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()
const { formatDate } = useDateHelpers()
type PacketRecord = Record<string, JsonValue>
const asRecord = (value: JsonValue | undefined): PacketRecord => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as PacketRecord : {}
const packet = computed(() => asRecord(submission.egcs_fc_packet))
const supportedPacket = computed(() => packet.value.schemaVersion === 6)
const header = computed(() => asRecord(packet.value.payment))
const text = (value: JsonValue | undefined) => typeof value === 'string' || typeof value === 'number' ? String(value) : t('common.none')
/**
 * Validates captured minor-unit money against the retained Payment denomination.
 * @param value - Captured amount from the immutable packet.
 * @returns Currency-bearing exact money.
 */
const capturedMoney = (value: JsonValue | undefined): Money => {
  const amount = parseMoney(value)
  if (typeof header.value.egcs_fc_currency !== 'string' || amount.currency !== header.value.egcs_fc_currency.toUpperCase()) throw new TypeError('Captured payment money currency does not match its retained owner.')
  return amount
}
const payment = computed(() => {
  try {
    const captured = {
      egcs_fc_paymentamount: capturedMoney(packet.value.egcs_fc_grossamount),
      egcs_fc_grossamount: capturedMoney(packet.value.egcs_fc_grossamount),
      egcs_fc_offsetamount: capturedMoney(packet.value.egcs_fc_offsetamount),
      egcs_fc_netamount: capturedMoney(packet.value.egcs_fc_netamount),
      egcs_fc_currency: text(header.value.egcs_fc_currency),
      egcs_fc_recoverycontrol: packet.value.egcs_fc_recoverycontrol as 'allowed' | 'direct_repayment_hold' | 'recovery_pending',
      egcs_fc_creditmemos: Array.isArray(packet.value.egcs_fc_creditmemos)
        ? packet.value.egcs_fc_creditmemos.map(value => {
            const memo = asRecord(value)
            return {
              id: text(memo.id),
              egcs_fc_offsetmemo: text(memo.egcs_fc_offsetmemo),
              egcs_fc_creditmemoreference: text(memo.egcs_fc_creditmemoreference),
              egcs_fc_amount: capturedMoney(memo.egcs_fc_amount),
              egcs_fc_appliedamount: capturedMoney(memo.egcs_fc_appliedamount),
              ...([memo.egcs_fc_receivablereserved, memo.egcs_fc_receivablerecovered, memo.egcs_fc_receivableoutstanding, memo.egcs_fc_receivableavailable]
                .every(isCanonicalMoney)
                ? {
                    egcs_fc_receivablereserved: capturedMoney(memo.egcs_fc_receivablereserved),
                    egcs_fc_receivablerecovered: capturedMoney(memo.egcs_fc_receivablerecovered),
                    egcs_fc_receivableoutstanding: capturedMoney(memo.egcs_fc_receivableoutstanding),
                    egcs_fc_receivableavailable: capturedMoney(memo.egcs_fc_receivableavailable)
                  }
                : {}),
              egcs_fc_outcome: memo.egcs_fc_outcome as AccountReceivablePaymentCreditMemo['egcs_fc_outcome'],
              ...(Array.isArray(memo.egcs_fc_codinglines)
                ? {
                    egcs_fc_codinglines: memo.egcs_fc_codinglines.map(value => {
                      const line = asRecord(value)
                      return {
                        id: text(line.id),
                        egcs_fc_linenumber: line.egcs_fc_linenumber as number,
                        egcs_fc_transferpaymentstreamchartofaccount: text(line.egcs_fc_transferpaymentstreamchartofaccount),
                        egcs_fc_creditmemochartofaccount: text(line.egcs_fc_creditmemochartofaccount),
                        egcs_fc_creditmemoaccountingdimensions: line.egcs_fc_creditmemoaccountingdimensions ?? [],
                        egcs_fc_commitmentchartofaccount: typeof line.egcs_fc_commitmentchartofaccount === 'string' ? line.egcs_fc_commitmentchartofaccount : null,
                        egcs_fc_amount: capturedMoney(line.egcs_fc_amount)
                      }
                    })
                  }
                : {})
            }
          })
        : []
    }
    return captured
  } catch {
    return null
  }
})
const totalKeys = ['gross', 'offset', 'net']
</script>

<template>
  <CommonWorkflowPacket v-if="supportedPacket" :title="t('agreement.payments.packet_title')" :packet-id="`payment-${submission.egcs_fc_canonicalhash}`" :captured-label="t('workflow.packet.submitted_at', { date: formatDate(submission.egcs_fc_submittedat) })" :hash="submission.egcs_fc_canonicalhash" :hash-label="t('workflow.packet.hash')">
    <template #summary>
      <p class="font-semibold">
        {{ text(header.egcs_fc_agreementnumber) }}
      </p>
      <p class="text-sm text-muted">
        {{ t('agreement.payments.payee') }}: {{ getBilingualValue(header, 'egcs_fc_payeename', t('common.none')) }}
      </p>
    </template>
    <AgreementPaymentRecoverySummary v-if="payment" :payment="payment" />
    <dl v-else class="grid gap-4 text-sm sm:grid-cols-3">
      <div v-for="key in totalKeys" :key="key">
        <dt class="text-muted">
          {{ t(`agreement.payments.${key}`) }}
        </dt><dd class="font-semibold">
          {{ t('common.not_available') }}
        </dd>
      </div>
    </dl>
  </CommonWorkflowPacket>
  <p v-else class="text-sm text-muted">
    {{ t('common.not_available') }}
  </p>
</template>
