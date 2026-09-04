<script setup lang="ts">
import { nanoid } from 'nanoid'
import type { Ref } from 'vue'
import type {
  TransferPaymentStreamChartOfAccountDimension,
  TransferPaymentStreamChartOfAccountItem
} from '~~/shared/types/schemas/transfer-payment'
import { TransferPaymentStreamChartOfAccountSchema } from '~~/shared/types/schemas/transfer-payment'
import type { CrudModalSessionLifecycle } from '~/composables/useCrudModal'
import { useCrudModalPending } from '~/composables/useCrudModal'

type EditableDimension = TransferPaymentStreamChartOfAccountDimension & { uiKey: string }
type ChartOfAccountFormState = {
  id?: string
  egcs_tp_streambudget?: string
  egcs_tp_accountingdimensions: EditableDimension[]
}

const isOpen = defineModel<boolean>({ required: true })
const { streamId, profileId, item, captureSession, closeSession } = defineProps<{
  streamId: string
  profileId: string
  item?: TransferPaymentStreamChartOfAccountItem | null
} & CrudModalSessionLifecycle>()

if (Boolean(captureSession) !== Boolean(closeSession)) {
  throw new Error('TransferPaymentStreamChartOfAccountModal requires captureSession and closeSession together')
}

const emit = defineEmits<{ (e: 'save'): void }>()
const { t } = useI18n()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const pending = useCrudModalPending(() => captureSession ? captureSession() : null)
const isSaving = pending.isPending
const state: Ref<ChartOfAccountFormState> = ref({
  egcs_tp_accountingdimensions: []
})

const budgetFetchUrl = `/api/transfer-payments/${profileId}/streams/${streamId}/budgets`
const submitChartOfAccount = $fetch as unknown as (
  url: string,
  options: {
    method: 'PATCH' | 'POST'
    body: {
      egcs_tp_streambudget?: string
      egcs_tp_accountingdimensions: TransferPaymentStreamChartOfAccountDimension[]
    }
  }
) => Promise<unknown>

/**
 * Creates an editable accounting dimension with a stable UI identity.
 *
 * @param dimension - Optional persisted dimension values.
 * @returns Editable dimension state.
 */
const createDimension = (
  dimension: Partial<TransferPaymentStreamChartOfAccountDimension> = {}
): EditableDimension => ({
  uiKey: nanoid(),
  label_en: dimension.label_en ?? '',
  label_fr: dimension.label_fr ?? '',
  value: dimension.value ?? ''
})

/** Rebuilds modal state for the active create or update session. */
const resetState = () => {
  state.value = item
    ? {
        id: item.id,
        egcs_tp_streambudget: item.egcs_tp_streambudget,
        egcs_tp_accountingdimensions: item.egcs_tp_accountingdimensions.map(createDimension)
      }
    : {
        egcs_tp_accountingdimensions: [createDimension()]
      }
}

watch([() => item, isOpen], ([, open]) => {
  if (open) resetState()
}, { immediate: true })

/** Persists the current chart of accounts entry. */
const onSubmit = async () => {
  const session = captureSession ? captureSession() : null
  if (!pending.begin(session)) return
  const isUpdate = Boolean(state.value.id)
  const url = isUpdate
    ? `/api/transfer-payments/${profileId}/streams/${streamId}/chart-of-accounts/${state.value.id}`
    : `/api/transfer-payments/${profileId}/streams/${streamId}/chart-of-accounts`

  try {
    await submitChartOfAccount(url, {
      method: isUpdate ? 'PATCH' : 'POST',
      body: {
        egcs_tp_streambudget: state.value.egcs_tp_streambudget,
        egcs_tp_accountingdimensions: state.value.egcs_tp_accountingdimensions.map(({ label_en, label_fr, value }) => ({
          label_en,
          label_fr,
          value
        }))
      }
    })
    if (closeSession) closeSession(session)
    else isOpen.value = false
    emit('save')
  } catch (error) {
    showError(error)
  } finally {
    pending.end(session)
  }
}
</script>

<template>
  <UModal
    v-model:open="isOpen"
    :title="item ? t('transfer_payment.chart_of_accounts.update') : t('transfer_payment.chart_of_accounts.create')"
    :description="t('transfer_payment.chart_of_accounts.description')"
    :ui="{ content: 'sm:max-w-4xl' }">
    <template #body>
      <UForm
        :validate="createValidator(TransferPaymentStreamChartOfAccountSchema)"
        :state="state"
        class="space-y-6"
        @submit="onSubmit">
        <TransferPaymentFieldsTransferPaymentStreamChartOfAccountFields
          v-model="state"
          :budget-fetch-url="budgetFetchUrl" />

        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="isOpen = false">
            {{ t('common.cancel') }}
          </UButton>
          <CommonSaveButton :label="t('common.save')" :loading="isSaving" :disabled="isSaving" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
