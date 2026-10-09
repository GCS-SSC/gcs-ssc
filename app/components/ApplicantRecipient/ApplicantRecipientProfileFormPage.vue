<script setup lang="ts">
import { ApplicantRecipientProfileSchema } from '~~/shared/types/schemas'
import type { ApplicantRecipientProfileForm, ApplicantRecipientProfileRow } from '~~/shared/types/applicant-recipient-ui'

const {
  submitLabel,
  cancelLabel,
  leadAgencyPermissionAction,
  pending = false,
  persistedProfile
} = defineProps<{
  submitLabel: string
  cancelLabel: string
  leadAgencyPermissionAction: 'create' | 'update'
  pending?: boolean
  persistedProfile?: ApplicantRecipientProfileRow
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
  <div class="w-full">
    <UForm :state="model" :validate="validate" class="space-y-8" @submit="onSubmit">
      <ApplicantRecipientFieldsApplicantRecipientProfileFields
        v-model:model="model"
        :persisted-profile="persistedProfile"
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
