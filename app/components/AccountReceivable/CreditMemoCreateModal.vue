<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- Manual creditMemo allocation and modal sessions have component coverage. */
import { computed, nextTick, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { Form } from '@nuxt/ui'
import type { AccountReceivableDetail } from '~~/shared/types/account-receivable'
import type { AdminCommonLookupResponseItem } from '~~/shared/types/admin-common-ui'
import { AccountReceivableCreditMemoCreateSchema } from '~~/shared/types/schemas/account-receivable'
import { moneyFromCents, moneyToCents, parseMoney } from '~~/shared/utils/money'
import { formatAccountReceivableAmount } from '~/utils/account-receivable-display'

const { receivable } = defineProps<{ receivable: AccountReceivableDetail }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ created: [id: string, agreementId: string] }>()
const { t, locale } = useI18n()
const { createValidator } = useZodI18n()
const { sendJson } = useJsonRequest()
const { showError } = useApiErrorToast()
type State = {
  egcs_fc_applicantrecipient: string
  egcs_fc_receiveddate: string | Date | null
  egcs_fc_amount: string
  egcs_fc_receiptreference: string
  egcs_fc_narrative_en: string
  egcs_fc_narrative_fr: string
  egcs_fc_allocations: Array<{ egcs_fc_receivableline: string, egcs_fc_amount: string }>
}
const state: Ref<State | null> = ref(null)
const form: Ref<Form<typeof AccountReceivableCreditMemoCreateSchema> | null> = ref(null)
const selectedLines: Ref<string[]> = ref([])
const resolvedLines: Ref<AdminCommonLookupResponseItem[]> = ref([])
const pending: Ref<boolean> = ref(false)
const allocationShortfall: Ref<string | null> = ref(null)
let session = 0
watch([open, () => receivable.id], ([isOpen]) => {
  session += 1
  pending.value = false
  allocationShortfall.value = null
  selectedLines.value = []
  resolvedLines.value = []
  state.value = isOpen
    ? {
        egcs_fc_applicantrecipient: receivable.egcs_fc_applicantrecipient,
        egcs_fc_receiveddate: new Date().toISOString().slice(0, 10),
        egcs_fc_amount: '', egcs_fc_receiptreference: '', egcs_fc_narrative_en: '', egcs_fc_narrative_fr: '', egcs_fc_allocations: []
      }
    : null
}, { immediate: true, flush: 'sync' })
watch(selectedLines, ids => {
  if (!state.value) return
  const old = state.value.egcs_fc_allocations
  state.value.egcs_fc_allocations = ids.map(id => old.find(line => line.egcs_fc_receivableline === id) ?? { egcs_fc_receivableline: id, egcs_fc_amount: '' })
}, { flush: 'sync' })
const lookupQuery = computed(() => ({ egcs_fc_applicantrecipient: receivable.egcs_fc_applicantrecipient, egcs_fc_currency: receivable.egcs_fc_currency, egcs_fc_receivable: receivable.id }))
const allocationLabel = (id: string, index: number) => {
  const item = resolvedLines.value.find(line => String(line.id) === id)
  if (!item) return t('account_receivable.allocation_line', { number: index + 1 })
  return String(locale.value === 'fr' ? item.label_fr : item.label_en)
}
const amount = (value: string) => formatAccountReceivableAmount(value, locale.value, receivable.egcs_fc_currency) ?? t('common.not_available')
const canPropose = computed(() => Boolean(state.value?.egcs_fc_amount && selectedLines.value.length
  && selectedLines.value.every(id => {
    const item = resolvedLines.value.find(line => String(line.id) === id)
    return typeof item?.egcs_fc_priority === 'number' && typeof item.egcs_fc_available === 'string'
  })))
