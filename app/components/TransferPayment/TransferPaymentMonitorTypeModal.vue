<script setup lang="ts">
import type { ActionContext } from '~/composables/useActionContext'
import { watch } from 'vue'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import type { z } from 'zod'
import type { FormSubmitEvent } from '#ui/types'
import type { TransferPaymentMonitorTypeItem } from '~~/shared/types/schemas/transfer-payment'
import { TransferPaymentMonitorTypeSchema } from '~~/shared/types/schemas/transfer-payment'
import type { CrudModalSessionLifecycle } from '~/composables/useCrudModal'
import { useCrudModalPending } from '~/composables/useCrudModal'
import { useModalSession } from '~/composables/useModalSession'
import { useFormSession } from '~/composables/useFormSession'

const { t } = useI18n()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const emit = defineEmits<{ saved: [] }>()

const open = defineModel<boolean>('open', { default: false })
const state = defineModel<Partial<TransferPaymentMonitorTypeItem>>('state', { required: true })

const { transferPaymentId, streamId, captureSession, closeSession, actionContext, refreshCollection } = defineProps<{
  actionContext: ActionContext
  refreshCollection?: () => Promise<void>
  transferPaymentId: string
  streamId: string
  agencyId: string
} & CrudModalSessionLifecycle>()

if (Boolean(captureSession) !== Boolean(closeSession)) {
  throw new Error('TransferPaymentMonitorTypeModal requires captureSession and closeSession together')
}

const schema = TransferPaymentMonitorTypeSchema.strip()
const validate = createValidator(schema)
const modalSession = useModalSession()
watch([
  () => open.value,
  () => transferPaymentId,
  () => streamId,
  () => state.value,
  () => captureSession ? captureSession() : null
], () => {
  modalSession.isOpen.value = false
  modalSession.isOpen.value = open.value
}, { immediate: true, flush: 'sync' })
const pending = useCrudModalPending(() => captureSession ? captureSession() : modalSession.captureSession())
const isSaving = pending.isPending

/**
 * Handles the submission of the monitor type form.
 * Closes the modal and emits a 'saved' event upon successful completion.
 *
 * @param {FormSubmitEvent<z.infer<typeof schema>>} event - The form submission event containing validated data.
 */
const onSubmit = async (event: FormSubmitEvent<z.infer<typeof schema>>) => {
  const body = event.data
  const operation = actionContext.capture()
  const refreshCommittedCollection = refreshCollection
  if (!operation) return
  const session = captureSession ? captureSession() : modalSession.captureSession()
  const localSession = modalSession.captureSession()
  const ownsSession = () => operation.isCurrent() && modalSession.isCurrentSession(localSession)
    && (!captureSession || captureSession() === session)
  if (modalSession.isDisposed() || !pending.begin(session)) return
  try {
    const url = `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/monitor-types`

    if (!operation.canDispatch()) return
    const response = await fetch(getClientRequestUrl(url), {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    })
    if (!response.ok) {
      await throwFetchResponseError(response)
    }

    if (!operation.isCurrent()) return
    if (ownsSession() && (!closeSession || closeSession(session))) {
      if (!closeSession) open.value = false
      emit('saved')
    }
    if (operation.isCurrent()) await refreshCommittedCollection?.()
  } catch (error) {
    if (ownsSession()) showError(error)
  } finally {
    pending.end(session)
  }
}
const formSession = useFormSession({ owner: modalSession, action: { kind: 'remote', context: () => actionContext }, submit: onSubmit })
</script>

<template>
  <UModal v-model:open="open" :title="t('transfer_payment.monitor_type_create')" data-field-scope="transfer-payment.monitor-type-modal">
    <template #body>
      <UForm v-bind="formSession" :state="state" :validate="validate" class="space-y-4">
        <UFormField :label="t('transfer_payment.monitor_types')" name="egcs_tp_agencymonitortype" required>
          <CommonServerLookupSelect
            v-model="state.egcs_tp_agencymonitortype"
            :fetch-url="`/api/transfer-payments/${transferPaymentId}/streams/${streamId}/lookups/monitor-types`"
            :include-deleted-query="false"
            selected-values-query-key="ids"
            value-key="id"
            label-en-key="egcs_ay_name_en"
            label-fr-key="egcs_ay_name_fr" />
        </UFormField>

        <div class="flex justify-end gap-2">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="open = false" />
          <CommonSaveButton :label="t('common.save')" :loading="isSaving" :disabled="isSaving" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
