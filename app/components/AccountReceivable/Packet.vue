<script setup lang="ts">
import { computed } from 'vue'
import type { JsonValue } from '~~/shared/types/database'
import type { AccountReceivableLine } from '~~/shared/types/account-receivable'
import { formatAccountReceivableCreditMemoSettlementReference } from '~~/shared/utils/account-receivable'
import { accountReceivableReference, formatAccountReceivableAmount } from '~/utils/account-receivable-display'
import { useBilingualValue } from '~/composables/useBilingualValue'

const { submission, creditMemo = false } = defineProps<{ submission: { egcs_fc_submittedat: string, egcs_fc_canonicalhash: string, egcs_fc_packet: JsonValue }, creditMemo?: boolean }>()
const { t, locale } = useI18n()
const { getBilingualValue } = useBilingualValue()
const { formatDate } = useDateHelpers()
type RecordValue = Record<string, JsonValue>
const record = (value: JsonValue | undefined): RecordValue => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}
const records = (value: JsonValue | undefined): RecordValue[] => Array.isArray(value) ? value.map(record) : []
const packet = computed(() => record(submission.egcs_fc_packet))
const header = computed(() => record(creditMemo ? packet.value.accountReceivableCreditMemo : packet.value.accountReceivable))
const standaloneCredit = computed(() => creditMemo && (packet.value.schemaVersion === 2 || header.value.egcs_fc_ledgerkind === 'pool'))
const text = (value: JsonValue | undefined) => typeof value === 'string' || typeof value === 'number' ? String(value) : t('common.none')
const currency = computed(() => text(header.value.egcs_fc_currency))
const amount = (value: JsonValue | undefined) => formatAccountReceivableAmount(typeof value === 'string' ? value : undefined, locale.value, currency.value) ?? t('common.not_available')
const reference = computed(() => {
  if (standaloneCredit.value && typeof header.value.id === 'string') return `CM-${header.value.id}`
  if (typeof header.value.egcs_fc_agreementnumber !== 'string' || typeof header.value.egcs_fc_number !== 'number') return t('common.not_available')
  return creditMemo
    ? typeof packet.value.recoveryId === 'string' ? formatAccountReceivableCreditMemoSettlementReference(packet.value.recoveryId) : t('account_receivable.credit_memo_reference', { agreement: header.value.egcs_fc_agreementnumber, number: header.value.egcs_fc_number })
    : accountReceivableReference({ egcs_fc_agreementnumber: header.value.egcs_fc_agreementnumber, egcs_fc_number: header.value.egcs_fc_number })
})
const coding = computed(() => records(packet.value.coding))
const lines = computed(() => records(packet.value.lines).map(line => ({ ...line,
  egcs_fc_coding: coding.value.filter(item => item.egcs_fc_receivableline === line.id)
})) as unknown as AccountReceivableLine[])
const creditMemoLines = computed(() => records(packet.value.lines))
const allocations = computed(() => records(packet.value.allocations))
const attachments = computed(() => records(packet.value.attachments))
const balanceFields = [
  { key: 'egcs_fc_receivablerecovered', label: 'account_receivable.memo_ar_collected' },
  { key: 'egcs_fc_receivablereserved', label: 'account_receivable.memo_ar_pending' },
  { key: 'egcs_fc_receivableoutstanding', label: 'account_receivable.memo_ar_outstanding' },
  { key: 'egcs_fc_receivableavailable', label: 'account_receivable.memo_ar_available' }
] as const
const labels = computed(() => [
  ...(standaloneCredit.value
    ? [{ label: 'account_receivable.credit_memo_agency', value: getBilingualValue(header.value, 'egcs_fc_agencyname', t('common.none')) }]
    : [{ label: 'account_receivable.agreement', value: header.value.egcs_fc_agreementnumber }]),
  { label: standaloneCredit.value ? 'account_receivable.proponent' : 'account_receivable.debtor', value: getBilingualValue(header.value, 'egcs_fc_debtorname', t('common.none')) },
  { label: 'common.currency', value: currency.value.toUpperCase() },
  ...(creditMemo
    ? [
        { label: 'account_receivable.credit_memo_receivable', value: header.value.egcs_fc_receivablereference },
        { label: 'account_receivable.received_date', value: typeof header.value.egcs_fc_receiveddate === 'string' ? formatDate(header.value.egcs_fc_receiveddate) : null },
        ...(typeof header.value.egcs_fc_receiptreference === 'string' ? [{ label: 'account_receivable.receipt_reference', value: header.value.egcs_fc_receiptreference }] : [])
      ]
    : [
        { label: 'agreement.payments.fiscal_year', value: header.value.egcs_fc_fiscalyeardisplay },
        { label: 'account_receivable.type', value: locale.value === 'fr' ? header.value.egcs_fc_typename_fr : header.value.egcs_fc_typename_en },
        { label: 'account_receivable.recovery_method', value: header.value.egcs_fc_recoverymethod ? t(`enums.account_receivable_recovery_method.${text(header.value.egcs_fc_recoverymethod)}`) : t('common.none') }
      ])
])
</script>

