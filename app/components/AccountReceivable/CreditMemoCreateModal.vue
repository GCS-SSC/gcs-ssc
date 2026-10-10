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
  egcs_fc_receivables: string[]
  egcs_fc_totalamount: string
  egcs_fc_agency: string | undefined
  egcs_fc_currency: Currency_Codes | undefined
  egcs_fc_receiveddate: string | Date | null
  egcs_fc_reason: string
}
const state: Ref<State | null> = ref(null)
const pending: Ref<boolean> = ref(false)
const singleAgency: Ref<boolean> = ref(false)
const identity = computed(() => `${context.egcs_fc_applicantrecipient}:${context.egcs_fc_agency ?? ''}:${context.egcs_fc_currency ?? ''}:${context.egcs_fc_receivable ?? ''}`)
let session = 0
onBeforeUnmount(() => {
  session += 1
})
type AgencyLookupResponse = { items: Array<{ id: string }>; total: number }
const fetchAgencyOptions = $fetch as (url: string, options: { query: Record<string, string | number> }) => Promise<AgencyLookupResponse>
const resolveSingleAgency = async () => {
  const currentSession = session
  try {
    const result = await fetchAgencyOptions('/api/account-receivable-credit-memos/lookups/agencies', {
      query: { egcs_fc_applicantrecipient: context.egcs_fc_applicantrecipient, page: 1, limit: 2 }
    })
    if (currentSession !== session || !state.value) return
    const agency = result.items[0]
    if (result.total === 1 && result.items.length === 1 && agency
      && (!state.value.egcs_fc_agency || state.value.egcs_fc_agency === String(agency.id))) {
      state.value.egcs_fc_agency = String(agency.id)
      singleAgency.value = true
    }
  } catch {
    // Keep the shared lookup visible so its existing error and retry controls remain available.
  }
}
watch([open, identity], ([isOpen]) => {
  session += 1
  pending.value = false
  singleAgency.value = false
  state.value = isOpen
    ? {
        egcs_fc_applicantrecipient: context.egcs_fc_applicantrecipient,
        egcs_fc_receivable: context.egcs_fc_receivable,
        egcs_fc_receivables: context.egcs_fc_receivable ? [context.egcs_fc_receivable] : [],
        egcs_fc_totalamount: '',
        egcs_fc_agency: context.egcs_fc_agency,
        egcs_fc_currency: context.egcs_fc_currency,
        egcs_fc_receiveddate: new Date().toISOString().slice(0, 10),
        egcs_fc_reason: ''
      }
    : null
  if (isOpen) void resolveSingleAgency()
}, { immediate: true, flush: 'sync' })
watch(() => [state.value, state.value?.egcs_fc_agency] as const, ([currentState, value], [previousState, previous]) => {
  if (currentState && currentState === previousState && value !== previous) {
    currentState.egcs_fc_receivable = undefined
    currentState.egcs_fc_receivables = []
    currentState.egcs_fc_currency = undefined
  }
}, { flush: 'sync' })
watch(() => [state.value, state.value?.egcs_fc_receivables[0]] as const, ([currentState, first], [previousState, previousFirst]) => {
  if (!currentState) return
  currentState.egcs_fc_receivable = first
  if (currentState === previousState && first !== previousFirst) currentState.egcs_fc_currency = undefined
}, { flush: 'sync' })
const resolveReceivableCurrency = (items: Array<{ id: string; egcs_fc_currency?: unknown }>) => {
  const selected = items.find(item => String(item.id) === state.value?.egcs_fc_receivables[0])
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
          <UFormField v-if="!singleAgency" class="md:col-span-2" name="egcs_fc_agency" :label="t('account_receivable.credit_memo_agency')">
            <CommonServerLookupSelect v-model="state.egcs_fc_agency" fetch-url="/api/account-receivable-credit-memos/lookups/agencies" :query="{ egcs_fc_applicantrecipient: context.egcs_fc_applicantrecipient }" selected-values-query-key="selectedIds" value-key="id" label-en-key="egcs_ay_name_en" label-fr-key="egcs_ay_name_fr" :show-value-in-label="false" :disabled="pending || Boolean(context.egcs_fc_receivable)" close-on-select />
          </UFormField>
          <UFormField name="egcs_fc_receivables" :label="t('account_receivable.credit_memo_receivable')" required>
            <CommonServerLookupSelect
              v-if="state.egcs_fc_agency" :key="state.egcs_fc_agency" v-model:values="state.egcs_fc_receivables" multiple
              fetch-url="/api/account-receivable-credit-memos/lookups/receivables"
              :query="{ egcs_fc_agency: state.egcs_fc_agency, egcs_fc_applicantrecipient: context.egcs_fc_applicantrecipient, ...(state.egcs_fc_currency ? { egcs_fc_currency: state.egcs_fc_currency } : {}) }"
              selected-values-query-key="selectedIds" value-key="id" label-en-key="label_en" label-fr-key="label_fr"
              :show-value-in-label="false" :disabled="pending" @resolved-items="resolveReceivableCurrency" />
            <UInput v-else disabled class="w-full" />
          </UFormField>
          <UFormField name="egcs_fc_receiveddate" :label="t('account_receivable.received_date')">
            <CommonDatePicker v-model="state.egcs_fc_receiveddate" :disabled="pending" />
          </UFormField>
        </div>
        <UFormField name="egcs_fc_totalamount" :label="t('account_receivable.credit_memo_amount')">
          <CommonCurrencyInput v-model="state.egcs_fc_totalamount" :currency="state.egcs_fc_currency" :disabled="pending" class="w-full" />
        </UFormField>
        <UFormField name="egcs_fc_reason" :label="t('account_receivable.reason')">
          <UTextarea v-model="state.egcs_fc_reason" :disabled="pending" class="w-full" />
        </UFormField>
        <div class="flex flex-wrap justify-end gap-2">
          <UButton type="button" color="neutral" variant="ghost" :label="t('common.cancel')" :disabled="pending" @click="open = false" />
          <CommonSaveButton :label="t('account_receivable.create_credit_memo')" :loading="pending" :disabled="pending" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
