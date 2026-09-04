<script setup lang="ts">
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import type { z } from 'zod'
import type { FormSubmitEvent } from '#ui/types'
import type { TransferPaymentMonitorTypeItem } from '~~/shared/types/schemas/transfer-payment'
import { TransferPaymentMonitorTypeSchema } from '~~/shared/types/schemas/transfer-payment'
import type { CrudModalSessionLifecycle } from '~/composables/useCrudModal'
import { useCrudModalPending } from '~/composables/useCrudModal'

const { t } = useI18n()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const emit = defineEmits<{ saved: [] }>()

const open = defineModel<boolean>('open', { default: false })
const state = defineModel<Partial<TransferPaymentMonitorTypeItem>>('state', { required: true })

const { transferPaymentId, streamId, captureSession, closeSession } = defineProps<{
  transferPaymentId: string
  streamId: string
} & CrudModalSessionLifecycle>()

if (Boolean(captureSession) !== Boolean(closeSession)) {
  throw new Error('TransferPaymentMonitorTypeModal requires captureSession and closeSession together')
}

const isUpdate = computed(() => !!state.value.id)

const schema = TransferPaymentMonitorTypeSchema.omit({ egcs_tp_transferpaymentstream: true })
const validate = createValidator(schema)
const pending = useCrudModalPending(() => captureSession ? captureSession() : null)
const isSaving = pending.isPending

/**
 * Handles the submission of the monitor type form.
 * Determines whether to perform a POST or PATCH request based on the current mode (create/edit).
 * Closes the modal and emits a 'saved' event upon successful completion.
 *
 * @param {FormSubmitEvent<z.infer<typeof schema>>} event - The form submission event containing validated data.
 */
const onSubmit = async (event: FormSubmitEvent<z.infer<typeof schema>>) => {
  const body = event.data
  const session = captureSession ? captureSession() : null
  if (!pending.begin(session)) return
  try {
    const url = isUpdate.value
      ? `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/monitor-types/${state.value.id}`
      : `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/monitor-types`

    const response = await fetch(getClientRequestUrl(url), {
      method: isUpdate.value ? 'PATCH' : 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    })
    if (!response.ok) {
      await throwFetchResponseError(response)
    }

    if (closeSession && !closeSession(session)) return
    if (!closeSession) open.value = false
    emit('saved')
  } catch (error) {
    showError(error)
  } finally {
    pending.end(session)
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="isUpdate ? t('transfer_payment.monitor_type_update') : t('transfer_payment.monitor_type_create')">
    <template #body>
      <UForm :state="state" :validate="validate" class="space-y-4" @submit="onSubmit">
        <TransferPaymentFieldsTransferPaymentMonitorTypeFields :model="state" />

        <div class="flex justify-end gap-2">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="open = false" />
          <CommonSaveButton :label="t('common.save')" :loading="isSaving" :disabled="isSaving" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
