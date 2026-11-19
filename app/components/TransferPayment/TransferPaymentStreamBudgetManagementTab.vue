<script setup lang="ts">
import { useFormSession } from '~/composables/useFormSession'
import type { ActionContext } from '~/composables/useActionContext'
import { resolveApiErrorDescription } from '~/composables/useApiErrorToast'
import {
  TransferPaymentStreamBudgetManagementSchema,
  type TransferPaymentBudgetFundingMode,
  type TransferPaymentStreamBudgetManagement,
  type TransferPaymentStreamItem
} from '~~/shared/types/schemas'

const { stream, actionContext, canUpdateChild, pending, saveBudgetManagement } = defineProps<{
  stream: TransferPaymentStreamItem
  actionContext: ActionContext
  canUpdateChild: boolean
  pending: boolean
  saveBudgetManagement: (draft: TransferPaymentStreamBudgetManagement) => Promise<boolean>
}>()

const { t } = useI18n()
const toast = useLocalizedToast()
const { createValidator } = useZodI18n()
const validate = createValidator(TransferPaymentStreamBudgetManagementSchema)
const formOwner = useModalSession()
formOwner.isOpen.value = true
const draft = ref(TransferPaymentStreamBudgetManagementSchema.parse(stream))
const errorText = ref('')
const modeItems = computed(() => [
  { value: 'program_only', label: t('transfer_payment.budget_management.program_only') },
  { value: 'manual', label: t('transfer_payment.budget_management.manual') },
  { value: 'automatic', label: t('transfer_payment.budget_management.automatic') }
] satisfies { value: TransferPaymentBudgetFundingMode; label: string }[])

watch(() => actionContext.version.value, () => {
  draft.value = TransferPaymentStreamBudgetManagementSchema.parse(stream)
  errorText.value = ''
}, { flush: 'sync' })
watch(() => [
  stream.egcs_tp_budgetfundingmode,
  stream.egcs_tp_requireforecastfundingbreakdown,
  stream.egcs_tp_requireclaimfundingbreakdown,
  stream.egcs_tp_hidecostcategory,
  stream.egcs_tp_hidecostsubsection
], () => {
  draft.value = TransferPaymentStreamBudgetManagementSchema.parse(stream)
})

/** Saves the current settings and retains an editable draft when the server rejects them. */
const save = async () => {
  const operation = actionContext.capture()
  const session = formOwner.captureSession()
  if (!operation?.canDispatch() || pending || session === null) return
  const ownsEffects = () => operation.isCurrent() && formOwner.isCurrentSession(session)
  errorText.value = ''
  const payload = { ...draft.value }
  if (payload.egcs_tp_budgetfundingmode === 'program_only') {
    payload.egcs_tp_requireforecastfundingbreakdown = false
    payload.egcs_tp_requireclaimfundingbreakdown = false
  }
  try {
    if (await saveBudgetManagement(payload) && ownsEffects()) {
      draft.value = payload
      toast.add({ title: toast.localized('common.success'), description: toast.localized('common.updated_success'), color: 'success' })
    }
  } catch (error: unknown) {
    if (ownsEffects()) errorText.value = resolveApiErrorDescription(error, t('common.unknown_error'))
  }
}
const formSession = useFormSession({ owner: formOwner, action: { kind: 'remote', context: () => actionContext }, submit: save })
</script>

<template>
  <UForm data-field-scope="transfer-payment.stream-budget-management" v-bind="formSession" :state="draft" :validate="validate" :disabled="pending || !canUpdateChild" class="max-w-3xl space-y-6">
    <UFormField
      name="egcs_tp_budgetfundingmode"
      :label="t('transfer_payment.budget_management.funding_mode')"
      required>
      <URadioGroup
        v-model="draft.egcs_tp_budgetfundingmode"
        :items="modeItems"
        variant="card" />
    </UFormField>
    <p v-if="draft.egcs_tp_budgetfundingmode === 'program_only'" class="text-sm text-muted">
      {{ t('transfer_payment.budget_management.program_only_note') }}
    </p>
    <div v-else class="space-y-3">
      <UFormField name="egcs_tp_requireforecastfundingbreakdown" :label="t('transfer_payment.require_forecast_funding_breakdown')">
        <USwitch v-model="draft.egcs_tp_requireforecastfundingbreakdown" />
      </UFormField>
      <UFormField name="egcs_tp_requireclaimfundingbreakdown" :label="t('transfer_payment.require_claim_funding_breakdown')">
        <USwitch v-model="draft.egcs_tp_requireclaimfundingbreakdown" />
      </UFormField>
    </div>
    <div class="space-y-3 border-t border-default pt-5">
      <UFormField name="egcs_tp_hidecostcategory" :label="t('transfer_payment.budget_management.hide_cost_category')">
        <USwitch v-model="draft.egcs_tp_hidecostcategory" />
      </UFormField>
      <UFormField name="egcs_tp_hidecostsubsection" :label="t('transfer_payment.budget_management.hide_cost_subsection')">
        <USwitch v-model="draft.egcs_tp_hidecostsubsection" />
      </UFormField>
    </div>
    <CommonErrorNotice v-if="errorText" :title="t('transfer_payment.budget_management.save_failed')" :description="errorText" />
    <CommonSaveButton v-if="canUpdateChild" :label="t('common.save')" :loading="pending" :disabled="pending" />
  </UForm>
</template>