const proposeAllocations = async () => {
  if (!state.value || !canPropose.value) return
  try {
    let remaining = moneyToCents(parseMoney(state.value.egcs_fc_amount))
    if (remaining <= BigInt(0)) return
    const ordered = resolvedLines.value.filter(item => selectedLines.value.includes(String(item.id)))
      .sort((left, right) => Number(left.egcs_fc_priority) - Number(right.egcs_fc_priority))
    const proposed: State['egcs_fc_allocations'] = []
    for (const item of ordered) {
      const available = moneyToCents(parseMoney(String(item.egcs_fc_available)))
      const allocated = remaining < available ? remaining : available
      if (allocated <= BigInt(0)) continue
      proposed.push({ egcs_fc_receivableline: String(item.id), egcs_fc_amount: moneyFromCents(allocated) })
      remaining -= allocated
    }
    state.value.egcs_fc_allocations = proposed
    selectedLines.value = proposed.map(line => line.egcs_fc_receivableline)
    allocationShortfall.value = remaining > BigInt(0) ? moneyFromCents(remaining) : null
    await nextTick()
    await form.value?.validate({ name: ['egcs_fc_amount', 'egcs_fc_allocations'], silent: true })
    form.value?.clear(/^egcs_fc_allocations\.\d+\.egcs_fc_amount$/)
  } catch {
    // Keep invalid received money visible for the schema-backed submit validator.
  }
}
watch(() => state.value?.egcs_fc_amount, () => {
  allocationShortfall.value = null
})
const save = async () => {
  if (!state.value || pending.value) return
  const currentSession = session
  pending.value = true
  try {
    const result = await sendJson<{ id: string, egcs_fc_fundingagreement: string }>('/api/account-receivable-credit-memos', 'POST', AccountReceivableCreditMemoCreateSchema.parse(state.value))
    if (currentSession !== session) return
    open.value = false
    emit('created', result.id, result.egcs_fc_fundingagreement)
  } catch (failure) {
    if (currentSession === session) showError(failure)
  } finally {
    if (currentSession === session) pending.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="t('account_receivable.record_credit_memo')" :description="t('account_receivable.credit_memo_description')" :ui="{ content: 'sm:max-w-4xl' }">
    <template #body>
      <UForm v-if="state" ref="form" :state="state" :validate="createValidator(AccountReceivableCreditMemoCreateSchema)" class="space-y-4" @submit="save">
        <dl class="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt class="text-muted">
              {{ t('account_receivable.debtor') }}
            </dt><dd>{{ locale === 'fr' ? receivable.egcs_fc_debtorname_fr : receivable.egcs_fc_debtorname_en }}</dd>
          </div><div>
            <dt class="text-muted">
              {{ t('common.currency') }}
            </dt><dd>{{ receivable.egcs_fc_currency.toUpperCase() }}</dd>
          </div><div>
            <dt class="text-muted">
              {{ t('account_receivable.available') }}
            </dt><dd>{{ amount(receivable.egcs_fc_available) }}</dd>
          </div>
        </dl>
        <div class="grid gap-4 md:grid-cols-2">
          <UFormField name="egcs_fc_receiveddate" :label="t('account_receivable.received_date')">
            <CommonDatePicker v-model="state.egcs_fc_receiveddate" :disabled="pending" />
          </UFormField>
          <UFormField name="egcs_fc_amount" :label="t('account_receivable.received_amount')">
            <UInput v-model="state.egcs_fc_amount" type="text" inputmode="decimal" :disabled="pending" class="w-full" />
          </UFormField>
        </div>
        <UFormField name="egcs_fc_receiptreference" :label="t('account_receivable.receipt_reference')">
          <UInput v-model="state.egcs_fc_receiptreference" :disabled="pending" class="w-full" />
        </UFormField>
        <UFormField name="egcs_fc_allocations" :label="t('account_receivable.allocation_sources')" :description="t('account_receivable.allocation_instruction')">
          <CommonServerLookupSelect v-model:values="selectedLines" :fetch-url="'/api/account-receivable-credit-memos/lookups/receivable-lines'" :query="lookupQuery" value-key="id" label-en-key="label_en" label-fr-key="label_fr" :show-value-in-label="false" :disabled="pending" multiple close-on-select @resolved-items="resolvedLines = $event" />
        </UFormField>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-sm text-muted">
            {{ t('account_receivable.proposal_instruction') }}
          </p>
          <UButton type="button" icon="i-lucide-list-ordered" color="neutral" variant="outline" :label="t('account_receivable.propose_allocations')" :disabled="pending || !canPropose" @click="proposeAllocations" />
        </div>
        <UAlert v-if="allocationShortfall" color="warning" :title="t('account_receivable.allocation_shortfall', { amount: amount(allocationShortfall) })" />
        <UFormField v-for="(allocation, index) in state.egcs_fc_allocations" :key="allocation.egcs_fc_receivableline" :name="`egcs_fc_allocations.${index}.egcs_fc_amount`" :label="allocationLabel(allocation.egcs_fc_receivableline, index)">
          <UInput v-model="allocation.egcs_fc_amount" type="text" inputmode="decimal" :disabled="pending" class="w-full" />
        </UFormField>
        <div class="grid gap-4 md:grid-cols-2">
          <UFormField name="egcs_fc_narrative_en" :label="t('account_receivable.narrative_en')">
            <UTextarea v-model="state.egcs_fc_narrative_en" :disabled="pending" class="w-full" />
          </UFormField><UFormField name="egcs_fc_narrative_fr" :label="t('account_receivable.narrative_fr')">
            <UTextarea v-model="state.egcs_fc_narrative_fr" :disabled="pending" class="w-full" />
          </UFormField>
        </div>
        <p class="text-sm text-muted">
          {{ t('account_receivable.credit_memo_evidence_instruction') }}
        </p>
        <div class="flex justify-end gap-2">
          <UButton type="button" color="neutral" variant="ghost" :label="t('common.cancel')" :disabled="pending" @click="open = false" /><CommonSaveButton :label="t('account_receivable.record_credit_memo')" :loading="pending" :disabled="pending" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
