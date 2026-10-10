<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- Retained Claim reconciliation follows the AR's draft and stale-request boundaries. */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { FormErrorEvent } from '@nuxt/ui'
import { z } from 'zod'
import { AccountReceivableClaimReductionSchema } from '~~/shared/types/schemas/account-receivable'
import { NonNegativeMoneySchema } from '~~/shared/types/schemas/money'
import type { AccountReceivableClaimReduction } from '~~/shared/types/account-receivable'
import { moneyToCents } from '~~/shared/utils/money'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { formatAccountReceivableAmount } from '~/utils/account-receivable-display'
import { useLoadRecoveryFocus } from '~/composables/useLoadRecoveryFocus'

const { accountReceivableId, currency, reductions, canEdit, canUpdate } = defineProps<{
  accountReceivableId: string
  currency: string
  reductions: AccountReceivableClaimReduction[]
  canEdit: boolean
  canUpdate: boolean
}>()
const emit = defineEmits<{ changed: [] }>()
const { t, locale } = useI18n()
const { createValidator } = useZodI18n()
const { sendJson } = useJsonRequest()
const { showError } = useApiErrorToast()
const toast = useToast()
const { recoveryFocusTarget, focusRecoveredContent } = useLoadRecoveryFocus()
type Choice = { id: string, egcs_fc_claim: string, egcs_fc_description: string, egcs_fc_amount: string, egcs_fc_reserved: string, egcs_fc_available: string }
type DraftLine = { egcs_fc_claimline: string, egcs_fc_amount: string }
const choices: Ref<Choice[]> = ref([])
const selectedClaim: Ref<string | undefined> = ref(undefined)
const state: Ref<{ egcs_fc_lines: DraftLine[] } | null> = ref(null)
const pending: Ref<boolean> = ref(false)
const loadStatus: Ref<'pending' | 'success' | 'error'> = ref('pending')
const dirty: Ref<boolean> = ref(false)
const loadError: Ref<unknown | null> = ref(null)
const draftSchema = z.object({ egcs_fc_lines: z.array(z.object({ egcs_fc_claimline: z.string(), egcs_fc_amount: NonNegativeMoneySchema })) })
const claimOptions = computed(() => [...new Set(choices.value.map(choice => choice.egcs_fc_claim))].map(id => ({ id, label_en: `${t('account_receivable.claim')} ${id}`, label_fr: `${t('account_receivable.claim')} ${id}` })))
const selectedLines = computed(() => choices.value.map((choice, index) => ({ choice, index })).filter(({ choice }) => choice.egcs_fc_claim === selectedClaim.value))
let generation = 0
let disposed = false
const load = async () => {
  const requestGeneration = ++generation
  const owner = accountReceivableId
  loadStatus.value = 'pending'
  loadError.value = null
  try {
    const response = await fetch(getClientRequestUrl(`/api/account-receivables/${owner}/claim-reductions`))
    if (!response.ok) await throwFetchResponseError(response)
    const result = await response.json() as { items: Choice[] }
    if (disposed || requestGeneration !== generation || owner !== accountReceivableId) return
    const previousDraft = dirty.value ? state.value?.egcs_fc_lines : undefined
    choices.value = result.items
    state.value = { egcs_fc_lines: result.items.map(choice => ({ egcs_fc_claimline: choice.id,
      egcs_fc_amount: previousDraft?.find(row => row.egcs_fc_claimline === choice.id)?.egcs_fc_amount
        ?? reductions.find(row => row.egcs_fc_claimline === choice.id)?.egcs_fc_amount ?? '0.00' })) }
    if (!result.items.some(choice => choice.egcs_fc_claim === selectedClaim.value)) selectedClaim.value = result.items[0]?.egcs_fc_claim
    loadStatus.value = 'success'
  } catch (failure) {
    if (!disposed && requestGeneration === generation && owner === accountReceivableId) {
      loadError.value = failure
      loadStatus.value = 'error'
    }
  }
}
const retryLoad = async () => {
  await load()
  if (!disposed && loadStatus.value === 'success') await focusRecoveredContent()
}
watch(() => accountReceivableId, () => {
  choices.value = []
  state.value = null
  dirty.value = false
  selectedClaim.value = undefined
  pending.value = false
  void load()
}, { immediate: true, flush: 'sync' })
watch(() => reductions, () => {
  if (state.value) void load()
})
onBeforeUnmount(() => {
  disposed = true
  generation += 1
})
const format = (amount: string) => formatAccountReceivableAmount(amount, locale.value, currency)
const markDirty = () => {
  dirty.value = true
}
const revealInvalidClaim = async (event: FormErrorEvent) => {
  const path = event.errors[0]?.name?.match(/^egcs_fc_lines\.(\d+)\.egcs_fc_amount$/)
  const choice = path ? choices.value[Number(path[1])] : undefined
  if (!choice) return
  selectedClaim.value = choice.egcs_fc_claim
  await nextTick()
  const row = [...(recoveryFocusTarget.value?.querySelectorAll<HTMLElement>('[data-claim-line]') ?? [])]
    .find(element => element.dataset.claimLine === choice.id)
  row?.querySelector<HTMLInputElement>('input')?.focus()
}
const save = async () => {
  if (!state.value || loadStatus.value !== 'success' || pending.value) return
  if (!canEdit) {
    if (canUpdate) toast.add({ title: t('common.warning'), description: t('account_receivable.work_prerequisite'), color: 'warning' })
    return
  }
  const owner = accountReceivableId
  pending.value = true
  try {
    const draft = draftSchema.parse(state.value)
    await sendJson(`/api/account-receivables/${owner}/claim-reductions`, 'PATCH', AccountReceivableClaimReductionSchema.parse({ egcs_fc_lines: draft.egcs_fc_lines.filter(line => moneyToCents(line.egcs_fc_amount) > BigInt(0)) }))
    if (!disposed && owner === accountReceivableId) {
      dirty.value = false
      emit('changed')
    }
  } catch (failure) {
    if (!disposed && owner === accountReceivableId) showError(failure)
  } finally {
    if (!disposed && owner === accountReceivableId) pending.value = false
  }
}
</script>

