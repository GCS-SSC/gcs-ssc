<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { AdminCommonLookupResponseItem } from '~~/shared/types/admin-common-ui'
import type { JournalVoucherAllocationDraft, JournalVoucherDetail } from '~~/shared/types/journal-voucher'
import { JournalVoucherAllocationSchema } from '~~/shared/types/schemas/journal-voucher'
import { TransferPaymentStreamChartOfAccountDimensionSchema } from '~~/shared/types/schemas/transfer-payment'

const open = defineModel<boolean>('open', { required: true })
const state = defineModel<JournalVoucherAllocationDraft | null>({ required: true })
const { voucherId, original, editing } = defineProps<{
  voucherId: string
  original: JournalVoucherDetail['egcs_fc_lines']
  editing: boolean
}>()
const emit = defineEmits<{ save: [line: JournalVoucherAllocationDraft] }>()
const { t } = useI18n()
const { createValidator } = useZodI18n()
const resolvedCoding: Ref<AdminCommonLookupResponseItem[]> = ref([])
const commitments = computed(() => [...new Map(original.map(line => [line.egcs_fc_commitmentline, line])).values()]
  .map(line => ({ id: line.egcs_fc_commitmentline, label: `${t('journal_voucher.commitment_line')} ${line.egcs_fc_commitmentlinenumber}` })))
const dimensions = computed(() => TransferPaymentStreamChartOfAccountDimensionSchema.array().safeParse(
  resolvedCoding.value.find(item => String(item.id) === state.value?.egcs_fc_chartofaccount)?.egcs_fc_accountingdimensions
))
const codingNotOnAgreement = computed(() => resolvedCoding.value.find(item =>
  String(item.id) === state.value?.egcs_fc_chartofaccount)?.egcs_fc_agreementcodingmatched === false)
watch(open, () => {
  resolvedCoding.value = []
})
watch(() => state.value?.egcs_fc_commitmentline, (commitmentId, previous) => {
  if (!state.value || !previous || commitmentId === previous) return
  const baseline = original.find(line => line.egcs_fc_commitmentline === commitmentId)
  if (baseline) state.value.egcs_fc_chartofaccount = baseline.egcs_fc_chartofaccount
})
/** Applies only validated allocation fields and the resolved coding snapshot to the entry draft. */
const apply = () => {
  if (!state.value || !dimensions.value.success) return
  const allocation = JournalVoucherAllocationSchema.parse(state.value)
  emit('save', { ...state.value, ...allocation, egcs_fc_accountingdimensions: dimensions.value.data,
    egcs_fc_agreementcodingmatched: !codingNotOnAgreement.value })
}
</script>

<template>
  <UModal
    v-model:open="open" :title="t(editing ? 'journal_voucher.edit_split' : 'journal_voucher.add_split')"
    :description="t('journal_voucher.split_description')" :ui="{ content: 'sm:max-w-2xl' }">
    <template #body>
      <UForm
        v-if="state" :state="state" :validate="createValidator(JournalVoucherAllocationSchema)"
        :validate-on="[]" class="space-y-6" @submit="apply">
        <div class="grid gap-6 sm:grid-cols-2">
          <UFormField name="egcs_fc_commitmentline" :label="t('journal_voucher.commitment_line')">
            <CommonBilingualSelectMenu v-model="state.egcs_fc_commitmentline" :items="commitments" label-key="label" />
          </UFormField>
          <UFormField name="egcs_fc_amount" :label="t('journal_voucher.amount')">
            <UInput
              v-model="state.egcs_fc_amount" class="w-full tabular-nums" type="text" inputmode="decimal"
              aria-describedby="allocation-modal-instruction" />
          </UFormField>
          <UFormField name="egcs_fc_chartofaccount" :label="t('journal_voucher.coding')" class="sm:col-span-2">
            <CommonServerLookupSelect
              v-model="state.egcs_fc_chartofaccount" :fetch-url="`/api/journal-vouchers/${voucherId}/coding`"
              value-key="id" label-en-key="label_en" label-fr-key="label_fr"
              :aria-describedby="codingNotOnAgreement ? 'allocation-coding-warning' : undefined"
              close-on-select :show-value-in-label="false" @resolved-items="resolvedCoding = $event" />
          </UFormField>
        </div>
        <UAlert
          v-if="codingNotOnAgreement" id="allocation-coding-warning" role="alert" color="warning" variant="soft"
          icon="i-lucide-triangle-alert" :title="t('journal_voucher.coding_not_on_agreement')"
          :ui="{ title: 'text-amber-900 dark:text-amber-100', description: 'text-amber-900 dark:text-amber-100' }"
          :description="t('journal_voucher.coding_not_on_agreement_description')" />
        <p id="allocation-modal-instruction" class="text-sm text-muted">
          {{ t('journal_voucher.balance_instruction') }}
        </p>
        <div class="flex flex-wrap justify-end gap-2">
          <UButton type="button" :label="t('common.cancel')" color="neutral" variant="ghost" @click="open = false" />
          <CommonSaveButton :label="t('journal_voucher.apply_split')" :disabled="!dimensions.success" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
