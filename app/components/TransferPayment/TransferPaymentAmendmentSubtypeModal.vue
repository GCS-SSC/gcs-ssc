<script setup lang="ts">
import { TransferPaymentAmendmentSubtypesSchema, type TransferPaymentAmendmentSubtypesItem } from '~~/shared/types/schemas'

const { title, submitLabel, amendmentTypesFetchUrl, pending = false } = defineProps<{
  title: string
  submitLabel: string
  amendmentTypesFetchUrl: string
  pending?: boolean
}>()

const open = defineModel<boolean>('open', { default: false })
const state = defineModel<Partial<TransferPaymentAmendmentSubtypesItem>>('state', { required: true })

const emit = defineEmits(['submit'])

const { t } = useI18n()
const { createValidator } = useZodI18n()
const validate = createValidator(TransferPaymentAmendmentSubtypesSchema)

const onSubmit = () => {
  emit('submit')
}
</script>

<template>
  <UModal v-model:open="open" :title="title">
    <template #body>
      <UForm :state="state" :validate="validate" class="space-y-4" @submit="onSubmit">
        <TransferPaymentFieldsTransferPaymentAmendmentSubtypeFields
          :model="state"
          :amendment-types-fetch-url="amendmentTypesFetchUrl"
          amendment-type-field="amendment_type_ids" />
        <div class="flex justify-end gap-2 pt-4">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="open = false" />
          <CommonSaveButton :label="submitLabel" :loading="pending" :disabled="pending" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
