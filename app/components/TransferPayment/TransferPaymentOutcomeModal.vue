<script setup lang="ts">
import { TransferPaymentOutcomeSchema, type TransferPaymentOutcomeItem } from '~~/shared/types/schemas'

const { title, submitLabel, pending = false } = defineProps<{
  title: string
  submitLabel: string
  pending?: boolean
}>()

const open = defineModel<boolean>('open', { default: false })
const state = defineModel<Partial<TransferPaymentOutcomeItem>>('state', { required: true })

const emit = defineEmits(['submit'])

const { t } = useI18n()
const { createValidator } = useZodI18n()
const validate = createValidator(TransferPaymentOutcomeSchema)

const onSubmit = () => {
  emit('submit')
}
</script>

<template>
  <UModal v-model:open="open" :title="title">
    <template #body>
      <UForm :state="state" :validate="validate" class="space-y-4" @submit="onSubmit">
        <TransferPaymentFieldsTransferPaymentOutcomeFields :model="state" />
        <div class="flex justify-end gap-2 pt-4">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="open = false" />
          <CommonSaveButton :label="submitLabel" :loading="pending" :disabled="pending" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
