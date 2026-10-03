<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- Modal identity and draft recovery are covered by component regressions. */
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { createAccountReceivableCreateSchemaForType } from '~~/shared/types/schemas/account-receivable'
import type { AccountReceivableDetail } from '~~/shared/types/account-receivable'
import type { AdminCommonLookupResponseItem } from '~~/shared/types/admin-common-ui'
import type { AccountReceivableSourceEntry } from '~~/shared/types/account-receivable-source-entry'

type AdjustmentSource = Pick<AccountReceivableDetail, 'id' | 'egcs_fc_applicantrecipient' | 'egcs_fc_agencyfiscalyear' | 'egcs_fc_type' | 'egcs_fc_typename_en' | 'egcs_fc_typename_fr' | 'egcs_fc_typedescription_en' | 'egcs_fc_typedescription_fr' | 'egcs_fc_recoverymethod' | 'egcs_fc_effectiverecoverymethod' | 'egcs_fc_monitorrequired' | 'egcs_fc_advancepaymentrelated' | 'egcs_fc_claimrelated' | 'egcs_fc_monitorfollowup'>
const { agreementId, adjustment, sourceEntry } = defineProps<{ agreementId: string, adjustment?: AdjustmentSource, sourceEntry?: AccountReceivableSourceEntry }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ created: [id: string] }>()
const { t, locale } = useI18n()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const { sendJson } = useJsonRequest()
type CreateState = {
  egcs_fc_applicantrecipient: string | undefined
  egcs_fc_agencyfiscalyear: string | undefined
  egcs_fc_type: string | undefined
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
  egcs_fc_sourcepayment?: string
  egcs_fc_sourceclaim?: string
}
const state: Ref<CreateState | null> = ref(null)
const selectedType: Ref<AdminCommonLookupResponseItem | null> = ref(null)
const monitorRequired = computed(() => adjustment?.egcs_fc_monitorrequired ?? selectedType.value?.egcs_ay_monitorrequired === true)
const claimRelated = computed(() => adjustment?.egcs_fc_claimrelated
  ?? (selectedType.value ? selectedType.value.egcs_ay_claimrelated === true : sourceEntry?.kind === 'claim'))
const createSchema = computed(() => createAccountReceivableCreateSchemaForType(selectedType.value && !adjustment
  ? { egcs_ay_monitorrequired: monitorRequired.value, egcs_ay_claimrelated: claimRelated.value }
  : null))