<template>
  <div class="min-w-0">
    <p class="mb-4 text-sm text-muted">
      {{ t('account_receivable.claim_reductions_instruction') }}
    </p>
    <p v-if="loadStatus === 'pending'" role="status" aria-live="polite" class="text-sm text-muted">
      {{ t('common.loading_records') }}
    </p>
    <UAlert v-if="loadError" color="error" :title="t('common.resource_table_load_failed')" :description="t('common.resource_table_load_failed_description')">
      <template #actions>
        <UButton :label="t('common.retry')" @click="retryLoad" />
      </template>
    </UAlert>
    <div v-else-if="state" ref="recoveryFocusTarget" tabindex="-1" class="outline-none">
      <UForm :state="state" :validate="createValidator(draftSchema)" class="space-y-4" @submit="save" @error="revealInvalidClaim">
        <UFormField :label="t('account_receivable.claim')">
          <CommonBilingualSelectMenu v-model="selectedClaim" :items="claimOptions" value-key="id" label-en-key="label_en" label-fr-key="label_fr" />
        </UFormField>
        <div v-for="{ choice, index } in selectedLines" :key="choice.id" :data-claim-line="choice.id" class="grid gap-3 border-b border-default pb-4 sm:grid-cols-2">
          <div class="text-sm">
            <p class="font-medium">
              {{ choice.egcs_fc_description }}
            </p>
            <p class="text-muted">
              {{ t('account_receivable.claimed_amount') }}: {{ format(choice.egcs_fc_amount) }}
            </p>
            <p class="text-muted">
              {{ t('account_receivable.available') }}: {{ format(choice.egcs_fc_available) }}
            </p>
          </div>
          <UFormField :name="`egcs_fc_lines.${index}.egcs_fc_amount`" :label="t('account_receivable.reduction_amount')" required>
            <CommonCurrencyInput v-if="state.egcs_fc_lines[index]" v-model="state.egcs_fc_lines[index]!.egcs_fc_amount" :currency="currency" :readonly="!canEdit" :disabled="pending || loadStatus !== 'success'" @update:model-value="markDirty" />
          </UFormField>
        </div>
        <p v-if="!choices.length" class="text-sm text-muted">
          {{ t('common.no_records') }}
        </p>
        <p v-if="reductions.some(reduction => reduction.egcs_fc_appliedat)" class="text-sm text-success">
          {{ t('account_receivable.claim_reductions_applied') }}
        </p>
        <div v-if="canUpdate" class="flex justify-end">
          <CommonSaveButton :label="t('common.save')" :loading="pending" :disabled="pending || loadStatus !== 'success'" />
        </div>
      </UForm>
    </div>
  </div>
</template>
