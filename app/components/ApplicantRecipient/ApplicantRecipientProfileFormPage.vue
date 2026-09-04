<script setup lang="ts">
import { ApplicantRecipientProfileSchema } from '~~/shared/types/schemas'
import type { ApplicantRecipientProfileForm } from '~~/shared/types/applicant-recipient-ui'

const {
  submitLabel,
  cancelLabel,
  leadAgencyPermissionAction,
  compact = false,
  pending = false
} = defineProps<{
  submitLabel: string
  cancelLabel: string
  leadAgencyPermissionAction: 'create' | 'update'
  compact?: boolean
  pending?: boolean
}>()

const model = defineModel<ApplicantRecipientProfileForm>('model', { required: true })

const emit = defineEmits<{
  (event: 'submit' | 'cancel'): void
}>()

const { createValidator } = useZodI18n()
const validate = createValidator(ApplicantRecipientProfileSchema)

const onSubmit = () => {
  emit('submit')
}
</script>

<template>
  <div :class="[compact ? 'mx-auto w-full max-w-7xl py-4' : 'w-full py-6']">
    <UForm :state="model" :validate="validate" class="space-y-8" @submit="onSubmit">
      <ApplicantRecipientFieldsApplicantRecipientProfileFields
        v-model:model="model"
        :lead-agency-permission-action="leadAgencyPermissionAction" />

      <div class="flex flex-col-reverse justify-end gap-3 border-t border-zinc-200 pt-6 sm:flex-row dark:border-zinc-800">
        <UButton
          color="neutral"
          variant="ghost"
          :label="cancelLabel"
          :disabled="pending"
          @click="emit('cancel')" />
        <CommonSaveButton :label="submitLabel" :loading="pending" :disabled="pending" />
      </div>
    </UForm>
  </div>
</template>
