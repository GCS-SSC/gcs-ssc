<script setup lang="ts">
import { TransferPaymentProfileSchema, type TransferPaymentProfileItem } from '~~/shared/types/schemas'

type TransferPaymentProfileForm = Partial<Omit<TransferPaymentProfileItem, 'egcs_tp_datestart' | 'egcs_tp_dateend'> & {
  egcs_tp_datestart?: string
  egcs_tp_dateend?: string
}>

const { title, submitLabel, fixedAgencyId, pending = false } = defineProps<{
  title: string
  submitLabel: string
  fixedAgencyId?: string
  pending?: boolean
}>()

const open = defineModel<boolean>('open', { default: false })
const state = defineModel<TransferPaymentProfileForm>('state', { required: true })

const emit = defineEmits(['submit'])

const { t } = useI18n()
const { createValidator } = useZodI18n()
const validate = createValidator(TransferPaymentProfileSchema)

const isEditing = computed(() => !!state.value?.id)
const isAgencyLocked = computed(() => isEditing.value || !!fixedAgencyId)

watchEffect(() => {
  if (fixedAgencyId && !isEditing.value) {
    state.value.egcs_tp_agency = fixedAgencyId
  }
})

const onSubmit = () => {
  emit('submit')
}
</script>

<template>
  <UModal v-model:open="open" :title="title" :description="t('common.form_dialog_description')" :ui="{ content: 'sm:max-w-4xl' }">
    <template #body>
      <UForm v-if="open" :state="state" :validate="validate" class="space-y-4" @submit="onSubmit">
        <TransferPaymentFieldsTransferPaymentProfileFields
          v-model:model="state"
          is-stacked
          :is-agency-locked="isAgencyLocked" />
        <UFormField :label="t('common.active')" name="egcs_tp_active">
          <USwitch v-model="state.egcs_tp_active" :label="t('common.active')" />
        </UFormField>
        <div class="flex justify-end gap-2 pt-4">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="open = false" />
          <CommonSaveButton :label="submitLabel" :loading="pending" :disabled="pending" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