const typeDescription = computed(() => {
  if (adjustment) return locale.value === 'fr' ? adjustment.egcs_fc_typedescription_fr : adjustment.egcs_fc_typedescription_en
  const value = selectedType.value?.[locale.value === 'fr' ? 'egcs_ay_description_fr' : 'egcs_ay_description_en']
    ?? selectedType.value?.[locale.value === 'fr' ? 'description_fr' : 'description_en']
  return typeof value === 'string' ? value : undefined
})
const resolveType = (items: AdminCommonLookupResponseItem[]) => {
  const next = items.find(item => String(item.id) === state.value?.egcs_fc_type) ?? null
  const previous = selectedType.value
  if (state.value && next && !adjustment) {
    if (next.egcs_ay_monitorrequired !== true) state.value.egcs_fc_monitorfollowup = undefined
    if (previous && (previous.egcs_ay_claimrelated !== next.egcs_ay_claimrelated
      || previous.egcs_ay_advancepaymentrelated !== next.egcs_ay_advancepaymentrelated)) state.value.egcs_fc_sources = []
  }
  selectedType.value = next
  if (state.value && next && sourceEntry
    && (sourceEntry.kind === 'claim' ? next.egcs_ay_claimrelated === true : next.egcs_ay_advancepaymentrelated === true)
    && state.value.egcs_fc_applicantrecipient === sourceEntry.egcs_fc_applicantrecipient
    && state.value.egcs_fc_agencyfiscalyear === sourceEntry.egcs_fc_agencyfiscalyear) {
    state.value.egcs_fc_sources = [...sourceEntry.egcs_fc_sources]
  }
}
const pending: Ref<boolean> = ref(false)
let session = 0
watch([open, () => agreementId, () => adjustment?.id, () => sourceEntry], ([isOpen]) => {
  session += 1
  pending.value = false
  selectedType.value = null
  state.value = isOpen
    ? {
        egcs_fc_applicantrecipient: adjustment?.egcs_fc_applicantrecipient ?? sourceEntry?.egcs_fc_applicantrecipient,
        egcs_fc_agencyfiscalyear: adjustment?.egcs_fc_agencyfiscalyear ?? sourceEntry?.egcs_fc_agencyfiscalyear,
        egcs_fc_type: adjustment?.egcs_fc_type ?? (sourceEntry?.types.length === 1 ? String(sourceEntry.types[0]!.id) : undefined),
        egcs_fc_recoverymethod: adjustment?.egcs_fc_effectiverecoverymethod ?? undefined,
        egcs_fc_sources: [],
        egcs_fc_requesteddate: new Date().toISOString().slice(0, 10),
        egcs_fc_narrative_en: '', egcs_fc_narrative_fr: '',
        egcs_fc_monitorfollowup: adjustment?.egcs_fc_monitorfollowup ?? undefined, egcs_fc_recipientpreference: undefined, egcs_fc_preferenceoverride_en: '', egcs_fc_preferenceoverride_fr: '',
        ...(adjustment ? { egcs_fc_linkedreceivable: adjustment.id } : {}),
        ...(sourceEntry ? sourceEntry.kind === 'advance' ? { egcs_fc_sourcepayment: sourceEntry.id } : { egcs_fc_sourceclaim: sourceEntry.id } : {})
      }
    : null
}, { immediate: true, flush: 'sync' })
watch(() => state.value?.egcs_fc_type, () => {
  selectedType.value = null
  if (state.value && !adjustment) state.value.egcs_fc_monitorfollowup = undefined
}, { flush: 'sync' })
const sourceQuery = computed<Record<string, string>>(() => {
  const current = state.value
  if (!current?.egcs_fc_type || !current.egcs_fc_agencyfiscalyear || !current.egcs_fc_applicantrecipient) return {} as Record<string, string>
  return { egcs_fc_type: current.egcs_fc_type, egcs_fc_agencyfiscalyear: current.egcs_fc_agencyfiscalyear, egcs_fc_applicantrecipient: current.egcs_fc_applicantrecipient }
})
const sourceReady = computed(() => Boolean(selectedType.value && state.value?.egcs_fc_type && state.value.egcs_fc_agencyfiscalyear && state.value.egcs_fc_applicantrecipient))
watch(sourceQuery, () => {
  if (state.value) state.value.egcs_fc_sources = []
}, { flush: 'sync' })
const save = async () => {
  if (!state.value || pending.value || (!adjustment && !selectedType.value)) return
  const currentSession = session
  const ownerAgreement = agreementId
  pending.value = true
  try {
    const result = await sendJson<{ id: string }>(adjustment
      ? `/api/account-receivables/${adjustment.id}/adjustments`
      : `/api/agreements/${ownerAgreement}/account-receivables`, 'POST', createSchema.value.parse(state.value))
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
  <UModal v-model:open="open" :title="t(adjustment ? 'account_receivable.create_adjustment' : 'account_receivable.create')" :description="t('account_receivable.description')" :ui="{ content: 'sm:max-w-4xl', header: 'shrink-0' }">
    <template #body>
      <UForm v-if="state" :state="state" :validate="createValidator(createSchema)" class="space-y-4" @submit="save">
        <div class="grid gap-4 md:grid-cols-2">
          <UFormField name="egcs_fc_applicantrecipient" :label="t('account_receivable.debtor')">
            <CommonServerLookupSelect v-model="state.egcs_fc_applicantrecipient" :fetch-url="`/api/agreements/${agreementId}/account-receivables/lookups/proponents`" value-key="id" label-en-key="label_en" label-fr-key="label_fr" :show-value-in-label="false" :disabled="Boolean(adjustment || sourceEntry) || pending" close-on-select />
          </UFormField>
          <UFormField name="egcs_fc_agencyfiscalyear" :label="t('agreement.payments.fiscal_year')">
            <CommonServerLookupSelect v-model="state.egcs_fc_agencyfiscalyear" :fetch-url="`/api/agreements/${agreementId}/account-receivables/lookups/fiscal-years`" value-key="id" label-en-key="label_en" label-fr-key="label_fr" :show-value-in-label="false" :disabled="Boolean(adjustment || sourceEntry) || pending" close-on-select />
          </UFormField>
          <UFormField name="egcs_fc_type" :label="t('account_receivable.type')" :description="t('account_receivable.type_instruction')">
            <UInput v-if="adjustment" :model-value="locale === 'fr' ? adjustment.egcs_fc_typename_fr : adjustment.egcs_fc_typename_en" readonly required class="w-full" />
            <CommonServerLookupSelect v-else v-model="state.egcs_fc_type" :fetch-url="`/api/agreements/${agreementId}/account-receivables/lookups/types`" :query="sourceEntry ? { source_family: sourceEntry.kind } : undefined" selected-values-query-key="selectedIds" value-key="id" label-en-key="label_en" label-fr-key="label_fr" :show-value-in-label="false" :disabled="pending" close-on-select @resolved-items="resolveType" />
            <p v-if="typeDescription" class="mt-2 text-sm text-muted">
              {{ typeDescription }}
            </p>
          </UFormField>
          <UFormField name="egcs_fc_recoverymethod" :label="t('account_receivable.recovery_method')" :description="t('account_receivable.recovery_method_instruction')">
            <CommonEnumSelect v-model="state.egcs_fc_recoverymethod" name="account_receivable_recovery_method" :disabled="pending" class="w-full" />
            <UButton v-if="state.egcs_fc_recoverymethod" type="button" icon="i-lucide-x" color="neutral" variant="ghost" :label="t('account_receivable.clear_recovery_method')" :disabled="pending" class="max-w-full [&_[data-slot=label]]:whitespace-normal [&_[data-slot=label]]:text-left" @click="state.egcs_fc_recoverymethod = undefined" />
          </UFormField>
        </div>
        <UFormField v-if="!adjustment" name="egcs_fc_sources" :required="claimRelated" :label="t(claimRelated ? 'account_receivable.source_claims' : 'account_receivable.source_advances')" :description="t(sourceEntry ? 'account_receivable.source_context_locked' : 'account_receivable.source_description')">
          <CommonServerLookupSelect v-if="sourceReady" v-model:values="state.egcs_fc_sources" :fetch-url="`/api/agreements/${agreementId}/account-receivables/lookups/sources`" :query="sourceQuery" :disabled="Boolean(sourceEntry) || pending" value-key="id" label-en-key="label_en" label-fr-key="label_fr" :show-value-in-label="false" multiple close-on-select />
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
        <UFormField v-if="!adjustment && monitorRequired" name="egcs_fc_monitorfollowup" :label="t('account_receivable.monitor_followup')" :description="t('account_receivable.monitor_link_description')" required>
          <CommonServerLookupSelect v-model="state.egcs_fc_monitorfollowup" :fetch-url="`/api/agreements/${agreementId}/account-receivables/lookups/monitor-followups`" :query="{ egcs_fc_type: state.egcs_fc_type! }" value-key="id" label-en-key="label_en" label-fr-key="label_fr" :show-value-in-label="false" :disabled="pending" close-on-select />
        </UFormField>
        <UFormField name="egcs_fc_recipientpreference" :label="t('account_receivable.recipient_preference')" :description="t('account_receivable.preference_description')">
          <CommonEnumSelect v-model="state.egcs_fc_recipientpreference" name="account_receivable_recovery_method" :disabled="pending" class="w-full" />
          <UButton v-if="state.egcs_fc_recipientpreference" type="button" icon="i-lucide-x" color="neutral" variant="ghost" :label="t('account_receivable.clear_preference')" :disabled="pending" class="max-w-full [&_[data-slot=label]]:whitespace-normal [&_[data-slot=label]]:text-left" @click="state.egcs_fc_recipientpreference = undefined" />
        </UFormField>
        <template v-if="state.egcs_fc_recoverymethod && state.egcs_fc_recipientpreference && state.egcs_fc_recipientpreference !== state.egcs_fc_recoverymethod">
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
        <div class="flex flex-wrap justify-end gap-2">
          <UButton type="button" :label="t('common.cancel')" color="neutral" variant="ghost" :disabled="pending" @click="open = false" />
          <CommonSaveButton :label="t(adjustment ? 'account_receivable.create_adjustment' : 'account_receivable.create')" :loading="pending" :disabled="pending || (!adjustment && !selectedType)" class="max-w-full [&_[data-slot=label]]:whitespace-normal [&_[data-slot=label]]:text-left" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
