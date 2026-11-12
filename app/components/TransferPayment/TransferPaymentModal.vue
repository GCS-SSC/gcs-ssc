<script setup lang="ts">
import { watch } from 'vue'
import { useModalSession } from '~/composables/useModalSession'
import { useFormSession } from '~/composables/useFormSession'
import type { ActionContext } from '~/composables/useActionContext'
import { TransferPaymentProfileSchema, type TransferPaymentProfileItem } from '~~/shared/types/schemas'

type TransferPaymentProfileForm = Partial<Omit<TransferPaymentProfileItem, 'egcs_tp_datestart' | 'egcs_tp_dateend'> & {
  egcs_tp_datestart?: string
  egcs_tp_dateend?: string
}>

const { title, submitLabel, fixedAgencyId, pending = false, actionContext } = defineProps<{
  title: string
  submitLabel: string
  fixedAgencyId?: string
  pending?: boolean
  actionContext: ActionContext
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
const modalSession = useModalSession()
watch([() => open.value, () => state.value, () => fixedAgencyId], () => {
  modalSession.isOpen.value = false
  modalSession.isOpen.value = open.value && state.value !== null
}, { immediate: true, flush: 'sync' })
const formSession = useFormSession({ owner: modalSession, action: { kind: 'remote', context: () => actionContext }, submit: onSubmit })
</script>

<template>
  <UModal v-model:open="open" :title="title" :description="t('common.form_dialog_description')" :ui="{ content: 'sm:max-w-4xl' }" data-field-scope="transfer-payment.modal">
    <template #body>
      <UForm v-if="open" v-bind="formSession" :state="state" :validate="validate" :disabled="pending" class="space-y-4">
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
