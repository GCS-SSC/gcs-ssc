<script setup lang="ts">
import type { ActionContext } from '~/composables/useActionContext'
import { watch } from 'vue'
import type { FormSubmitEvent } from '#ui/types'
import type { z } from 'zod'
import { TransferPaymentStreamChartOfAccountSchema } from '~~/shared/types/schemas/transfer-payment'
import type { CrudModalSessionLifecycle } from '~/composables/useCrudModal'
import { useCrudModalPending } from '~/composables/useCrudModal'
import { useModalSession } from '~/composables/useModalSession'
import { useFormSession } from '~/composables/useFormSession'

const isOpen = defineModel<boolean>({ required: true })
const { streamId, profileId, captureSession, closeSession, actionContext, refreshCollection } = defineProps<{
  actionContext: ActionContext
  refreshCollection?: () => Promise<void>
  streamId: string
  profileId: string
} & CrudModalSessionLifecycle>()
const emit = defineEmits<{ save: [] }>()
const { t } = useI18n()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const modalSession = useModalSession()
watch([
  () => isOpen.value,
  () => profileId,
  () => streamId,
  () => captureSession ? captureSession() : null
], () => {
  modalSession.isOpen.value = false
  modalSession.isOpen.value = isOpen.value
}, { immediate: true, flush: 'sync' })
const pending = useCrudModalPending(() => captureSession ? captureSession() : modalSession.captureSession())
const state = ref<{ egcs_tp_agencychartofaccount?: string }>({})
const submitChartLink: (url: string, options: {
  method: 'POST'
  body: z.infer<typeof TransferPaymentStreamChartOfAccountSchema>
}) => Promise<unknown> = $fetch
watch(isOpen, open => {
  if (open) state.value = {}
}, { immediate: true })

/**
 * Saves the selected Agency chart association for this Stream.
 *
 * @param event - Validated link form submission.
 */
const onSubmit = async (event: FormSubmitEvent<z.infer<typeof TransferPaymentStreamChartOfAccountSchema>>) => {
  const operation = actionContext.capture()
  const refreshCommittedCollection = refreshCollection
  if (!operation) return
  const session = captureSession ? captureSession() : modalSession.captureSession()
  const localSession = modalSession.captureSession()
  const ownsSession = () => operation.isCurrent() && modalSession.isCurrentSession(localSession)
    && (!captureSession || captureSession() === session)
  if (modalSession.isDisposed() || !pending.begin(session)) return
  try {
    if (!operation.canDispatch()) return
    await submitChartLink(`/api/transfer-payments/${profileId}/streams/${streamId}/chart-of-accounts`, {
      method: 'POST', body: event.data
    })
    if (!operation.isCurrent()) return
    if (ownsSession() && (!closeSession || closeSession(session))) {
      if (!closeSession) isOpen.value = false
      emit('save')
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
  <UModal v-model:open="isOpen" :title="t('transfer_payment.chart_of_accounts.create')" data-field-scope="transfer-payment.stream-chart-of-account-modal">
    <template #body>
      <UForm v-bind="formSession" :state="state" :validate="createValidator(TransferPaymentStreamChartOfAccountSchema)" class="space-y-4">
        <UFormField :label="t('transfer_payment.chart_of_accounts.title')" name="egcs_tp_agencychartofaccount" required>
          <CommonServerLookupSelect
            v-model="state.egcs_tp_agencychartofaccount"
            :fetch-url="`/api/transfer-payments/${profileId}/streams/lookups/chart-of-accounts`"
            value-key="id"
            label-en-key="label_en"
            label-fr-key="label_fr" />
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="isOpen = false" />
          <CommonSaveButton :label="t('common.save')" :loading="pending.isPending.value" :disabled="pending.isPending.value" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
