<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- Modal identity and draft recovery are covered by component regressions. */
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { AccountReceivableCreateSchema } from '~~/shared/types/schemas/account-receivable'
import type { AccountReceivableDetail } from '~~/shared/types/account-receivable'

type AdjustmentSource = Pick<AccountReceivableDetail, 'id' | 'egcs_fc_applicantrecipient' | 'egcs_fc_agencyfiscalyear' | 'egcs_fc_type' | 'egcs_fc_recoverymethod' | 'egcs_fc_effectiverecoverymethod'>
const { agreementId, adjustment } = defineProps<{ agreementId: string, adjustment?: AdjustmentSource }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ created: [id: string] }>()
const { t } = useI18n()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const { sendJson } = useJsonRequest()
type CreateState = {
  egcs_fc_applicantrecipient: string | undefined
  egcs_fc_agencyfiscalyear: string | undefined
  egcs_fc_type: 'ineligible_expense' | 'outstanding_advance' | undefined
  egcs_fc_recoverymethod: 'offset' | 'direct_repayment' | undefined
  egcs_fc_sources: string[]
  egcs_fc_requesteddate: string | Date | null
  egcs_fc_narrative_en: string
  egcs_fc_narrative_fr: string
  egcs_fc_recipientpreference: 'offset' | 'direct_repayment' | undefined
  egcs_fc_preferenceoverride_en: string
  egcs_fc_preferenceoverride_fr: string
  egcs_fc_monitorfollowup: string | undefined
  egcs_fc_linkedreceivable?: string
}
const state: Ref<CreateState | null> = ref(null)
const pending: Ref<boolean> = ref(false)
let session = 0
watch([open, () => agreementId, () => adjustment?.id], ([isOpen]) => {
  session += 1
  pending.value = false
  state.value = isOpen
    ? {
        egcs_fc_applicantrecipient: adjustment?.egcs_fc_applicantrecipient,
        egcs_fc_agencyfiscalyear: adjustment?.egcs_fc_agencyfiscalyear,
        egcs_fc_type: adjustment?.egcs_fc_type,
        egcs_fc_recoverymethod: adjustment?.egcs_fc_effectiverecoverymethod,
        egcs_fc_sources: [],
        egcs_fc_requesteddate: new Date().toISOString().slice(0, 10),
        egcs_fc_narrative_en: '', egcs_fc_narrative_fr: '',
        egcs_fc_monitorfollowup: undefined, egcs_fc_recipientpreference: undefined, egcs_fc_preferenceoverride_en: '', egcs_fc_preferenceoverride_fr: '',
        ...(adjustment ? { egcs_fc_linkedreceivable: adjustment.id } : {})
      }
    : null
}, { immediate: true, flush: 'sync' })
const sourceQuery = computed<Record<string, string>>(() => {
  const current = state.value
  if (!current?.egcs_fc_type || !current.egcs_fc_agencyfiscalyear || !current.egcs_fc_applicantrecipient) return {} as Record<string, string>
  return { egcs_fc_type: current.egcs_fc_type, egcs_fc_agencyfiscalyear: current.egcs_fc_agencyfiscalyear, egcs_fc_applicantrecipient: current.egcs_fc_applicantrecipient }
})
const sourceReady = computed(() => Boolean(state.value?.egcs_fc_type && state.value.egcs_fc_agencyfiscalyear && state.value.egcs_fc_applicantrecipient))
watch(sourceQuery, () => {
  if (state.value) state.value.egcs_fc_sources = []
}, { flush: 'sync' })
const save = async () => {
  if (!state.value || pending.value) return
  const currentSession = session
  const ownerAgreement = agreementId
  pending.value = true
  try {
    const result = await sendJson<{ id: string }>(adjustment
      ? `/api/account-receivables/${adjustment.id}/adjustments`
      : `/api/agreements/${ownerAgreement}/account-receivables`, 'POST', AccountReceivableCreateSchema.parse(state.value))
    if (currentSession !== session || ownerAgreement !== agreementId) return
    open.value = false
    emit('created', result.id)
  } catch (failure) {
    if (currentSession === session) showError(failure)
  } finally {
    if (currentSession === session) pending.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="t(adjustment ? 'account_receivable.create_adjustment' : 'account_receivable.create')" :description="t('account_receivable.description')" :ui="{ content: 'sm:max-w-4xl' }">
    <template #body>
      <UForm v-if="state" :state="state" :validate="createValidator(AccountReceivableCreateSchema)" class="space-y-4" @submit="save">
        <div class="grid gap-4 md:grid-cols-2">
          <UFormField name="egcs_fc_applicantrecipient" :label="t('account_receivable.debtor')">
            <CommonServerLookupSelect v-model="state.egcs_fc_applicantrecipient" :fetch-url="`/api/agreements/${agreementId}/account-receivables/lookups/proponents`" value-key="id" label-en-key="label_en" label-fr-key="label_fr" :show-value-in-label="false" :disabled="Boolean(adjustment) || pending" close-on-select />
          </UFormField>
          <UFormField name="egcs_fc_agencyfiscalyear" :label="t('agreement.payments.fiscal_year')">
            <CommonServerLookupSelect v-model="state.egcs_fc_agencyfiscalyear" :fetch-url="`/api/agreements/${agreementId}/account-receivables/lookups/fiscal-years`" value-key="id" label-en-key="label_en" label-fr-key="label_fr" :show-value-in-label="false" :disabled="Boolean(adjustment) || pending" close-on-select />
          </UFormField>
          <UFormField name="egcs_fc_type" :label="t('account_receivable.type')">
            <CommonEnumSelect v-model="state.egcs_fc_type" name="account_receivable_type" :disabled="Boolean(adjustment) || pending" class="w-full" />
          </UFormField>
          <UFormField name="egcs_fc_recoverymethod" :label="t('account_receivable.recovery_method')">
            <CommonEnumSelect v-model="state.egcs_fc_recoverymethod" name="account_receivable_recovery_method" :disabled="pending" class="w-full" />
          </UFormField>
        </div>
        <UFormField v-if="!adjustment" name="egcs_fc_sources" :required="state.egcs_fc_type === 'ineligible_expense'" :label="t(state.egcs_fc_type === 'outstanding_advance' ? 'account_receivable.source_advances' : 'account_receivable.source_claims')" :description="t('account_receivable.source_description')">
          <CommonServerLookupSelect v-if="sourceReady" v-model:values="state.egcs_fc_sources" :fetch-url="`/api/agreements/${agreementId}/account-receivables/lookups/sources`" :query="sourceQuery" :disabled="pending" value-key="id" label-en-key="label_en" label-fr-key="label_fr" :show-value-in-label="false" multiple close-on-select />
          <p v-else class="text-sm text-muted">
            {{ t('account_receivable.select_source_basis') }}
          </p>
        </UFormField>
        <UFormField name="egcs_fc_requesteddate" :label="t('account_receivable.requested_date')">
          <CommonDatePicker v-model="state.egcs_fc_requesteddate" :disabled="pending" />
        </UFormField>
        <p id="account-receivable-create-rationale" class="text-sm text-muted">
          {{ t('account_receivable.rationale_instruction') }}
        </p>
        <div class="grid gap-4 md:grid-cols-2">
          <UFormField name="egcs_fc_narrative_en" :label="t('account_receivable.narrative_en')">
            <UTextarea v-model="state.egcs_fc_narrative_en" aria-describedby="account-receivable-create-rationale" :disabled="pending" class="w-full" :rows="4" />
          </UFormField>
          <UFormField name="egcs_fc_narrative_fr" :label="t('account_receivable.narrative_fr')">
            <UTextarea v-model="state.egcs_fc_narrative_fr" aria-describedby="account-receivable-create-rationale" :disabled="pending" class="w-full" :rows="4" />
          </UFormField>
        </div>
        <UFormField v-if="!adjustment" name="egcs_fc_monitorfollowup" :label="t('account_receivable.monitor_followup')" :description="t('account_receivable.monitor_link_description')">
          <CommonServerLookupSelect v-model="state.egcs_fc_monitorfollowup" :fetch-url="`/api/agreements/${agreementId}/account-receivables/lookups/monitor-followups`" value-key="id" label-en-key="label_en" label-fr-key="label_fr" :show-value-in-label="false" :disabled="pending" close-on-select />
        </UFormField>
        <UFormField name="egcs_fc_recipientpreference" :label="t('account_receivable.recipient_preference')" :description="t('account_receivable.preference_description')">
          <CommonEnumSelect v-model="state.egcs_fc_recipientpreference" name="account_receivable_recovery_method" :disabled="pending" class="w-full" />
          <UButton v-if="state.egcs_fc_recipientpreference" type="button" icon="i-lucide-x" color="neutral" variant="ghost" :label="t('account_receivable.clear_preference')" :disabled="pending" @click="state.egcs_fc_recipientpreference = undefined" />
        </UFormField>
        <template v-if="state.egcs_fc_recipientpreference && state.egcs_fc_recipientpreference !== state.egcs_fc_recoverymethod">
          <p id="account-receivable-create-override" class="text-sm text-muted">
            {{ t('account_receivable.override_instruction') }}
          </p>
          <div class="grid gap-4 md:grid-cols-2">
            <UFormField name="egcs_fc_preferenceoverride_en" :label="t('account_receivable.override_en')">
              <UTextarea v-model="state.egcs_fc_preferenceoverride_en" aria-describedby="account-receivable-create-override" :disabled="pending" class="w-full" />
            </UFormField>
            <UFormField name="egcs_fc_preferenceoverride_fr" :label="t('account_receivable.override_fr')">
              <UTextarea v-model="state.egcs_fc_preferenceoverride_fr" aria-describedby="account-receivable-create-override" :disabled="pending" class="w-full" />
            </UFormField>
          </div>
        </template>
        <p class="text-sm text-muted">
          {{ t(adjustment ? 'account_receivable.adjustment_instruction' : 'account_receivable.create_amount_instruction') }}
        </p>
        <div class="flex justify-end gap-2">
          <UButton type="button" :label="t('common.cancel')" color="neutral" variant="ghost" :disabled="pending" @click="open = false" />
          <CommonSaveButton :label="t(adjustment ? 'account_receivable.create_adjustment' : 'account_receivable.create')" :loading="pending" :disabled="pending" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
