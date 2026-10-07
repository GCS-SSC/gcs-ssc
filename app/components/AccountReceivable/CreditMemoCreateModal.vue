<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- Independent credit authoring and modal sessions have focused component coverage. */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { Currency_Codes } from '~~/shared/types/database'
import type { CreditMemoCreateContext } from '~/utils/credit-memo-create-context'
import { useBilingualValue } from '~/composables/useBilingualValue'
import { AccountReceivableCreditMemoCreateSchema } from '~~/shared/types/schemas/account-receivable'

const { context } = defineProps<{ context: CreditMemoCreateContext }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ created: [id: string, proponentId: string] }>()
const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()
const { createValidator } = useZodI18n()
const { sendJson } = useJsonRequest()
const { showError } = useApiErrorToast()
type State = {
  egcs_fc_applicantrecipient: string
  egcs_fc_receivable: string | undefined
  egcs_fc_creditmemochartofaccount: string | undefined
  egcs_fc_agency: string | undefined
  egcs_fc_currency: Currency_Codes | undefined
  egcs_fc_receiveddate: string | Date | null
  egcs_fc_amount: string
  egcs_fc_receiptreference: string
  egcs_fc_narrative_en: string
  egcs_fc_narrative_fr: string
}
const state: Ref<State | null> = ref(null)
const pending: Ref<boolean> = ref(false)
const identity = computed(() => `${context.egcs_fc_applicantrecipient}:${context.egcs_fc_agency ?? ''}:${context.egcs_fc_currency ?? ''}:${context.egcs_fc_receivable ?? ''}`)
let session = 0
onBeforeUnmount(() => {
  session += 1
})
watch([open, identity], ([isOpen]) => {
  session += 1
  pending.value = false
  state.value = isOpen
    ? {
        egcs_fc_applicantrecipient: context.egcs_fc_applicantrecipient,
        egcs_fc_receivable: context.egcs_fc_receivable, egcs_fc_creditmemochartofaccount: undefined,
        egcs_fc_agency: context.egcs_fc_agency,
        egcs_fc_currency: context.egcs_fc_currency,
        egcs_fc_receiveddate: new Date().toISOString().slice(0, 10),
        egcs_fc_amount: '', egcs_fc_receiptreference: '', egcs_fc_narrative_en: '', egcs_fc_narrative_fr: ''
      }
    : null
}, { immediate: true, flush: 'sync' })
watch(() => state.value?.egcs_fc_agency, (value, previous) => {
  if (state.value && previous && value !== previous) {
    state.value.egcs_fc_receivable = undefined
    state.value.egcs_fc_creditmemochartofaccount = undefined
    state.value.egcs_fc_currency = undefined
  }
}, { flush: 'sync' })
watch(() => state.value?.egcs_fc_receivable, (value, previous) => {
  if (state.value && value !== previous) state.value.egcs_fc_creditmemochartofaccount = undefined
}, { flush: 'sync' })
const resolveReceivableCurrency = (items: Array<{ id: string; egcs_fc_currency?: unknown }>) => {
  const selected = items.find(item => String(item.id) === state.value?.egcs_fc_receivable)
  if (state.value && selected && typeof selected.egcs_fc_currency === 'string') state.value.egcs_fc_currency = selected.egcs_fc_currency as Currency_Codes
}
const save = async () => {
  if (!state.value || pending.value) return
  const currentSession = session
  pending.value = true
  try {
    const result = await sendJson<{ id: string, egcs_fc_applicantrecipient: string }>('/api/account-receivable-credit-memos', 'POST', AccountReceivableCreditMemoCreateSchema.parse(state.value))
    if (currentSession !== session) return
    open.value = false
    emit('created', result.id, result.egcs_fc_applicantrecipient)
  } catch (failure) {
    if (currentSession === session) showError(failure)
  } finally {
    if (currentSession === session) pending.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="t('account_receivable.create_credit_memo')" :description="t('account_receivable.credit_memo_credit_instruction')" :ui="{ content: 'sm:max-w-2xl', header: 'shrink-0' }">
    <template #body>
      <UForm v-if="state" :state="state" :validate="createValidator(AccountReceivableCreditMemoCreateSchema)" class="space-y-4" @submit="save">
        <dl class="text-sm">
          <dt class="text-muted">
            {{ t('account_receivable.proponent') }}
          </dt>
          <dd class="mt-1 font-medium">
            {{ getBilingualValue(context, 'egcs_fc_debtorname', t('common.not_available')) }}
          </dd>
        </dl>
        <div class="grid gap-4 md:grid-cols-2">
          <UFormField name="egcs_fc_agency" :label="t('account_receivable.credit_memo_agency')">
            <CommonServerLookupSelect v-model="state.egcs_fc_agency" fetch-url="/api/account-receivable-credit-memos/lookups/agencies" :query="{ egcs_fc_applicantrecipient: context.egcs_fc_applicantrecipient }" selected-values-query-key="selectedIds" value-key="id" label-en-key="egcs_ay_name_en" label-fr-key="egcs_ay_name_fr" :show-value-in-label="false" :disabled="pending || Boolean(context.egcs_fc_receivable)" close-on-select />
          </UFormField>
          <UFormField name="egcs_fc_currency" :label="t('common.currency')">
            <CommonEnumSelect v-model="state.egcs_fc_currency" name="currency_codes" disabled class="w-full" />
          </UFormField>
          <UFormField name="egcs_fc_receivable" :label="t('account_receivable.credit_memo_receivable')">
            <CommonServerLookupSelect
              v-if="state.egcs_fc_agency" :key="state.egcs_fc_agency" v-model="state.egcs_fc_receivable"
              fetch-url="/api/account-receivable-credit-memos/lookups/receivables"
              :query="{ egcs_fc_agency: state.egcs_fc_agency, egcs_fc_applicantrecipient: context.egcs_fc_applicantrecipient }"
              selected-values-query-key="selectedIds" value-key="id" label-en-key="label_en" label-fr-key="label_fr"
              :show-value-in-label="false" :disabled="pending || Boolean(context.egcs_fc_receivable)" close-on-select @resolved-items="resolveReceivableCurrency" />
            <UInput v-else disabled class="w-full" />
          </UFormField>
          <UFormField name="egcs_fc_creditmemochartofaccount" :label="t('account_receivable.credit_memo_coding')">
            <CommonServerLookupSelect
              v-if="state.egcs_fc_receivable" :key="state.egcs_fc_receivable" v-model="state.egcs_fc_creditmemochartofaccount"
              fetch-url="/api/account-receivable-credit-memos/lookups/chart-of-accounts" :query="{ egcs_fc_receivable: state.egcs_fc_receivable }"
              selected-values-query-key="selectedIds" value-key="id" label-en-key="label_en" label-fr-key="label_fr"
              :show-value-in-label="false" :disabled="pending" close-on-select />
            <UInput v-else disabled class="w-full" />
          </UFormField>
          <UFormField name="egcs_fc_receiveddate" :label="t('account_receivable.received_date')">
            <CommonDatePicker v-model="state.egcs_fc_receiveddate" :disabled="pending" />
          </UFormField>
          <UFormField name="egcs_fc_amount" :label="t('account_receivable.credit_memo_amount')">
            <UInput v-model="state.egcs_fc_amount" type="text" inputmode="decimal" :disabled="pending" class="w-full" />
          </UFormField>
        </div>
        <UFormField name="egcs_fc_receiptreference" :label="t('account_receivable.receipt_reference')">
          <UInput v-model="state.egcs_fc_receiptreference" :disabled="pending" class="w-full" />
        </UFormField>
        <div class="grid gap-4 md:grid-cols-2">
          <UFormField name="egcs_fc_narrative_en" :label="t('account_receivable.narrative_en')">
            <UTextarea v-model="state.egcs_fc_narrative_en" :disabled="pending" class="w-full" />
          </UFormField>
          <UFormField name="egcs_fc_narrative_fr" :label="t('account_receivable.narrative_fr')">
            <UTextarea v-model="state.egcs_fc_narrative_fr" :disabled="pending" class="w-full" />
          </UFormField>
        </div>
        <p class="text-sm text-muted">
          {{ t('account_receivable.credit_memo_evidence_instruction') }}
        </p>
        <div class="flex flex-wrap justify-end gap-2">
          <UButton type="button" color="neutral" variant="ghost" :label="t('common.cancel')" :disabled="pending" @click="open = false" />
          <CommonSaveButton :label="t('account_receivable.create_credit_memo')" :loading="pending" :disabled="pending" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
