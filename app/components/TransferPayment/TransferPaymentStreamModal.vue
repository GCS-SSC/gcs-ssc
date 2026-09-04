<script setup lang="ts">
import { TransferPaymentStreamSchema, type TransferPaymentStreamItem } from '~~/shared/types/schemas'

const { title, submitLabel, parentStreams, pending = false } = defineProps<{
  title: string
  submitLabel: string
  parentStreams: Array<{ id: string; egcs_tp_name_en: string; egcs_tp_name_fr: string }>
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
</script>

<template>
  <UModal v-model:open="open" :title="title" :description="t('common.form_dialog_description')">
    <template #body>
      <UForm :state="state" :validate="validate" class="space-y-4" @submit="onSubmit">
        <TransferPaymentFieldsTransferPaymentStreamFields :model="state" :parent-streams="parentStreams" />
        <div class="flex justify-end gap-2 pt-4">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="open = false" />
          <CommonSaveButton :label="submitLabel" :loading="pending" :disabled="pending" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
