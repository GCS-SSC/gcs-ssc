<script setup lang="ts">
import type { ActionContext } from '~/composables/useActionContext'
import { watch } from 'vue'
import { useModalSession } from '~/composables/useModalSession'
import { useFormSession } from '~/composables/useFormSession'
import type { TransferPaymentStreamRow } from '~~/shared/types/transfer-payment-ui'
import { TransferPaymentStreamSchema, type TransferPaymentStreamItem } from '~~/shared/types/schemas'

const { title, submitLabel, programId, persistedStream, persistedProgramId, pending = false, actionContext } = defineProps<{
  actionContext: ActionContext
  title: string
  submitLabel: string
  programId: string
  persistedStream?: TransferPaymentStreamRow
  persistedProgramId?: string
  pending?: boolean
}>()

const open = defineModel<boolean>('open', { default: false })
const state = defineModel<Partial<TransferPaymentStreamItem>>('state', { required: true })

const emit = defineEmits(['submit'])

const { t } = useI18n()
const { createValidator } = useZodI18n()
const validate = createValidator(TransferPaymentStreamSchema)

const onSubmit = () => {
  emit('submit')
}
const modalSession = useModalSession()
watch([() => open.value, () => state.value, () => programId], () => {
  modalSession.isOpen.value = false
  modalSession.isOpen.value = open.value && state.value !== null
}, { immediate: true, flush: 'sync' })
const formSession = useFormSession({ owner: modalSession, action: { kind: 'remote', context: () => actionContext }, submit: onSubmit })
</script>

<template>
  <UModal v-model:open="open" :title="title" :description="t('common.form_dialog_description')" :ui="{ content: 'sm:max-w-4xl' }">
    <template #body>
      <UForm v-bind="formSession" :state="state" :validate="validate" :disabled="pending" class="space-y-4">
        <TransferPaymentFieldsTransferPaymentStreamFields :model="state" :program-id="programId" :persisted-stream="persistedStream" :persisted-program-id="persistedProgramId" is-stacked />
        <div class="flex justify-end gap-2 pt-4">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="open = false" />
          <CommonSaveButton :label="submitLabel" :loading="pending" :disabled="pending" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