<template>
  <CommonWorkflowPacket :title="t(creditMemo ? 'account_receivable.credit_memo_packet' : 'account_receivable.packet_title')" :packet-id="`account-receivable-${text(header.id)}-${submission.egcs_fc_canonicalhash}`" :captured-label="t('workflow.packet.submitted_at', { date: formatDate(submission.egcs_fc_submittedat) })" :hash="submission.egcs_fc_canonicalhash" :hash-label="t('workflow.packet.hash')">
    <template #summary>
      <p class="font-semibold">
        {{ reference }}
      </p>
    </template>
    <CommonSection :title="t('account_receivable.captured_context')" :grid-cols="1">
      <dl class="grid gap-4 text-sm sm:grid-cols-2">
        <div v-for="field in labels" :key="field.label">
          <dt class="text-muted">
            {{ t(field.label) }}
          </dt><dd class="mt-1">
            {{ text(field.value) }}
          </dd>
        </div><div v-if="creditMemo">
          <dt class="text-muted">
            {{ t(standaloneCredit ? 'account_receivable.credit_memo_amount' : 'account_receivable.received_amount') }}
          </dt><dd class="mt-1 font-semibold">
            {{ amount(header.egcs_fc_amount) }}
          </dd>
        </div>
      </dl>
    </CommonSection>
    <CommonSection v-if="creditMemo && typeof header.egcs_fc_receivableoutstanding === 'string'" :title="t('account_receivable.credit_memo_receivable')" :grid-cols="1">
      <dl class="grid gap-4 text-sm sm:grid-cols-2">
        <div v-for="field in balanceFields" :key="field.key">
          <dt class="text-muted">
            {{ t(field.label) }}
          </dt>
          <dd class="mt-1 font-semibold tabular-nums">
            {{ amount(header[field.key]) }}
          </dd>
        </div>
      </dl>
      <p class="text-sm text-muted">
        {{ t('account_receivable.memo_ar_balance_description') }}
      </p>
    </CommonSection>
    <CommonSection v-if="!creditMemo" :title="t('account_receivable.financial_lines')" :grid-cols="1">
      <AccountReceivableSourceLines :lines="lines" :currency="currency">
        <template #amount="{ line }">
          <p class="text-sm font-semibold">
            {{ t('account_receivable.established_amount') }}: {{ amount(line.egcs_fc_amount) }}
          </p>
        </template>
      </AccountReceivableSourceLines><p class="text-sm text-muted">
        {{ t('account_receivable.basis_provenance') }}
      </p>
    </CommonSection>
    <CommonSection v-else-if="!standaloneCredit" :title="t('account_receivable.historical_credit_memo_allocations')" :grid-cols="1">
      <p class="text-sm text-muted">
        {{ t('account_receivable.historical_credit_memo_allocations_description') }}
      </p>
      <dl v-for="allocation in allocations" :key="text(allocation.egcs_fc_receivableline)" class="grid gap-3 border-t border-default pt-3 text-sm sm:grid-cols-2">
        <div>
          <dt class="text-muted">
            {{ t('account_receivable.number') }}
          </dt><dd>{{ t('account_receivable.allocation_reference', { agreement: text(allocation.egcs_fc_agreementnumber), number: text(allocation.egcs_fc_number) }) }}</dd>
        </div><div>
          <dt class="text-muted">
            {{ t('account_receivable.recovery_amount') }}
          </dt><dd class="font-semibold">
            {{ amount(allocation.egcs_fc_amount) }}
          </dd>
        </div>
      </dl>
    </CommonSection>
    <CommonSection v-if="creditMemo && creditMemoLines.length" :title="t('account_receivable.credit_memo_lines')" :grid-cols="1">
      <div v-for="line in creditMemoLines" :key="text(line.id)" class="border-b border-default py-3 last:border-0">
        <dl class="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt class="text-muted">
              {{ t('account_receivable.number') }}
            </dt>
            <dd>{{ text(line.egcs_fc_linenumber) }}</dd>
          </div>
          <div>
            <dt class="text-muted">
              {{ t('account_receivable.credit_memo_amount') }}
            </dt>
            <dd class="font-semibold tabular-nums">
              {{ amount(line.egcs_fc_amount) }}
            </dd>
          </div>
          <div v-for="dimension in records(line.egcs_fc_creditmemoaccountingdimensions)" :key="text(dimension.label_en)">
            <dt class="text-muted">
              {{ getBilingualValue(dimension, 'label', t('common.none')) }}
            </dt>
            <dd>{{ text(dimension.value) }}</dd>
          </div>
        </dl>
      </div>
    </CommonSection>
    <CommonSection v-if="creditMemo && header.egcs_fc_creditmemoaccountingdimensions" :title="t('account_receivable.credit_memo_coding')" :grid-cols="1">
      <dl class="flex flex-wrap gap-4 text-sm">
        <div v-for="dimension in records(header.egcs_fc_creditmemoaccountingdimensions)" :key="text(dimension.label_en)">
          <dt class="text-muted">
            {{ getBilingualValue(dimension, 'label', t('common.none')) }}
          </dt>
          <dd>{{ text(dimension.value) }}</dd>
        </div>
      </dl>
    </CommonSection>
    <CommonSection v-if="creditMemo && typeof header.egcs_fc_reason === 'string'" :title="t('account_receivable.reason')" :grid-cols="1">
      <p class="whitespace-pre-wrap text-sm">
        {{ text(header.egcs_fc_reason) }}
      </p>
    </CommonSection>
    <CommonSection v-else :title="t('account_receivable.rationale')" :grid-cols="2">
      <div>
        <h4 class="mb-2 text-sm font-semibold">
          {{ t('account_receivable.narrative_en') }}
        </h4><p class="whitespace-pre-wrap text-sm">
          {{ text(header.egcs_fc_narrative_en) }}
        </p>
      </div><div>
        <h4 class="mb-2 text-sm font-semibold">
          {{ t('account_receivable.narrative_fr') }}
        </h4><p class="whitespace-pre-wrap text-sm">
          {{ text(header.egcs_fc_narrative_fr) }}
        </p>
      </div>
    </CommonSection>
    <CommonSection v-if="!creditMemo && header.egcs_fc_recipientpreference" :title="t('account_receivable.recipient_preference')" :grid-cols="1">
      <p class="text-sm">
        {{ t(`enums.account_receivable_recovery_method.${text(header.egcs_fc_recipientpreference)}`) }}
      </p><p v-if="header.egcs_fc_preferenceoverride_en" class="whitespace-pre-wrap text-sm">
        {{ text(header.egcs_fc_preferenceoverride_en) }}
      </p><p v-if="header.egcs_fc_preferenceoverride_fr" class="whitespace-pre-wrap text-sm">
        {{ text(header.egcs_fc_preferenceoverride_fr) }}
      </p>
    </CommonSection>
    <CommonSection :title="t('attachments.title')" :grid-cols="1">
      <ul v-if="attachments.length" class="space-y-2 text-sm">
        <li v-for="attachment in attachments" :key="text(attachment.id)">
          {{ text(locale === 'fr' ? attachment.egcs_cn_name_fr : attachment.egcs_cn_name_en) }} · {{ text(attachment.egcs_cn_filename) }}
        </li>
      </ul><p v-else class="text-sm text-muted">
        {{ t('common.none') }}
      </p>
    </CommonSection>
  </CommonWorkflowPacket>
</template>
